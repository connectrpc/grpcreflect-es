// Copyright 2025 The Connect Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  type DescExtension,
  type DescFile,
  type DescService,
  type FileRegistry,
  type MessageInitShape,
  toBinary,
} from "@bufbuild/protobuf";
import {
  Code,
  ConnectError,
  type ConnectRouter,
  type ServiceImpl,
} from "@connectrpc/connect";
import {
  ServerReflection,
  type ExtensionRequest,
  type ServerReflectionRequest,
  type ServiceResponseSchema,
  type ServerReflectionResponseSchema,
} from "./gen/grpc/reflection/v1/reflection_pb.js";
import { FileDescriptorProtoSchema } from "@bufbuild/protobuf/wkt";
import { createFileRegistry } from "./registry.js";
import * as alpha from "./gen/grpc/reflection/v1alpha/reflection_pb.js";

/**
 * Options that can be passed to registerReflectionServices.
 */
export interface ReflectionServiceOptions {
  /**
   * The DescFile array to source file descriptors.
   */
  files: DescFile[];
  /**
   * The services to expose. Array of DescService or the fully qualified name of a service.
   * The full descriptors of the named services should be part of the registry.
   *
   * This option only affects `listServices` operation of the reflection service. All other operations
   * will use the registry to resolve symbols and files.
   *
   * Optional, default is to expose all services available in the registry.
   */
  services?: (DescService | string)[];
}

/**
 *  Registers the gRPC reflection service on the given router.
 */
export function registerReflectionServices(
  router: ConnectRouter,
  options: ReflectionServiceOptions,
) {
  const reflector = new Reflector(
    createFileRegistry(options.files),
    options.services,
  );
  router.service(ServerReflection, reflector);
  router.service(alpha.ServerReflection, reflector);
}

// biome-ignore format: Long type
type ResponseCommon = 
  MessageInitShape<typeof ServerReflectionResponseSchema> &
  MessageInitShape<typeof alpha.ServerReflectionResponseSchema>

type MessageResponse = ResponseCommon["messageResponse"];

class Reflector
  implements
    ServiceImpl<typeof ServerReflection>,
    ServiceImpl<typeof ServerReflection>
{
  private allExtensions: DescExtension[];
  private exposedServices: MessageInitShape<typeof ServiceResponseSchema>[];
  constructor(
    private registry: FileRegistry,
    services: ReflectionServiceOptions["services"],
  ) {
    const allDesc = Array.from(registry);
    this.allExtensions = allDesc.filter((desc) => desc.kind === "extension");
    if (services !== undefined) {
      this.exposedServices = services?.map((descOrName) => {
        if (typeof descOrName !== "string") {
          descOrName = descOrName.typeName;
        } else if (registry.getService(descOrName) === undefined) {
          throw new Error(
            `grpcreflect: Trying to expose a service "${descOrName}" that is not in the registry`,
          );
        }
        return { name: descOrName };
      });
    } else {
      this.exposedServices = allDesc
        .filter((desc) => desc.kind === "service")
        .map((desc) => ({ name: desc.typeName }));
    }
  }

  async *serverReflectionInfo(
    stream:
      | AsyncIterable<ServerReflectionRequest>
      | AsyncIterable<alpha.ServerReflectionRequest>,
  ): AsyncIterable<ResponseCommon> {
    const sent = new Set<string>();
    for await (const req of stream) {
      let messageResponse: MessageResponse;
      switch (req.messageRequest.case) {
        case "fileByFilename":
          messageResponse = this.handleFileByFilename(
            sent,
            req.messageRequest.value,
          );
          break;
        case "fileContainingSymbol":
          messageResponse = this.handleFileContainingSymbol(
            sent,
            req.messageRequest.value,
          );
          break;
        case "fileContainingExtension":
          messageResponse = this.handleFileContainingExtension(
            sent,
            req.messageRequest.value,
          );
          break;
        case "allExtensionNumbersOfType":
          messageResponse = this.handleAllExtensionNumbersOfType(
            req.messageRequest.value,
          );
          break;
        case "listServices":
          messageResponse = this.handleListServices();
          break;
        default:
          throw new ConnectError(
            "unsupported reflection message request",
            Code.InvalidArgument,
          );
      }
      yield {
        messageResponse,
        validHost: req.host,
        originalRequest: req as unknown as ResponseCommon["originalRequest"],
      };
    }
  }

  private handleFileByFilename(
    sent: Set<string>,
    filename: string,
  ): MessageResponse {
    const root = this.registry.getFile(filename);
    if (root === undefined) {
      return createNotFoundResponse("file not found");
    }
    return {
      case: "fileDescriptorResponse",
      value: { fileDescriptorProto: serializeWithImports(root, sent) },
    };
  }

  private handleFileContainingSymbol(
    sent: Set<string>,
    symbol: string,
  ): MessageResponse {
    let desc = this.registry.get(symbol);
    if (desc === undefined) {
      // Could be a method
      const lastDot = symbol.lastIndexOf(".");
      if (lastDot < 0) {
        return createNotFoundResponse("symbol not found");
      }
      desc = this.registry.getService(symbol.substring(0, lastDot));
      const methodName = symbol.substring(lastDot + 1);
      if (
        desc === undefined ||
        desc.methods.find((m) => m.name === methodName) === undefined
      ) {
        return createNotFoundResponse("symbol not found");
      }
    }
    return {
      case: "fileDescriptorResponse",
      value: {
        fileDescriptorProto: serializeWithImports(desc.file, sent),
      },
    };
  }

  private handleFileContainingExtension(
    sent: Set<string>,
    extension: ExtensionRequest | alpha.ExtensionRequest,
  ): MessageResponse {
    const extendee = this.registry.getMessage(extension.containingType);
    const desc =
      extendee !== undefined
        ? this.registry.getExtensionFor(extendee, extension.extensionNumber)
        : undefined;
    if (desc === undefined) {
      return createNotFoundResponse("file not found");
    }
    return {
      case: "fileDescriptorResponse",
      value: {
        fileDescriptorProto: serializeWithImports(desc.file, sent),
      },
    };
  }

  private handleAllExtensionNumbersOfType(typeName: string): MessageResponse {
    const extendee = this.registry.getMessage(typeName);
    if (extendee === undefined) {
      return createNotFoundResponse("type not found");
    }
    return {
      case: "allExtensionNumbersResponse",
      value: {
        baseTypeName: typeName,
        extensionNumber: this.allExtensions
          .filter((e) => e.extendee.typeName === typeName)
          .map((e) => e.number),
      },
    };
  }

  private handleListServices(): MessageResponse {
    return {
      case: "listServicesResponse",
      value: { service: this.exposedServices },
    } as MessageResponse;
  }
}

function createNotFoundResponse(errorMessage: string): MessageResponse {
  return {
    case: "errorResponse",
    value: { errorCode: Code.NotFound, errorMessage },
  };
}

function serializeWithImports(root: DescFile, sent: Set<string>): Uint8Array[] {
  const res: Uint8Array[] = [];
  sent.add(root.name);
  res.push(toBinary(FileDescriptorProtoSchema, root.proto));
  for (const file of root.dependencies) {
    if (sent.has(file.name)) {
      continue;
    }
    res.push(...serializeWithImports(file, sent));
  }
  return res;
}
