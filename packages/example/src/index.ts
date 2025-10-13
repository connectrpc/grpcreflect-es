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

import * as http2 from "node:http2";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { UserService, file_example_v1_user } from "./gen/example/v1/user_pb.js";
import { registerReflectionServices } from "@connectrpc/grpcreflect";
import { create, createFileRegistry } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";

const server = http2.createServer(
  connectNodeAdapter({
    routes: (router) => {
      router.rpc(UserService.method.createUser, async (req) => {
        return {
          user: {
            email: req.email,
          },
        };
      });
      registerReflectionServices(router, {
        registry: createFileRegistry(
          create(FileDescriptorSetSchema, {
            file: [file_example_v1_user.proto],
          }),
        ),
      });
    },
  }),
);

server.listen(8080, () => {
  console.log("Server listening on http://localhost:8080");
  console.log("The server exposes the gRPC reflection service.");
});
