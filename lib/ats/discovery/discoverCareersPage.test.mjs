import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const discoveryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "discoverCareersPage.ts",
);
const require = createRequire(import.meta.url);

function loadDiscovery() {
  const source = readFileSync(discoveryPath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{ DiscoveryResult, RedirectStep \} from "\.\/types";\n/, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const testModule = { exports: {} };
  new Function("exports", "require", "module", outputText)(
    testModule.exports,
    (specifier) => require(specifier),
    testModule,
  );
  return testModule.exports;
}

const { createPinnedLookup } = loadDiscovery();

test("pinned lookup uses Node's all-address callback shape when requested", () => {
  const lookup = createPinnedLookup({ address: "203.0.113.10", family: 4 });

  lookup("careers.example", { all: true }, (error, addresses, family) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "203.0.113.10", family: 4 }]);
    assert.equal(family, undefined);
  });
});

test("pinned lookup retains the single-address callback shape", () => {
  const lookup = createPinnedLookup({ address: "2001:db8::10", family: 6 });

  lookup("careers.example", { all: false }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "2001:db8::10");
    assert.equal(family, 6);
  });
});
