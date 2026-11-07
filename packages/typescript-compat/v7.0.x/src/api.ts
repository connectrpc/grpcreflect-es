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

import type { DescFile, DescService } from "@bufbuild/protobuf";
import { file_google_protobuf_api } from "@bufbuild/protobuf/wkt";
import { createConnectRouter, type ConnectRouter } from "@connectrpc/connect";
import {
  registerReflectionServices,
  type ReflectionServiceOptions,
} from "@connectrpc/grpcreflect";

// Exercises the public API with the different shapes of options it accepts.
export function testOptions(
  router: ConnectRouter,
  files: readonly DescFile[],
  services: readonly (DescService | string)[],
): void {
  registerReflectionServices(router);
  registerReflectionServices(router, {});
  registerReflectionServices(router, { files });
  registerReflectionServices(router, { services });
  registerReflectionServices(router, { files, services });
  registerReflectionServices(router, { files: undefined, services: undefined });
  registerReflectionServices(router, { fileDescriptorSet: new Uint8Array() });
  registerReflectionServices(router, { fileDescriptorSet: undefined });
  const options: ReflectionServiceOptions = {
    files: [file_google_protobuf_api],
    services: ["google.protobuf.Api"],
  };
  registerReflectionServices(createConnectRouter(), options);
}
