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

import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/**
 * Bundles the smoke test with the given entry point for a platform that is
 * not Node.js. Bundling with platform "neutral" fails if any Node.js built-in
 * module is imported.
 */
export async function bundle(
  entryPoint: string,
  conditions: string[],
): Promise<string> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entryPoint, import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    conditions,
    mainFields: ["module", "main"],
    logLevel: "warning",
  });
  const output = result.outputFiles[0];
  if (output === undefined) {
    throw new Error("esbuild produced no output");
  }
  return output.text;
}
