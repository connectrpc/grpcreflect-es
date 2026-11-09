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

import { file_google_protobuf_api } from "@bufbuild/protobuf/wkt";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { registerReflectionServices } from "@connectrpc/grpcreflect";
import { ServerReflection } from "./gen/grpc/reflection/v1/reflection_pb.js";
import * as alpha from "./gen/grpc/reflection/v1alpha/reflection_pb.js";

/**
 * A runtime-agnostic smoke test: Registers the reflection services on an
 * in-memory router, and calls them. Throws an error if the results are not as
 * expected, and returns a short summary otherwise.
 *
 * The test only uses APIs available in all runtimes, so that it can run in
 * Node.js, Bun, Cloudflare Workers, and web browsers.
 */
export async function smoke(): Promise<string> {
  const transport = createRouterTransport((router) =>
    registerReflectionServices(router, { files: [file_google_protobuf_api] }),
  );
  const results: string[] = [];
  for (const service of [ServerReflection, alpha.ServerReflection]) {
    const client = createClient(service, transport);
    const responses = [];
    for await (const res of client.serverReflectionInfo(
      toAsyncIterable([
        { messageRequest: { case: "listServices", value: "" } },
        {
          messageRequest: {
            case: "fileContainingSymbol",
            value: "google.protobuf.Method",
          },
        },
      ] as const),
    )) {
      responses.push(res.messageResponse);
    }
    const [list, file] = responses;
    if (list?.case !== "listServicesResponse") {
      throw new Error(`${service.typeName}: unexpected ${list?.case}`);
    }
    const names = list.value.service.map((s) => s.name).join(",");
    if (
      names !==
      "grpc.reflection.v1.ServerReflection,grpc.reflection.v1alpha.ServerReflection"
    ) {
      throw new Error(`${service.typeName}: unexpected services ${names}`);
    }
    if (file?.case !== "fileDescriptorResponse") {
      throw new Error(`${service.typeName}: unexpected ${file?.case}`);
    }
    // google/protobuf/api.proto imports source_context.proto and type.proto,
    // which imports any.proto and source_context.proto.
    const count = file.value.fileDescriptorProto.length;
    if (count !== 4) {
      throw new Error(`${service.typeName}: expected 4 files, got ${count}`);
    }
    results.push(`${service.typeName} ok`);
  }
  return results.join(", ");
}

async function* toAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  yield* items;
}
