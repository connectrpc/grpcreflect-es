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
  createRegistry,
  type DescFile,
  type FileRegistry,
} from "@bufbuild/protobuf";

/**
 * Creates a FileRegistry from a set of files, including all of their
 * transitive dependencies.
 */
export function createFileRegistry(files: readonly DescFile[]): FileRegistry {
  const fileMap = new Map<string, DescFile>();
  const addFile = (file: DescFile) => {
    if (fileMap.has(file.proto.name)) {
      return;
    }
    fileMap.set(file.proto.name, file);
    file.dependencies.forEach(addFile);
  };
  files.forEach(addFile);
  const allFiles = Array.from(fileMap.values());
  return {
    ...createRegistry(...allFiles),
    files: allFiles,
    getFile: (name) => fileMap.get(name),
  };
}
