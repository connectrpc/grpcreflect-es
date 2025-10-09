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
  create,
  type DescExtension,
  type DescFile,
  type DescMessage,
  type FileRegistry,
  type MessageInitShape,
  toBinary,
} from "@bufbuild/protobuf";
import { Code, type ServiceImpl } from "@connectrpc/connect";
import { ServerReflectionResponseSchema } from "./gen/grpc/reflection/v1/reflection_pb.js";
import type {
  ExtensionRequest,
  ServerReflection,
  ServerReflectionRequest,
  ServiceResponseSchema,
} from "./gen/grpc/reflection/v1/reflection_pb.js";
import { FileDescriptorProtoSchema } from "@bufbuild/protobuf/wkt";

type MessageResponse = MessageInitShape<
  typeof ServerReflectionResponseSchema
>["messageResponse"];

export class Reflector implements ServiceImpl<typeof ServerReflection> {
  private extensionsByExtendee = new Map<string, DescExtension[]>();
  constructor(private registry: FileRegistry) {
    const fill = (exts: DescExtension[]) => {
      for (const ext of exts) {
        let allExt = this.extensionsByExtendee.get(ext.extendee.typeName);
        if (allExt === undefined) {
          allExt = [];
          this.extensionsByExtendee.set(ext.extendee.typeName, allExt);
        }
        allExt.push(ext);
      }
    };
    const fillMsg = (msg: DescMessage) => {
      fill(msg.nestedExtensions);
      for (const nestedMsg of msg.nestedMessages) {
        fillMsg(nestedMsg);
      }
    };
    for (const file of registry.files) {
      fill(file.extensions);
      for (const msg of file.messages) {
        fillMsg(msg);
      }
    }
  }

  async *serverReflectionInfo(stream: AsyncIterable<ServerReflectionRequest>) {
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
      }
      yield create(ServerReflectionResponseSchema, {
        validHost: req.host,
        originalRequest: req,
        messageResponse,
      });
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
    const desc = this.registry.get(symbol);
    if (desc === undefined) {
      return createNotFoundResponse("file not found");
    }
    return {
      case: "fileDescriptorResponse",
      value: {
        fileDescriptorProto: serializeWithImports(desc?.file, sent),
      },
    };
  }

  private handleFileContainingExtension(
    sent: Set<string>,
    extension: ExtensionRequest,
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
        fileDescriptorProto: serializeWithImports(desc?.file, sent),
      },
    };
  }

  private handleAllExtensionNumbersOfType(typeName: string): MessageResponse {
    const extensions = this.extensionsByExtendee.get(typeName);
    if (extensions === undefined) {
      return createNotFoundResponse("type not found");
    }
    const extensionNumbers: number[] = [];
    for (const ext of extensions) {
      extensionNumbers.push(ext.number);
    }
    return {
      case: "allExtensionNumbersResponse",
      value: {
        baseTypeName: typeName,
        extensionNumber: extensionNumbers,
      },
    };
  }

  private handleListServices(): MessageResponse {
    const services: MessageInitShape<typeof ServiceResponseSchema>[] = [];
    for (const file of this.registry.files) {
      for (const service of file.services) {
        services.push({ name: service.typeName });
      }
    }
    return {
      case: "listServicesResponse",
      value: { service: services },
    };
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
