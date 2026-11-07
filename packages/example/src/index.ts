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

import * as http2 from "node:http2";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { UserService } from "./gen/example/v1/user_pb.js";
import { registerReflectionServices } from "@connectrpc/grpcreflect";

// Reflection clients require HTTP/2, so we use the node:http2 module.
const server = http2.createServer(
  connectNodeAdapter({
    routes: (router) => {
      router.service(UserService, {
        async createUser(req) {
          return {
            user: {
              email: req.email,
            },
          };
        },
      });
      // Lets clients list and describe all services registered on the
      // router, including UserService and the reflection services.
      registerReflectionServices(router);
    },
  }),
);

server.listen(8080, () => {
  console.log("Server listening on http://localhost:8080");
  console.log("Try: grpcurl -plaintext localhost:8080 list");
});
