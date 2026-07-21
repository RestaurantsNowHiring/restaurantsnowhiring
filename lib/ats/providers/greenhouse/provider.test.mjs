import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const providerPath = resolve(dirname(fileURLToPath(import.meta.url)), "provider.ts");

function loadProvider() {
  const source = readFileSync(providerPath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{[^}]+\} from "\.\.\/\.\.\/types";\n\n/s, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "entities") {
      return { decodeHTML: (value) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"') };
    }
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

const { greenhouseProvider, MAX_GREENHOUSE_JOBS_RESPONSE_BYTES } = loadProvider();

function careersPage(url) {
  return { url };
}

async function detectionFor(url) {
  const { matched, providerKey, confidence } = await greenhouseProvider.detect(careersPage(url));
  return { matched, providerKey, confidence };
}

test("detect validates supported and unsupported Greenhouse URL shapes", async () => {
  const valid = [
    "https://boards.greenhouse.io/acmerestaurants",
    "https://job-boards.greenhouse.io/acmerestaurants",
    "https://boards.greenhouse.io/acmerestaurants/jobs/12345",
  ];

  for (const url of valid) {
    assert.deepEqual(await detectionFor(url), {
      matched: true,
      providerKey: "greenhouse",
      confidence: "high",
    });
  }

  const invalid = [
    "https://example.com/acmerestaurants",
    "ftp://boards.greenhouse.io/acmerestaurants",
    "https://user:pass@boards.greenhouse.io/acmerestaurants",
    "https://boards.greenhouse.io/",
    "https://boards.greenhouse.io/acme.restaurants",
  ];

  for (const url of invalid) {
    assert.deepEqual(await detectionFor(url), {
      matched: false,
      providerKey: null,
      confidence: null,
    });
  }
});

test("parseJobs normalizes valid jobs, preserves API ordering, and decodes HTML entities once", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const jobs = [
    {
      id: 101,
      title: " Chef ",
      absolute_url: "https://boards.greenhouse.io/acmerestaurants/jobs/101",
      location: { name: " New York, NY " },
      content: "<p>Fish &amp; Chips &amp;amp; More<script>alert(1)</script></p>",
      departments: [{ name: " Culinary " }, { name: "" }, null],
      metadata: [{ name: "Employment Type", value: " Full-time " }],
      updated_at: "2026-07-20T00:00:00Z",
    },
    {
      id: "job-102",
      title: "Server",
      absolute_url: "https://job-boards.greenhouse.io/acmerestaurants/jobs/102?gh_jid=102",
      location: null,
      content: null,
      departments: "malformed",
      metadata: [{ name: "Employment Type", value: null }],
    },
    { id: 103, title: "Missing URL" },
  ];

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://boards-api.greenhouse.io/v1/boards/acmerestaurants/jobs?content=true");
    assert.equal(init.headers.accept, "application/json");
    return Response.json({ jobs });
  };

  const parsed = await greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/acmerestaurants/jobs/101"));

  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((job) => job.externalId), ["101", "job-102"]);
  assert.equal(parsed[0].providerKey, "greenhouse");
  assert.equal(parsed[0].sourceUrl, "https://boards.greenhouse.io/acmerestaurants/jobs/101");
  assert.equal(parsed[0].title, "Chef");
  assert.equal(parsed[0].applyUrl, "https://boards.greenhouse.io/acmerestaurants/jobs/101");
  assert.equal(parsed[0].department, "Culinary");
  assert.equal(parsed[0].employmentType, "Full-time");
  assert.equal(parsed[0].descriptionHtml, "<p>Fish & Chips &amp; More<script>alert(1)</script></p>");
  assert.ok(!("location" in parsed[1]));
  assert.ok(new URL(parsed[0].sourceUrl));
  assert.ok(new URL(parsed[1].applyUrl));
});

test("parseJobs returns an empty array for valid empty Greenhouse boards", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => Response.json({ jobs: [] });

  assert.deepEqual(await greenhouseProvider.parseJobs(careersPage("https://job-boards.greenhouse.io/emptyboard")), []);
});

test("parseJobs does not truncate responses at 500 jobs", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  const jobs = Array.from({ length: 501 }, (_, index) => ({
    id: index + 1,
    title: `Job ${index + 1}`,
    absolute_url: `https://boards.greenhouse.io/acmerestaurants/jobs/${index + 1}`,
  }));
  globalThis.fetch = async () => Response.json({ jobs });

  const parsed = await greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/acmerestaurants"));
  assert.equal(parsed.length, 501);
  assert.equal(parsed.at(-1).externalId, "501");
});

test("parseJobs reports expected failure modes", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  await assert.rejects(
    () => greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/")),
    /not a recognized Greenhouse job board URL/,
  );

  globalThis.fetch = async () => new Response("Not found", { status: 404 });
  await assert.rejects(
    () => greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/nonexistent")),
    /failed with status 404/,
  );

  globalThis.fetch = async () => Response.json({ departments: [] });
  await assert.rejects(
    () => greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/malformed")),
    /response was malformed/,
  );

  globalThis.fetch = async () => new Response("{}", {
    headers: { "content-length": String(MAX_GREENHOUSE_JOBS_RESPONSE_BYTES + 1) },
  });
  await assert.rejects(
    () => greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/oversized")),
    /response was too large/,
  );

  globalThis.fetch = async (_url, init) => {
    await new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  };
  await assert.rejects(
    () => greenhouseProvider.parseJobs(careersPage("https://boards.greenhouse.io/timeout")),
    /request timed out/,
  );
});
