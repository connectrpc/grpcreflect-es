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

import {
  createRegistry,
  type DescFile,
  type FileRegistry,
} from "@bufbuild/protobuf";

/**
 * Creates a FileRegistry from a set of files.
 */
export function createFileRegistry(files: DescFile[]): FileRegistry {
  const fileMap = new Map<string, DescFile>();
  addToMap(fileMap, files);
  const allFiles = Array.from(fileMap.values());
  return {
    ...createRegistry(...allFiles),
    files: allFiles,
    getFile(name) {
      return fileMap.get(name);
    },
  };
}

function addToMap(map: Map<string, DescFile>, files: DescFile[]) {
  for (const file of files) {
    if (map.has(file.proto.name)) {
      continue;
    }
    map.set(file.proto.name, file);
    addToMap(map, file.dependencies);
  }
}
