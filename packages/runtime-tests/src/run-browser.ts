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

// Runs the smoke test in web browsers with Playwright. Set the environment
// variable BROWSERS to a comma-separated list to select browsers.
import { chromium, firefox, type BrowserType, webkit } from "playwright";
import { bundle } from "./bundle.js";

const browserTypes: Record<string, BrowserType> = { chromium, firefox, webkit };
const names = (process.env["BROWSERS"] ?? "chromium,firefox,webkit").split(",");
const script = await bundle("./browser.ts", ["browser"]);

for (const name of names) {
  const browserType = browserTypes[name];
  if (browserType === undefined) {
    throw new Error(`unknown browser ${name}`);
  }
  const browser = await browserType.launch();
  try {
    const page = await browser.newPage();
    const errors: Error[] = [];
    page.on("pageerror", (e) => errors.push(e));
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: script, type: "module" });
    const result = await page.evaluate(() => window.smokeResult);
    if (errors.length > 0) {
      throw errors[0];
    }
    console.log(`${name} ${browser.version()}: ${result}`);
  } finally {
    await browser.close();
  }
}
