import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const previewPath = resolve(dirname(fileURLToPath(import.meta.url)), "previewJobImport.ts");

function loadPreview(mocks) {
  const source = readFileSync(previewPath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{[^}]+\} from "\.\.\/types";\n\n/s, "");

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "../analysis/analyzeCareersPage") {
      return { analyzeCareersPage: mocks.analyzeCareersPage };
    }
    if (specifier === "../analysis/classifyAnalysisResult") {
      return { classifyAnalysisResult: mocks.classifyAnalysisResult };
    }
    if (specifier === "../providers/registry") {
      return { getAtsProvider: mocks.getAtsProvider };
    }
    throw new Error(`Unexpected test require: ${specifier}`);
  };

  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

function previewWithClassification(classification, provider) {
  const analysisResult = { stable: "analysis-result" };
  const calls = { parseJobs: [] };
  const mocks = {
    analyzeCareersPage: async (inputUrl) => ({ ...analysisResult, inputUrl }),
    classifyAnalysisResult: (result) => {
      assert.equal(result.inputUrl, "https://example.com");
      return classification;
    },
    getAtsProvider: (providerKey) => {
      assert.equal(providerKey, classification.providerKey);
      return provider === undefined
        ? undefined
        : {
            ...provider,
            parseJobs: async (careersPage) => {
              calls.parseJobs.push(careersPage);
              return provider.parseJobs(careersPage);
            },
          };
    },
  };
  return { previewJobImport: loadPreview(mocks).previewJobImport, calls };
}

test("maps discovery-failed classification to preview result", async () => {
  const message = "safe discovery message";
  const { previewJobImport } = previewWithClassification({ status: "discovery-failed", message });

  assert.deepEqual(await previewJobImport("https://example.com"), {
    status: "discovery-failed",
    message,
  });
});

test("maps no-job-links classification to preview result", async () => {
  const message = "safe no links message";
  const { previewJobImport } = previewWithClassification({ status: "no-job-links", message });

  assert.deepEqual(await previewJobImport("https://example.com"), {
    status: "no-job-links",
    message,
  });
});

test("maps unsupported classification to preview result", async () => {
  const message = "safe unsupported message";
  const { previewJobImport } = previewWithClassification({ status: "unsupported", message });

  assert.deepEqual(await previewJobImport("https://example.com"), {
    status: "unsupported",
    message,
  });
});

test("provider-found resolves the registry provider, parses jobs, and returns ready", async () => {
  const jobs = [{ externalId: "1", providerKey: "mock", sourceUrl: "https://jobs.example.com", title: "Chef", applyUrl: "https://jobs.example.com/1" }];
  const { previewJobImport, calls } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://jobs.example.com" },
    { parseJobs: async () => jobs },
  );

  assert.deepEqual(await previewJobImport("https://example.com"), {
    status: "ready",
    providerKey: "mock",
    sourceUrl: "https://jobs.example.com",
    jobs,
  });
  assert.deepEqual(calls.parseJobs, [{ url: "https://jobs.example.com" }]);
});

test("traversal-found provider uses matched provider sourceUrl instead of original inputUrl", async () => {
  const { previewJobImport, calls } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://ats.example.com/company" },
    { parseJobs: async () => [] },
  );

  await previewJobImport("https://example.com");
  assert.deepEqual(calls.parseJobs, [{ url: "https://ats.example.com/company" }]);
});

test("parseJobs returning an empty array still returns ready", async () => {
  const { previewJobImport } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://jobs.example.com" },
    { parseJobs: async () => [] },
  );

  assert.deepEqual(await previewJobImport("https://example.com"), {
    status: "ready",
    providerKey: "mock",
    sourceUrl: "https://jobs.example.com",
    jobs: [],
  });
});

test("parseJobs throwing returns safe retrieval-failed without raw provider details", async () => {
  const { previewJobImport } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://jobs.example.com" },
    { parseJobs: async () => { throw new Error("HTTP 500 secret raw payload stack trace"); } },
  );

  const result = await previewJobImport("https://example.com");
  assert.equal(result.status, "retrieval-failed");
  assert.equal(result.providerKey, "mock");
  assert.equal(result.sourceUrl, "https://jobs.example.com");
  assert.match(result.message, /couldn't retrieve the jobs/i);
  assert.doesNotMatch(result.message, /HTTP 500|secret|raw payload|stack/i);
});

test("missing provider lookup returns safe retrieval-failed", async () => {
  const { previewJobImport } = previewWithClassification(
    { status: "provider-found", providerKey: "missing", sourceUrl: "https://jobs.example.com" },
    undefined,
  );

  const result = await previewJobImport("https://example.com");
  assert.deepEqual(result, {
    status: "retrieval-failed",
    providerKey: "missing",
    sourceUrl: "https://jobs.example.com",
    message: "We found the job system, but couldn't retrieve the jobs right now. Please try again.",
  });
});

test("returned job ordering is preserved", async () => {
  const jobs = ["first", "second", "third"].map((id) => ({ externalId: id, providerKey: "mock", sourceUrl: "https://jobs.example.com", title: id, applyUrl: `https://jobs.example.com/${id}` }));
  const { previewJobImport } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://jobs.example.com" },
    { parseJobs: async () => jobs },
  );

  const result = await previewJobImport("https://example.com");
  assert.equal(result.status, "ready");
  assert.deepEqual(result.jobs.map((job) => job.externalId), ["first", "second", "third"]);
});

test("does not truncate 501 jobs", async () => {
  const jobs = Array.from({ length: 501 }, (_, index) => ({ externalId: String(index + 1), providerKey: "mock", sourceUrl: "https://jobs.example.com", title: `Job ${index + 1}`, applyUrl: `https://jobs.example.com/${index + 1}` }));
  const { previewJobImport } = previewWithClassification(
    { status: "provider-found", providerKey: "mock", sourceUrl: "https://jobs.example.com" },
    { parseJobs: async () => jobs },
  );

  const result = await previewJobImport("https://example.com");
  assert.equal(result.status, "ready");
  assert.equal(result.jobs.length, 501);
  assert.equal(result.jobs.at(-1).externalId, "501");
});
