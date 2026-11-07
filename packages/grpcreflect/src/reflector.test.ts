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

import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suite, test } from "node:test";
import {
  create,
  createFileRegistry,
  type DescFile,
  equals,
  fromBinary,
  type MessageInitShape,
  toBinary,
} from "@bufbuild/protobuf";
import {
  FileDescriptorProtoSchema,
  FileDescriptorSetSchema,
} from "@bufbuild/protobuf/wkt";
import {
  Code,
  ConnectError,
  type ConnectRouter,
  createClient,
  createRouterTransport,
} from "@connectrpc/connect";
import { createAsyncIterable } from "@connectrpc/connect/protocol";
import {
  file_grpc_reflection_v1_reflection,
  ServerReflection,
  ServerReflectionRequestSchema,
  type ServerReflectionResponse,
  ServerReflectionResponseSchema,
} from "./gen/grpc/reflection/v1/reflection_pb.js";
import * as alpha from "./gen/grpc/reflection/v1alpha/reflection_pb.js";
import {
  file_test_standalone_standalone,
  StandaloneService,
} from "./gen/test/standalone/standalone_pb.js";
import { file_test_v2_extensions } from "./gen/test/v2/extensions_pb.js";
import { file_test_v2_types } from "./gen/test/v2/types_pb.js";
import { file_test_v3_service, TestService } from "./gen/test/v3/service_pb.js";
import { registerReflectionServices } from "./reflector.js";

/**
 * Registers the test services, and the reflection services. The file with
 * extensions is not used by any service, so it is passed explicitly.
 */
function defaultRoutes(router: ConnectRouter): void {
  router.service(TestService, {});
  router.service(StandaloneService, {});
  registerReflectionServices(router, { files: [file_test_v2_extensions] });
}

// All services registered by defaultRoutes, in sorted order.
const allServices = [
  { name: "grpc.reflection.v1.ServerReflection" },
  { name: "grpc.reflection.v1alpha.ServerReflection" },
  { name: "test.standalone.StandaloneService" },
  { name: "test.v3.TestService" },
];

// biome-ignore format: Long type
type RequestInit =
  & MessageInitShape<typeof ServerReflectionRequestSchema>
  & MessageInitShape<typeof alpha.ServerReflectionRequestSchema>;

type ResponseInit = Pick<
  MessageInitShape<typeof ServerReflectionResponseSchema>,
  "validHost" | "messageResponse"
>;

void suite("listServices", () => {
  const request: RequestInit = {
    messageRequest: { case: "listServices", value: "" },
  };
  testReflection(
    "lists all services on the router by default",
    [request],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: { service: allServices },
        },
      },
    ],
  );
  testReflection(
    "lists services registered after the reflection services",
    [request],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: {
            service: [
              { name: "grpc.reflection.v1.ServerReflection" },
              { name: "grpc.reflection.v1alpha.ServerReflection" },
              { name: "test.v3.TestService" },
            ],
          },
        },
      },
    ],
    (router) => {
      registerReflectionServices(router);
      router.service(TestService, {});
    },
  );
  testReflection(
    "limits to exposed service names",
    [request],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: { service: [{ name: "test.standalone.StandaloneService" }] },
        },
      },
    ],
    (router) => {
      router.service(TestService, {});
      router.service(StandaloneService, {});
      registerReflectionServices(router, {
        services: ["test.standalone.StandaloneService"],
      });
    },
  );
  testReflection(
    "limits to exposed service descriptors, and includes their files",
    [
      request,
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.standalone.StandaloneService",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: { service: [{ name: "test.standalone.StandaloneService" }] },
        },
      },
      fileDescriptorResponse(file_test_standalone_standalone),
    ],
    (router) =>
      registerReflectionServices(router, { services: [StandaloneService] }),
  );
  for (const version of ["v1", "v1alpha"] as const) {
    void test(`fails for exposed services that are unknown (${version})`, async () => {
      await assert.rejects(
        reflect(version, [request], (router) =>
          registerReflectionServices(router, { services: ["test.Unknown"] }),
        ),
        (e) =>
          e instanceof ConnectError &&
          e.code === Code.Internal &&
          e.rawMessage.includes('"test.Unknown"'),
      );
    });
  }
});

void suite("fileByFilename", () => {
  testReflection(
    "returns file with its dependencies",
    [
      {
        messageRequest: {
          case: "fileByFilename",
          value: "test/v3/service.proto",
        },
      },
    ],
    [fileDescriptorResponse(file_test_v3_service, file_test_v2_types)],
  );
  testReflection(
    "returns a file passed in options",
    [
      {
        messageRequest: {
          case: "fileByFilename",
          value: "test/v2/extensions.proto",
        },
      },
    ],
    [fileDescriptorResponse(file_test_v2_extensions, file_test_v2_types)],
  );
  testReflection(
    "returns a dependency of a service file",
    [
      {
        messageRequest: {
          case: "fileByFilename",
          value: "test/v2/types.proto",
        },
      },
    ],
    [fileDescriptorResponse(file_test_v2_types)],
    (router) => {
      router.service(TestService, {});
      registerReflectionServices(router);
    },
  );
  testReflection(
    "returns not found for unknown file",
    [{ messageRequest: { case: "fileByFilename", value: "unknown.proto" } }],
    [notFoundResponse("file not found")],
  );
});

void suite("fileContainingSymbol", () => {
  const cases: [string, DescFile[]][] = [
    ["test.v3.TestService", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.TestService.Query", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.QueryRequest", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.QueryRequest.query", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.QueryRequest.filter", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.QueryKind", [file_test_v3_service, file_test_v2_types]],
    ["test.v3.QUERY_KIND_FULL", [file_test_v3_service, file_test_v2_types]],
    ["test.v2.DataItem", [file_test_v2_types]],
    ["test.v2.custom_field", [file_test_v2_extensions, file_test_v2_types]],
    [
      "grpc.reflection.v1.ServerReflection",
      [file_grpc_reflection_v1_reflection],
    ],
    [
      "grpc.reflection.v1alpha.ServerReflection.ServerReflectionInfo",
      [alpha.file_grpc_reflection_v1alpha_reflection],
    ],
  ];
  for (const [symbol, expected] of cases) {
    testReflection(
      `returns file for ${symbol}`,
      [{ messageRequest: { case: "fileContainingSymbol", value: symbol } }],
      [fileDescriptorResponse(...expected)],
    );
  }
  for (const symbol of [
    "test.v3.Unknown",
    "test.v3.TestService.Unknown",
    "test.v3.QueryRequest.unknown",
    "test.v3.QueryKind.QUERY_KIND_FULL",
    "Unknown",
  ]) {
    testReflection(
      `returns not found for ${symbol}`,
      [{ messageRequest: { case: "fileContainingSymbol", value: symbol } }],
      [notFoundResponse("symbol not found")],
    );
  }
});

void suite("fileContainingExtension", () => {
  testReflection(
    "returns file containing extension",
    [
      {
        messageRequest: {
          case: "fileContainingExtension",
          value: { containingType: "test.v2.DataItem", extensionNumber: 100 },
        },
      },
    ],
    [fileDescriptorResponse(file_test_v2_extensions, file_test_v2_types)],
  );
  testReflection(
    "returns not found for unknown extension number",
    [
      {
        messageRequest: {
          case: "fileContainingExtension",
          value: { containingType: "test.v2.DataItem", extensionNumber: 101 },
        },
      },
    ],
    [notFoundResponse("extension not found")],
  );
  testReflection(
    "returns not found for unknown type",
    [
      {
        messageRequest: {
          case: "fileContainingExtension",
          value: { containingType: "test.v2.Unknown", extensionNumber: 100 },
        },
      },
    ],
    [notFoundResponse("extension not found")],
  );
});

void suite("allExtensionNumbersOfType", () => {
  testReflection(
    "returns all extension numbers for type",
    [
      {
        messageRequest: {
          case: "allExtensionNumbersOfType",
          value: "test.v2.DataItem",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "allExtensionNumbersResponse",
          value: { baseTypeName: "test.v2.DataItem", extensionNumber: [100] },
        },
      },
    ],
  );
  testReflection(
    "returns empty for a type without extensions",
    [
      {
        messageRequest: {
          case: "allExtensionNumbersOfType",
          value: "test.v3.QueryRequest",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "allExtensionNumbersResponse",
          value: { baseTypeName: "test.v3.QueryRequest" },
        },
      },
    ],
  );
  testReflection(
    "returns not found for unknown type",
    [
      {
        messageRequest: {
          case: "allExtensionNumbersOfType",
          value: "test.v2.Unknown",
        },
      },
    ],
    [notFoundResponse("type not found")],
  );
});

void suite("source code info", () => {
  // Generated code strips source code info. This descriptor set is built with
  // `buf build` from the same files, and includes it.
  const withSourceInfo = createFileRegistry(
    fromBinary(
      FileDescriptorSetSchema,
      readFileSync(new URL("gen/test/descriptors.binpb", import.meta.url)),
    ),
  );
  const serviceFile = withSourceInfo.getFile("test/v3/service.proto");
  const typesFile = withSourceInfo.getFile("test/v2/types.proto");
  assert.ok(serviceFile?.proto.sourceCodeInfo);
  assert.ok(typesFile?.proto.sourceCodeInfo);
  assert.equal(file_test_v3_service.proto.sourceCodeInfo, undefined);
  testReflection(
    "files given in options take precedence over generated code",
    [
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.v3.TestService",
        },
      },
    ],
    [fileDescriptorResponse(serviceFile, typesFile)],
    (router) => {
      router.service(TestService, {});
      registerReflectionServices(router, {
        files: Array.from(withSourceInfo.files),
      });
    },
  );
  void test("includes comments", async () => {
    const [response] = await reflect(
      "v1",
      [
        {
          messageRequest: {
            case: "fileByFilename",
            value: "test/v3/service.proto",
          },
        },
      ],
      (router) => {
        router.service(TestService, {});
        registerReflectionServices(router, {
          files: Array.from(withSourceInfo.files),
        });
      },
    );
    assert.equal(response?.messageResponse.case, "fileDescriptorResponse");
    const [bytes] = response.messageResponse.value.fileDescriptorProto;
    assert.ok(bytes);
    const comments = fromBinary(FileDescriptorProtoSchema, bytes)
      .sourceCodeInfo?.location.map((l) => l.leadingComments)
      .filter((c) => c !== "");
    assert.deepEqual(comments, [" A service for tests.\n"]);
  });
});

void suite("stream", () => {
  testReflection(
    "does not send dependencies twice on the same stream",
    [
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.v3.TestService",
        },
      },
      {
        messageRequest: {
          case: "fileByFilename",
          value: "test/v2/extensions.proto",
        },
      },
      {
        messageRequest: {
          case: "fileByFilename",
          value: "test/v2/types.proto",
        },
      },
    ],
    [
      fileDescriptorResponse(file_test_v3_service, file_test_v2_types),
      fileDescriptorResponse(file_test_v2_extensions),
      fileDescriptorResponse(file_test_v2_types),
    ],
  );
  testReflection(
    "echoes host as valid host",
    [
      {
        host: "example.com",
        messageRequest: { case: "listServices", value: "" },
      },
    ],
    [
      {
        validHost: "example.com",
        messageResponse: {
          case: "listServicesResponse",
          value: { service: allServices },
        },
      },
    ],
  );
});

/**
 * Registers a test for every version of the reflection service.
 */
function testReflection(
  name: string,
  requests: RequestInit[],
  expected: ResponseInit[],
  routes: (router: ConnectRouter) => void = defaultRoutes,
): void {
  for (const version of ["v1", "v1alpha"] as const) {
    void test(`${name} (${version})`, async () => {
      const actual = await reflect(version, requests, routes);
      assert.equal(actual.length, expected.length);
      for (const [i, response] of actual.entries()) {
        const want = create(ServerReflectionResponseSchema, expected[i]);
        want.originalRequest = create(
          ServerReflectionRequestSchema,
          requests[i],
        );
        if (!equals(ServerReflectionResponseSchema, response, want)) {
          assert.deepEqual(response, want);
        }
      }
    });
  }
}

/**
 * Sends the given requests on a single stream, and returns the responses.
 * Since v1 and v1alpha are wire compatible, v1alpha responses are converted
 * to v1 for comparison.
 */
async function reflect(
  version: "v1" | "v1alpha",
  requests: RequestInit[],
  routes: (router: ConnectRouter) => void,
): Promise<ServerReflectionResponse[]> {
  const transport = createRouterTransport(routes);
  const responses: ServerReflectionResponse[] = [];
  if (version === "v1") {
    const client = createClient(ServerReflection, transport);
    for await (const res of client.serverReflectionInfo(
      createAsyncIterable(requests),
    )) {
      responses.push(res);
    }
  } else {
    const client = createClient(alpha.ServerReflection, transport);
    for await (const res of client.serverReflectionInfo(
      createAsyncIterable(requests),
    )) {
      responses.push(
        fromBinary(
          ServerReflectionResponseSchema,
          toBinary(alpha.ServerReflectionResponseSchema, res),
        ),
      );
    }
  }
  return responses;
}

function fileDescriptorResponse(...files: DescFile[]): ResponseInit {
  return {
    messageResponse: {
      case: "fileDescriptorResponse",
      value: {
        fileDescriptorProto: files.map((file) =>
          toBinary(FileDescriptorProtoSchema, file.proto),
        ),
      },
    },
  };
}

function notFoundResponse(errorMessage: string): ResponseInit {
  return {
    messageResponse: {
      case: "errorResponse",
      value: { errorCode: Code.NotFound, errorMessage },
    },
  };
}
