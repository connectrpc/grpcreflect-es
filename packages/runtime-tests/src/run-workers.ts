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

// Runs the smoke test in workerd, the Cloudflare Workers runtime, without
// the nodejs_compat flag.
import { Miniflare } from "miniflare";
import { bundle } from "./bundle.js";

const mf = new Miniflare({
  modules: true,
  script: await bundle("./worker.ts", ["workerd", "worker", "browser"]),
  compatibilityDate: "2026-01-01",
  // Use Miniflare's placeholder for request.cf
  cf: false,
});
try {
  const res = await mf.dispatchFetch("http://localhost/");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }
  console.log(`workerd: ${text}`);
} finally {
  await mf.dispose();
}
