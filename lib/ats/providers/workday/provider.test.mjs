import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const providerPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "provider.ts",
);
const registryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../registry.ts",
);

function loadProvider(patches = {}) {
  let source = readFileSync(providerPath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{[^}]+\} from "\.\.\/\.\.\/types";\n\n/s, "");
  for (const [pattern, replacement] of Object.entries(patches))
    source = source.replace(pattern, replacement);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const testModule = { exports: {} };
  new Function("exports", "require", "module", outputText)(
    testModule.exports,
    () => {
      throw new Error("Unexpected require");
    },
    testModule,
  );
  return testModule.exports;
}

const { workdayProvider, WORKDAY_DETAIL_CONCURRENCY } = loadProvider();
const careersPage = (url) => ({ url });
const json = (body, init = {}) =>
  Response.json(body, {
    headers: { "content-type": "application/json" },
    ...init,
  });

async function detectionFor(url) {
  const { matched, providerKey, confidence } = await workdayProvider.detect(
    careersPage(url),
  );
  return { matched, providerKey, confidence };
}

function installWorkdayFetch(t, handler) {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = handler;
}

test("detect supports locale-prefixed, non-locale, and full job-detail Workday URLs", async () => {
  for (const url of [
    "https://tenant.wd5.myworkdayjobs.com/Site",
    "https://tenant.wd5.myworkdayjobs.com/en-US/Site",
    "https://tenant.wd5.myworkdayjobs.com/en-US/Site/job/Location/Title_R123",
    "https://tenant.wd5.myworkdayjobs.com/Site/job/Location/Title_R123",
    "https://tenant.wd12.myworkdayjobs.eu/Site",
  ])
    assert.deepEqual(await detectionFor(url), {
      matched: true,
      providerKey: "workday",
      confidence: "high",
    });
});

test("detect rejects unsupported pages and nested paths where site cannot be determined confidently", async () => {
  for (const url of [
    "https://tenant.wd5.myworkdayjobs.com",
    "https://tenant.wd5.myworkdayjobs.com/en-US",
    "https://tenant.wd5.myworkdayjobs.com/en-US/Site/search/results",
    "https://example.com/Site",
    "ftp://tenant.wd5.myworkdayjobs.com/Site",
    "https://user:pass@tenant.wd5.myworkdayjobs.com/Site",
    "https://tenant.foo.myworkdayjobs.com/Site",
  ])
    assert.deepEqual(await detectionFor(url), {
      matched: false,
      providerKey: null,
      confidence: null,
    });
});

test("parseJobs derives the correct site from a full job URL and separates API detail URL from public apply URL", async (t) => {
  const calls = [];
  installWorkdayFetch(t, async (url, init) => {
    calls.push({ url, method: init.method });
    if (init.method === "POST") {
      assert.equal(
        url,
        "https://tenant.wd5.myworkdayjobs.com/wday/cxs/tenant/Site/jobs",
      );
      return json({
        total: 1,
        jobPostings: [
          {
            title: "Cook",
            externalPath: "/job/Location/Title_R123",
            postedOn: "2026-07-01",
          },
        ],
      });
    }
    assert.equal(
      url,
      "https://tenant.wd5.myworkdayjobs.com/wday/cxs/tenant/Site/job/Location/Title_R123",
    );
    return json({
      jobPostingInfo: {
        title: "Cook",
        jobReqId: "R123",
        jobDescription: "<p>Cook</p>",
        startDate: "2099-01-01",
      },
    });
  });
  const parsed = await workdayProvider.parseJobs(
    careersPage(
      "https://tenant.wd5.myworkdayjobs.com/en-US/Site/job/Location/Title_R123",
    ),
  );
  assert.equal(
    parsed[0].applyUrl,
    "https://tenant.wd5.myworkdayjobs.com/en-US/Site/job/Location/Title_R123",
  );
  assert.equal(parsed[0].sourceUrl, parsed[0].applyUrl);
  assert.equal(parsed[0].updatedAt, "2026-07-01");
  assert.equal(calls.filter((call) => call.method === "GET").length, 1);
});

test("parseJobs preserves non-locale public apply paths", async (t) => {
  installWorkdayFetch(t, async (_url, init) =>
    init.method === "POST"
      ? json({
          jobPostings: [{ title: "Host", externalPath: "/job/Towson/Host_R1" }],
        })
      : json({
          jobPostingInfo: { jobReqId: "R1", jobDescription: "<p>Host</p>" },
        }),
  );
  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );
  assert.equal(
    parsed[0].applyUrl,
    "https://tenant.wd5.myworkdayjobs.com/Site/job/Towson/Host_R1",
  );
});

test("malicious externalPath values are rejected without cross-host fetches or partial results", async (t) => {
  for (const externalPath of [
    "https://evil.example/job/X/Y_R1",
    "//evil.example/job/X/Y_R1",
    "/job/../Admin/Y_R1",
    "/not-job/X/Y_R1",
    "/job/X",
  ]) {
    let getCalled = false;
    installWorkdayFetch(t, async (_url, init) => {
      if (init.method === "GET") getCalled = true;
      return init.method === "POST"
        ? json({ jobPostings: [{ title: "Bad", externalPath }] })
        : json({ jobPostingInfo: {} });
    });
    await assert.rejects(
      () =>
        workdayProvider.parseJobs(
          careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
        ),
      /invalid external path|listing ended/,
    );
    assert.equal(getCalled, false);
  }
});

test("normal pagination completes and overlapping pages are deduplicated in first-seen order", async (t) => {
  const detailUrls = [];
  installWorkdayFetch(t, async (url, init) => {
    if (init.method === "GET") {
      detailUrls.push(url);
      return json({
        jobPostingInfo: {
          jobReqId: url.split("_").at(-1),
          jobDescription: "<p>Ok</p>",
        },
      });
    }
    const offset = JSON.parse(init.body).offset;
    if (offset === 0)
      return json({
        total: 21,
        jobPostings: Array.from({ length: 20 }, (_, i) => ({
          title: `Job ${i}`,
          externalPath: `/job/Loc/Job_${i}`,
        })),
      });
    return json({
      total: 21,
      jobPostings: [
        { title: "Duplicate", externalPath: "/job/Loc/Job_19" },
        { title: "Job 20", externalPath: "/job/Loc/Job_20" },
      ],
    });
  });
  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );
  assert.equal(parsed.length, 21);
  assert.equal(parsed.at(-1).externalId, "20");
  assert.equal(new Set(detailUrls).size, 21);
});

test("listing requests use the public Workday page size and advance offsets", async (t) => {
  const requests = [];
  installWorkdayFetch(t, async (_url, init) => {
    if (init.method === "GET")
      return json({
        jobPostingInfo: { jobReqId: "R", jobDescription: "<p>Ok</p>" },
      });
    const body = JSON.parse(init.body);
    requests.push(body);
    const start = body.offset;
    const remaining = Math.max(0, 41 - start);
    return json({
      total: 41,
      jobPostings: Array.from({ length: Math.min(20, remaining) }, (_, i) => ({
        title: `Job ${start + i}`,
        externalPath: `/job/L/J_${start + i}`,
      })),
    });
  });

  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );

  assert.equal(requests[0].limit, 20);
  assert.deepEqual(
    requests.map((request) => request.offset),
    [0, 20, 40],
  );
  assert.equal(parsed.length, 41);
});

test("exactly 5,000 reported Workday jobs can paginate through 250 pages", async (t) => {
  const offsets = [];
  installWorkdayFetch(t, async (url, init) => {
    if (init.method === "GET")
      return json({
        jobPostingInfo: {
          jobReqId: url.split("_").at(-1),
          jobDescription: "<p>Ok</p>",
        },
      });
    const { limit, offset } = JSON.parse(init.body);
    offsets.push(offset);
    assert.equal(limit, 20);
    return json({
      total: 5000,
      jobPostings: Array.from({ length: 20 }, (_, i) => ({
        title: `Job ${offset + i}`,
        externalPath: `/job/L/J_${offset + i}`,
      })),
    });
  });

  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );

  assert.equal(parsed.length, 5000);
  assert.equal(offsets.length, 250);
  assert.equal(offsets[0], 0);
  assert.equal(offsets.at(-1), 4980);
});

test("repeated postings fetch detail once", async (t) => {
  let details = 0;
  installWorkdayFetch(t, async (_url, init) => {
    if (init.method === "GET") {
      details += 1;
      return json({ jobPostingInfo: { jobReqId: "R1" } });
    }
    return json({
      jobPostings: [
        { title: "A", externalPath: "/job/L/A_R1" },
        { title: "A again", externalPath: "/job/L/A_R1" },
      ],
    });
  });
  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );
  assert.equal(parsed.length, 1);
  assert.equal(details, 1);
});

test("maximum-page guard and inconsistent pagination fail rather than truncate", async (t) => {
  const tiny = loadProvider({
    "export const WORKDAY_MAX_PAGES = Math.ceil(\n  WORKDAY_MAX_JOBS / WORKDAY_PAGE_SIZE,\n);":
      "export const WORKDAY_MAX_PAGES = 1;",
  }).workdayProvider;
  installWorkdayFetch(t, async () =>
    json({
      total: 21,
      jobPostings: Array.from({ length: 20 }, (_, i) => ({
        title: `Job ${i}`,
        externalPath: `/job/L/J_${i}`,
      })),
    }),
  );
  await assert.rejects(
    () =>
      tiny.parseJobs(careersPage("https://tenant.wd5.myworkdayjobs.com/Site")),
    /safe page limit/,
  );
});

test("non-progressing short page with larger total fails safely", async (t) => {
  installWorkdayFetch(t, async () => json({ total: 10, jobPostings: [] }));
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /ended before the reported total/,
  );
});

test("total job limit fails safely", async (t) => {
  installWorkdayFetch(t, async () => json({ total: 5001, jobPostings: [] }));
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /safe import limit/,
  );
});

test("bounded detail concurrency is used and output order remains deterministic", async (t) => {
  let active = 0;
  let maxActive = 0;
  installWorkdayFetch(t, async (url, init) => {
    if (init.method === "POST")
      return json({
        jobPostings: Array.from({ length: 12 }, (_, i) => ({
          title: `Job ${i}`,
          externalPath: `/job/L/J_${i}`,
        })),
      });
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return json({
      jobPostingInfo: {
        jobReqId: url.split("_").at(-1),
        jobDescription: "<p>Ok</p>",
      },
    });
  });
  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );
  assert.equal(maxActive, WORKDAY_DETAIL_CONCURRENCY);
  assert.deepEqual(
    parsed.map((job) => job.externalId),
    Array.from({ length: 12 }, (_, i) => String(i)),
  );
});

test("overall deadline fails the complete parse", async (t) => {
  const fastTimeout = loadProvider({
    "export const WORKDAY_PARSE_TIMEOUT_MS = 30_000;":
      "export const WORKDAY_PARSE_TIMEOUT_MS = 1;",
  }).workdayProvider;
  installWorkdayFetch(t, async (_url, init) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return init.method === "POST"
      ? json({
          jobPostings: [{ title: "Slow", externalPath: "/job/L/Slow_R1" }],
        })
      : json({ jobPostingInfo: { jobReqId: "R1" } });
  });
  await assert.rejects(
    () =>
      fastTimeout.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /timed out/,
  );
});

test("per-response and cumulative byte limits fail safely", async (t) => {
  const tiny = loadProvider({
    "export const WORKDAY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;":
      "export const WORKDAY_MAX_RESPONSE_BYTES = 20;",
    "export const WORKDAY_MAX_CUMULATIVE_BYTES = 40 * 1024 * 1024;":
      "export const WORKDAY_MAX_CUMULATIVE_BYTES = 200;",
  }).workdayProvider;
  installWorkdayFetch(
    t,
    async () =>
      new Response(JSON.stringify({ jobPostings: [] }), {
        headers: { "content-type": "application/json", "content-length": "21" },
      }),
  );
  await assert.rejects(
    () =>
      tiny.parseJobs(careersPage("https://tenant.wd5.myworkdayjobs.com/Site")),
    /too large/,
  );
  const cumulative = loadProvider({
    "export const WORKDAY_MAX_CUMULATIVE_BYTES = 40 * 1024 * 1024;":
      "export const WORKDAY_MAX_CUMULATIVE_BYTES = 120;",
  }).workdayProvider;
  installWorkdayFetch(t, async (_url, init) =>
    init.method === "POST"
      ? json({
          jobPostings: [
            { title: "A", externalPath: "/job/L/A_R1" },
            { title: "B", externalPath: "/job/L/B_R2" },
          ],
        })
      : json({
          jobPostingInfo: { jobReqId: "R", jobDescription: "x".repeat(80) },
        }),
  );
  await assert.rejects(
    () =>
      cumulative.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /cumulative/,
  );
});

test("non-JSON and HTML responses fail safely", async (t) => {
  installWorkdayFetch(
    t,
    async () =>
      new Response("<html>nope</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /not JSON/,
  );
  installWorkdayFetch(
    t,
    async () =>
      new Response("{", { headers: { "content-type": "application/json" } }),
  );
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /response JSON was malformed/,
  );
});

test("redirect policy rejects other hosts and accepts bounded same-host redirects", async (t) => {
  installWorkdayFetch(t, async (url) =>
    url.includes("redirected")
      ? json({ jobPostings: [] })
      : new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/redirected" },
        }),
  );
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /unsupported host/,
  );
  installWorkdayFetch(t, async (url) =>
    url.includes("redirected")
      ? json({ jobPostings: [] })
      : new Response(null, {
          status: 302,
          headers: {
            location: "https://tenant.wd5.myworkdayjobs.com/redirected",
          },
        }),
  );
  assert.deepEqual(
    await workdayProvider.parseJobs(
      careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
    ),
    [],
  );
});

test("one failed detail request fails the complete parse to avoid false closures", async (t) => {
  installWorkdayFetch(t, async (_url, init) =>
    init.method === "POST"
      ? json({ jobPostings: [{ title: "A", externalPath: "/job/L/A_R1" }] })
      : new Response("No", { status: 500 }),
  );
  await assert.rejects(
    () =>
      workdayProvider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    /Workday jobs request failed\./,
  );
});

function captureConsoleError(t) {
  const calls = [];
  const previousError = console.error;
  t.after(() => {
    console.error = previousError;
  });
  console.error = (...args) => {
    calls.push(args);
  };
  return calls;
}

async function assertWorkdayFailureLog(provider, handler, expectedLog) {
  globalThis.fetch = handler;
  await assert.rejects(() =>
    provider.parseJobs(
      careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
    ),
  );
  return expectedLog;
}

test("Workday first-page listing failures log only fixed safe diagnostic categories", async (t) => {
  const logs = captureConsoleError(t);
  const tinyResponse = loadProvider({
    "export const WORKDAY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;":
      "export const WORKDAY_MAX_RESPONSE_BYTES = 20;",
  }).workdayProvider;
  const fastRequestTimeout = loadProvider({
    "export const WORKDAY_REQUEST_TIMEOUT_MS = 10_000;":
      "export const WORKDAY_REQUEST_TIMEOUT_MS = 1;",
    "export const WORKDAY_PARSE_TIMEOUT_MS = 30_000;":
      "export const WORKDAY_PARSE_TIMEOUT_MS = 1_000;",
  }).workdayProvider;
  const fastOverallTimeout = loadProvider({
    "export const WORKDAY_PARSE_TIMEOUT_MS = 30_000;":
      "export const WORKDAY_PARSE_TIMEOUT_MS = 1;",
  }).workdayProvider;

  const cases = [
    [
      workdayProvider,
      async () =>
        new Response("secret status 400 body PapaJohns", { status: 400 }),
      "http_400",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 401 body PapaJohns", { status: 401 }),
      "http_401",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 403 body PapaJohns", { status: 403 }),
      "http_403",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 404 body PapaJohns", { status: 404 }),
      "http_404",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 429 body PapaJohns", { status: 429 }),
      "http_429",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 500 body PapaJohns", { status: 500 }),
      "http_5xx",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 503 body PapaJohns", { status: 503 }),
      "http_5xx",
    ],
    [
      workdayProvider,
      async () =>
        new Response("secret status 418 body PapaJohns", { status: 418 }),
      "http_other",
    ],
    [
      workdayProvider,
      async () => {
        throw new Error("secret network message PapaJohns tenant Site");
      },
      "network_failure",
    ],
    [
      workdayProvider,
      async () =>
        new Response('{"jobPostings": [', {
          headers: { "content-type": "application/json" },
        }),
      "malformed_json",
    ],
    [
      workdayProvider,
      async () =>
        new Response("<html>secret PapaJohns body</html>", {
          headers: { "content-type": "text/html" },
        }),
      "non_json_response",
    ],
    [
      tinyResponse,
      async () =>
        new Response(JSON.stringify({ jobPostings: [] }), {
          headers: {
            "content-type": "application/json",
            "content-length": "21",
          },
        }),
      "response_too_large",
    ],
    [
      workdayProvider,
      async () => json({ total: 5001, jobPostings: [] }),
      "reported_total_too_large",
    ],
    [
      workdayProvider,
      async () => json({ jobPostings: "secret malformed payload" }),
      "malformed_listing",
    ],
    [
      workdayProvider,
      async () =>
        json({
          jobPostings: [
            {
              title: "Secret Cook",
              externalPath: "https://evil.example/job/X/Y_R1",
            },
          ],
        }),
      "invalid_external_path",
    ],
    [
      fastRequestTimeout,
      async (_url, init) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (init.signal.aborted)
          throw Object.assign(new Error("secret abort"), {
            name: "AbortError",
          });
        return json({ jobPostings: [] });
      },
      "request_timeout",
    ],
    [
      fastOverallTimeout,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json({ jobPostings: [] });
      },
      "overall_timeout",
    ],
  ];

  for (const [provider, handler, failureCode] of cases) {
    await assertWorkdayFailureLog(provider, handler, {
      provider: "workday",
      stage: "listing",
      failureCode,
    });
  }

  assert.deepEqual(
    logs.map((args) => args[0]),
    cases.map(([, , failureCode]) => ({
      provider: "workday",
      stage: "listing",
      failureCode,
    })),
  );
  for (const args of logs) {
    assert.equal(args.length, 1);
    assert.doesNotMatch(
      JSON.stringify(args),
      /secret|PapaJohns|Cook|evil\.example|tenant|Site|myworkdayjobs|stack|payload|status 400|status 401|status 403|status 404|status 418|status 429|status 500|status 503|network message/i,
    );
  }
});

test("Workday pagination and detail failures log distinct safe diagnostic categories", async (t) => {
  const logs = captureConsoleError(t);
  const tinyCumulative = loadProvider({
    "export const WORKDAY_MAX_CUMULATIVE_BYTES = 40 * 1024 * 1024;":
      "export const WORKDAY_MAX_CUMULATIVE_BYTES = 120;",
  }).workdayProvider;
  const tinyPages = loadProvider({
    "export const WORKDAY_MAX_PAGES = Math.ceil(\n  WORKDAY_MAX_JOBS / WORKDAY_PAGE_SIZE,\n);":
      "export const WORKDAY_MAX_PAGES = 1;",
  }).workdayProvider;

  const paged =
    (firstTotal, secondTotal, secondJobs = []) =>
    async (_url, init) => {
      const offset = JSON.parse(init.body).offset;
      if (offset === 0)
        return json({
          total: firstTotal,
          jobPostings: Array.from({ length: 20 }, (_, i) => ({
            title: `Job ${i}`,
            externalPath: `/job/L/J_${i}`,
          })),
        });
      return json({ total: secondTotal, jobPostings: secondJobs });
    };

  const cases = [
    [
      tinyCumulative,
      async (_url, init) =>
        init.method === "POST"
          ? json({
              jobPostings: [
                { title: "Secret A", externalPath: "/job/L/A_R1" },
                { title: "Secret B", externalPath: "/job/L/B_R2" },
              ],
            })
          : json({
              jobPostingInfo: { jobReqId: "R", jobDescription: "x".repeat(80) },
            }),
      { provider: "workday", stage: "detail", failureCode: "detail_failed" },
    ],
    [
      workdayProvider,
      paged(101, 102),
      {
        provider: "workday",
        stage: "listing",
        failureCode: "pagination_total_changed",
      },
    ],
    [
      workdayProvider,
      async () => json({ total: 10, jobPostings: [] }),
      {
        provider: "workday",
        stage: "listing",
        failureCode: "pagination_incomplete",
      },
    ],
    [
      workdayProvider,
      async (_url, init) =>
        JSON.parse(init.body).offset === 0
          ? json({
              jobPostings: Array.from({ length: 20 }, (_, i) => ({
                title: `Job ${i}`,
                externalPath: `/job/L/J_${i}`,
              })),
            })
          : json({
              total: 10,
              jobPostings: [
                { title: "Extra", externalPath: "/job/L/Extra_R1" },
              ],
            }),
      {
        provider: "workday",
        stage: "listing",
        failureCode: "pagination_non_progressing",
      },
    ],
    [
      tinyPages,
      async () =>
        json({
          total: 41,
          jobPostings: Array.from({ length: 20 }, (_, i) => ({
            title: `Job ${i}`,
            externalPath: `/job/L/J_${i}`,
          })),
        }),
      {
        provider: "workday",
        stage: "listing",
        failureCode: "pagination_limit_exceeded",
      },
    ],
    [
      workdayProvider,
      async (_url, init) =>
        init.method === "POST"
          ? json({ jobPostings: [{ title: "A", externalPath: "/job/L/A_R1" }] })
          : new Response("No", { status: 500 }),
      { provider: "workday", stage: "detail", failureCode: "detail_failed" },
    ],
  ];

  for (const [provider, handler] of cases) {
    globalThis.fetch = handler;
    await assert.rejects(() =>
      provider.parseJobs(
        careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
      ),
    );
  }

  assert.deepEqual(
    logs.map((args) => args[0]),
    cases.map(([, , expected]) => expected),
  );
  for (const args of logs) {
    assert.equal(args.length, 1);
    assert.doesNotMatch(
      JSON.stringify(args),
      /Secret|Extra|\/job\/|tenant|Site|myworkdayjobs|status 500|stack/i,
    );
  }
});

test("successful Workday parsing does not log an error", async (t) => {
  const logs = captureConsoleError(t);
  installWorkdayFetch(t, async (_url, init) =>
    init.method === "POST"
      ? json({
          jobPostings: [{ title: "Host", externalPath: "/job/Towson/Host_R1" }],
        })
      : json({
          jobPostingInfo: { jobReqId: "R1", jobDescription: "<p>Host</p>" },
        }),
  );

  const parsed = await workdayProvider.parseJobs(
    careersPage("https://tenant.wd5.myworkdayjobs.com/Site"),
  );
  assert.equal(parsed.length, 1);
  assert.deepEqual(logs, []);
});

test("provider registration includes Workday without removing Greenhouse", () => {
  const source = readFileSync(registryPath, "utf8");
  assert.match(source, /greenhouseProvider, workdayProvider/);
  assert.match(source, /import \{ workdayProvider \}/);
});
