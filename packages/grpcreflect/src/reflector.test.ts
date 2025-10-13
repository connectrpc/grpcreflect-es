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

import { suite, test } from "node:test";
import { compileFiles } from "@bufbuild/protocompile";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import {
  registerReflectionServices,
  type ReflectionServiceOptions,
} from "./reflector.js";
import {
  ServerReflection,
  type ServerReflectionRequestSchema,
  ServerReflectionResponseSchema,
} from "./gen/grpc/reflection/v1/reflection_pb.js";
import * as alpha from "./gen/grpc/reflection/v1alpha/reflection_pb.js";
import * as assert from "node:assert/strict";
import { createAsyncIterable } from "@connectrpc/connect/protocol";
import {
  create,
  equals,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { FileDescriptorProtoSchema } from "@bufbuild/protobuf/wkt";

const registry = compileFiles({
  "proto3/service.proto": `
        syntax = "proto3";
        package test.v3;

        import "proto2/types.proto";

        service TestService {
            rpc Query(QueryRequest) returns (QueryResponse);
        }

        message QueryRequest {
            string query = 1;
        }

        message QueryResponse {
            test.v2.DataItem item = 1;
        }
    `,
  "proto2/types.proto": `
        syntax = "proto2";
        package test.v2;

        message DataItem {
            required string id = 1;
            optional string name = 2;
            extensions 100 to 199;
        }
    `,
  "proto2/extensions.proto": `
        syntax = "proto2";
        package test.v2;

        import "proto2/types.proto";

        extend DataItem {
            optional string custom_field = 100;
        }
    `,
  "proto2/standalone.proto": `
        syntax = "proto2";
        package test.standalone;

        service StandaloneService {
            rpc Process(Request) returns (Response);
        }

        message Request {
            required string input = 1;
            optional int32 timeout = 2 [default = 30];
        }

        message Response {
            required bool success = 1;
            optional string result = 2;
        }
    `,
});

const protoFiles = extractFileProtos([
  "proto3/service",
  "proto2/types",
  "proto2/extensions",
  "proto2/standalone",
]);

void suite("listServices", () => {
  void testReflection(
    "exposes all services by default",
    [{ messageRequest: { case: "listServices", value: "" } }],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: {
            service: [
              { name: "test.standalone.StandaloneService" },
              { name: "test.v3.TestService" },
            ],
          },
        },
      },
    ],
  );
  void testReflection(
    "limits to exposed",
    [{ messageRequest: { case: "listServices", value: "" } }],
    [
      {
        messageResponse: {
          case: "listServicesResponse",
          value: {
            service: [{ name: "test.standalone.StandaloneService" }],
          },
        },
      },
    ],
    { services: ["test.standalone.StandaloneService"] },
  );
});

void suite("fileByFilename", () => {
  void testReflection(
    "returns file descriptor for proto3 file",
    [
      {
        messageRequest: {
          case: "fileByFilename",
          value: "proto3/service.proto",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "fileDescriptorResponse",
          value: {
            fileDescriptorProto: [
              protoFiles["proto3/service"],
              protoFiles["proto2/types"],
            ],
          },
        },
      },
    ],
  );
});

void suite("fileContainingSymbol", () => {
  void testReflection(
    "returns file for service symbol",
    [
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.v3.TestService",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "fileDescriptorResponse",
          value: {
            fileDescriptorProto: [
              protoFiles["proto3/service"],
              protoFiles["proto2/types"],
            ],
          },
        },
      },
    ],
  );

  void testReflection(
    "returns file for message symbol",
    [
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.v2.DataItem",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "fileDescriptorResponse",
          value: {
            fileDescriptorProto: [protoFiles["proto2/types"]],
          },
        },
      },
    ],
  );

  void testReflection(
    "returns file for method symbol",
    [
      {
        messageRequest: {
          case: "fileContainingSymbol",
          value: "test.standalone.StandaloneService.Process",
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "fileDescriptorResponse",
          value: {
            fileDescriptorProto: [protoFiles["proto2/standalone"]],
          },
        },
      },
    ],
  );
});

void suite("fileContainingExtension", () => {
  void testReflection(
    "returns file containing extension",
    [
      {
        messageRequest: {
          case: "fileContainingExtension",
          value: { containingType: "test.v2.DataItem", extensionNumber: 100 },
        },
      },
    ],
    [
      {
        messageResponse: {
          case: "fileDescriptorResponse",
          value: {
            fileDescriptorProto: [
              protoFiles["proto2/extensions"],
              protoFiles["proto2/types"],
            ],
          },
        },
      },
    ],
  );
});

void suite("allExtensionNumbersOfType", () => {
  void testReflection(
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
          value: {
            baseTypeName: "test.v2.DataItem",
            extensionNumber: [100],
          },
        },
      },
    ],
  );
  void testReflection(
    "returns empty for a type with not extensions",
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
          value: {
            baseTypeName: "test.v3.QueryRequest",
          },
        },
      },
    ],
  );
});

async function testReflection(
  name: string,
  // biome-ignore format: Long type
  requests: (
    MessageInitShape<typeof ServerReflectionRequestSchema> &
    MessageInitShape<typeof alpha.ServerReflectionRequestSchema>
  )[],
  // biome-ignore format: Long type
  responses: (
    MessageInitShape<typeof ServerReflectionResponseSchema> &
    MessageInitShape<typeof alpha.ServerReflectionResponseSchema>
  )[],
  options?: Partial<ReflectionServiceOptions>,
) {
  await test(name, async () => {
    const transport = createRouterTransport((router) =>
      registerReflectionServices(router, {
        services: options?.services,
        files: options?.files ?? Array.from(registry.files),
      }),
    );
    await test("v1", async () => {
      const client = createClient(ServerReflection, transport);
      for await (const actual of client.serverReflectionInfo(
        createAsyncIterable([...requests]),
      )) {
        const expected = responses.shift();
        assert.ok(expected);
        expected.originalRequest = requests.shift();
        assertProtoEqual(ServerReflectionResponseSchema, actual, expected);
      }
    });
    await test("v1alpha", async () => {
      const client = createClient(alpha.ServerReflection, transport);
      for await (const actual of client.serverReflectionInfo(
        createAsyncIterable([...requests]),
      )) {
        const expected = responses.shift();
        assert.ok(expected);
        expected.originalRequest = requests.shift();
        assertProtoEqual(
          alpha.ServerReflectionResponseSchema,
          actual,
          expected,
        );
      }
    });
  });
}

function assertProtoEqual<Desc extends DescMessage>(
  desc: Desc,
  actualInit: MessageInitShape<Desc>,
  expectedInit: MessageInitShape<Desc>,
) {
  const actual = create(desc, actualInit);
  const expected = create(desc, expectedInit);
  if (!equals(desc, actual, expected)) {
    assert.deepEqual(actual, expected);
  }
}

function extractFileProtos<const T extends readonly string[]>(
  fileNames: T,
): { [K in T[number]]: Uint8Array } {
  const files = Array.from(registry.files);
  const result = {} as { [K in T[number]]: Uint8Array };

  for (const fileName of fileNames) {
    const file = files.find((f) => f.name === fileName);
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }
    result[fileName as T[number]] = toBinary(
      FileDescriptorProtoSchema,
      file.proto,
    );
  }

  return result;
}
