// Copyright 2025-2026 The Connect Authors
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
  type DescFile,
  type DescService,
  type FileRegistry,
  type MessageInitShape,
  toBinary,
} from "@bufbuild/protobuf";
import { FileDescriptorProtoSchema } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import {
  ServerReflection,
  type ServerReflectionRequest,
  type ServerReflectionResponseSchema,
} from "./gen/grpc/reflection/v1/reflection_pb.js";
import * as alpha from "./gen/grpc/reflection/v1alpha/reflection_pb.js";
import { createFileRegistry } from "./registry.js";

/**
 * Options for registerReflectionServices.
 */
export interface ReflectionServiceOptions {
  /**
   * Additional files to make available to clients.
   *
   * The files of all services registered on the router, and all of their
   * imports, are always included. Use this option for files that no service
   * imports, for example a file that declares custom options:
   *
   * ```ts
   * registerReflectionServices(router, {
   *   files: [file_example_v1_options],
   * });
   * ```
   */
  files?: readonly DescFile[] | undefined;
  /**
   * The services to list, given as service descriptors or fully qualified
   * names. By default, all services registered on the router are listed,
   * including the reflection services.
   *
   * This option only affects listing services. Clients can still describe
   * any type in the available files, including services that aren't listed.
   *
   * ```ts
   * registerReflectionServices(router, {
   *   services: [UserService],
   * });
   * ```
   */
  services?: readonly (DescService | string)[] | undefined;
}

/**
 * Registers the gRPC server reflection services on the given router, so that
 * tools like grpcurl, grpcui, and buf curl can list and describe its
 * services. Both `grpc.reflection.v1` and the older `grpc.reflection.v1alpha`
 * are registered.
 *
 * The reflection services describe all services registered on the router,
 * including services registered after this call:
 *
 * ```ts
 * const handler = connectNodeAdapter({
 *   routes(router) {
 *     router.service(UserService, impl);
 *     registerReflectionServices(router);
 *   },
 * });
 * ```
 *
 * Clients call reflection with the gRPC protocol over HTTP/2, so the router
 * must be served with HTTP/2, for example with `node:http2`.
 *
 * @see https://github.com/grpc/grpc/blob/master/doc/server-reflection.md
 */
export function registerReflectionServices(
  router: ConnectRouter,
  options: ReflectionServiceOptions = {},
): void {
  // Services can be registered after this call, so we create the reflector
  // on the first request, when all routes are known.
  let reflector: Reflector | undefined;
  const getReflector = () => {
    reflector ??= createReflector(router, options);
    return reflector;
  };
  router.service(ServerReflection, {
    serverReflectionInfo: (requests) =>
      serverReflectionInfo(getReflector(), requests),
  });
  router.service(alpha.ServerReflection, {
    serverReflectionInfo: (requests) =>
      serverReflectionInfo(getReflector(), requests),
  });
}

/**
 * Implements the bidi streaming RPC of both v1 and v1alpha.
 */
async function* serverReflectionInfo<
  Req extends ServerReflectionRequest | alpha.ServerReflectionRequest,
>(reflector: Reflector, requests: AsyncIterable<Req>) {
  const sent = new Set<string>();
  for await (const req of requests) {
    yield {
      validHost: req.host,
      originalRequest: req,
      messageResponse: reflector.handle(req.messageRequest, sent),
    };
  }
}

function createReflector(
  router: ConnectRouter,
  options: ReflectionServiceOptions,
): Reflector {
  // The router has one handler per method, so services repeat.
  const routerServices = new Map<string, DescService>();
  for (const { service } of router.handlers) {
    routerServices.set(service.typeName, service);
  }
  const registry = createFileRegistry([
    ...(options.files ?? []),
    ...Array.from(routerServices.values(), (service) => service.file),
    ...(options.services ?? []).flatMap((service) =>
      typeof service === "string" ? [] : [service.file],
    ),
  ]);
  const exposedServices =
    options.services?.map((service) => {
      const typeName = typeof service === "string" ? service : service.typeName;
      if (registry.getService(typeName) === undefined) {
        throw new ConnectError(
          `grpcreflect: Trying to expose a service "${typeName}" that is not in the registry`,
          Code.Internal,
        );
      }
      return typeName;
    }) ?? Array.from(routerServices.keys()).sort();
  return new Reflector(registry, exposedServices);
}

// The v1 and v1alpha messages are structurally identical, so a single
// implementation can serve both.
type MessageRequest =
  | ServerReflectionRequest["messageRequest"]
  | alpha.ServerReflectionRequest["messageRequest"];

// biome-ignore format: Long type
type MessageResponse = NonNullable<
  & MessageInitShape<typeof ServerReflectionResponseSchema>["messageResponse"]
  & MessageInitShape<typeof alpha.ServerReflectionResponseSchema>["messageResponse"]
>;

class Reflector {
  private readonly registry: FileRegistry;
  // Fully qualified names of all symbols, mapped to the file declaring them.
  private readonly symbols = new Map<string, DescFile>();
  // Fully qualified names of all messages, mapped to their extension numbers.
  private readonly extensionNumbers = new Map<string, number[]>();
  private readonly exposedServices: string[];

  constructor(registry: FileRegistry, exposedServices: string[]) {
    this.registry = registry;
    this.exposedServices = exposedServices;
    for (const desc of registry) {
      this.symbols.set(desc.typeName, desc.file);
      switch (desc.kind) {
        case "message":
          for (const member of [...desc.fields, ...desc.oneofs]) {
            this.symbols.set(`${desc.typeName}.${member.name}`, desc.file);
          }
          break;
        case "enum": {
          // Enum values are siblings of their enum, not children.
          const scope = desc.typeName.slice(
            0,
            desc.typeName.length - desc.name.length,
          );
          for (const value of desc.values) {
            this.symbols.set(scope + value.name, desc.file);
          }
          break;
        }
        case "service":
          for (const method of desc.methods) {
            this.symbols.set(`${desc.typeName}.${method.name}`, desc.file);
          }
          break;
        case "extension": {
          const numbers = this.extensionNumbers.get(desc.extendee.typeName);
          if (numbers === undefined) {
            this.extensionNumbers.set(desc.extendee.typeName, [desc.number]);
          } else {
            numbers.push(desc.number);
          }
          break;
        }
      }
    }
  }

  handle(messageRequest: MessageRequest, sent: Set<string>): MessageResponse {
    switch (messageRequest.case) {
      case "fileByFilename":
        return this.fileDescriptorResponse(
          this.registry.getFile(messageRequest.value),
          sent,
          "file not found",
        );
      case "fileContainingSymbol":
        return this.fileDescriptorResponse(
          this.symbols.get(messageRequest.value),
          sent,
          "symbol not found",
        );
      case "fileContainingExtension": {
        const { containingType, extensionNumber } = messageRequest.value;
        const extendee = this.registry.getMessage(containingType);
        const extension =
          extendee && this.registry.getExtensionFor(extendee, extensionNumber);
        return this.fileDescriptorResponse(
          extension?.file,
          sent,
          "extension not found",
        );
      }
      case "allExtensionNumbersOfType": {
        const typeName = messageRequest.value;
        if (this.registry.getMessage(typeName) === undefined) {
          return notFound("type not found");
        }
        return {
          case: "allExtensionNumbersResponse",
          value: {
            baseTypeName: typeName,
            extensionNumber: this.extensionNumbers.get(typeName) ?? [],
          },
        };
      }
      case "listServices":
        return {
          case: "listServicesResponse",
          value: {
            service: this.exposedServices.map((name) => ({ name })),
          },
        };
      default:
        throw new ConnectError(
          "unsupported reflection message request",
          Code.InvalidArgument,
        );
    }
  }

  private fileDescriptorResponse(
    file: DescFile | undefined,
    sent: Set<string>,
    errorMessage: string,
  ): MessageResponse {
    if (file === undefined) {
      return notFound(errorMessage);
    }
    return {
      case: "fileDescriptorResponse",
      value: { fileDescriptorProto: serializeWithImports(file, sent) },
    };
  }
}

function notFound(errorMessage: string): MessageResponse {
  return {
    case: "errorResponse",
    value: { errorCode: Code.NotFound, errorMessage },
  };
}

/**
 * Serializes the given file, and all of its transitive dependencies that have
 * not been sent on this stream yet. The requested file is always included.
 */
function serializeWithImports(root: DescFile, sent: Set<string>): Uint8Array[] {
  const res: Uint8Array[] = [];
  const visit = (file: DescFile) => {
    sent.add(file.name);
    res.push(toBinary(FileDescriptorProtoSchema, file.proto));
    for (const dep of file.dependencies) {
      if (!sent.has(dep.name)) {
        visit(dep);
      }
    }
  };
  visit(root);
  return res;
}
