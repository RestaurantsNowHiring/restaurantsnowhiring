import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
async function dataUnderTest() {
  const source = await read("lib/resumeBuilder.ts");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const blankExperience = (overrides = {}) => ({ employer:"", position:"", location:"", startMonth:"", startYear:"", endMonth:"", endYear:"", current:false, bullets:[], ...overrides });

test("resume builder route has unsuffixed metadata and client tool", async () => {
  const page = await read("app/candidate-resources/resume-builder/page.tsx");
  assert.match(page, /title:"Restaurant Resume Builder"/);
  assert.doesNotMatch(page, /Restaurant Resume Builder \|/);
  assert.match(page, /ResumeBuilderClient/);
});

test("all supported roles and role-specific data exist", async () => {
  const data = await read("lib/resumeBuilder.ts");
  for (const role of ["Server","Bartender","Host / Hostess","Cashier","Line Cook","Prep Cook","Dishwasher","Shift Leader","Kitchen Manager","Restaurant Manager","General Manager"]) assert.ok(data.includes(role));
  assert.match(data, /ROLE_SKILLS/);
  assert.match(data, /RESPONSIBILITIES/);
  assert.match(data, /Other:generic/);
});

test("builder supports experience, suggestions, custom bullets and validation", async () => {
  const client = await read("app/candidate-resources/resume-builder/ResumeBuilderClient.tsx");
  assert.match(client, /\+ Add Experience/);
  assert.match(client, /Suggested responsibilities/);
  assert.match(client, /Write your own responsibility/);
  assert.match(client, /Enter your full name/);
  assert.match(client, /Enter an employer/);
  assert.match(client, /Choose a position/);
});

test("blank experience rows are ignored while partial rows remain meaningful", async () => {
  const { isEmptyExperience, summaryFor } = await dataUnderTest();
  assert.equal(isEmptyExperience(blankExperience()), true);
  assert.equal(isEmptyExperience(blankExperience({ employer:"Cafe" })), false);
  assert.equal(isEmptyExperience(blankExperience({ position:"Server" })), false);
  assert.match(summaryFor("Server", ["Guest Service"], 0), /ready to contribute/);
  assert.doesNotMatch(summaryFor("Server", ["Guest Service"], 0), /with experience/);
  const client = await read("app/candidate-resources/resume-builder/ResumeBuilderClient.tsx");
  assert.match(client, /exps\.filter\(x=>!isEmptyExperience\(x\)\)/);
  assert.match(client, /if\(!x\.employer\.trim\(\)\)/);
  assert.match(client, /if\(!x\.position\.trim\(\)\)/);
});

test("custom certification is gated by Other and Start Over clears it", async () => {
  const client = await read("app/candidate-resources/resume-builder/ResumeBuilderClient.tsx");
  assert.match(client, /certs\.includes\("Other"\)&&otherCert\.trim\(\)/);
  assert.match(client, /setOtherCert\(""\)/);
});

test("preview, print, and jobs actions exist without persistence", async () => {
  const client = await read("app/candidate-resources/resume-builder/ResumeBuilderClient.tsx");
  assert.match(client, /resume-preview/);
  assert.match(client, /window\.print\(\)/);
  assert.match(client, /Download \/ Print Resume/);
  assert.match(client, /href="\/jobs"/);
  assert.doesNotMatch(client, /supabase|\.from\(|localStorage|sessionStorage/i);
});

test("screen preview uses a centered, paper-proportioned resume layout", async () => {
  const css = await read("app/candidate-resources/resume-builder/resumeBuilder.module.css");
  const screenCss = css.slice(0, css.indexOf("@media print"));
  assert.match(screenCss, /\.resume\{[^}]*max-width:816px[^}]*min-height:1056px[^}]*margin:0 auto[^}]*background:#fff/);
  assert.match(screenCss, /\.resume\{[^}]*padding:62px 67px[^}]*box-shadow:/);
  assert.match(screenCss, /\.resume header h1\{[^}]*font:700 31px/);
  assert.match(screenCss, /\.resume header h2\{[^}]*font-size:15px/);
  assert.match(screenCss, /\.resume section>h2\{[^}]*font-size:12px/);
  assert.match(screenCss, /\.resumeEntry ul\{list-style:disc outside/);
  assert.doesNotMatch(screenCss, /\.resume header\{[^}]*border/);
  assert.match(screenCss, /\.resume section>h2\{[^}]*border-bottom:\.[5-9]px solid #[a-f\d]{6}/i);
});

test("every major resume section uses the shared subtle-divider treatment", async () => {
  const client = await read("app/candidate-resources/resume-builder/ResumeBuilderClient.tsx");
  for (const title of ["Professional Summary", "Experience", "Skills", "Education", "Certifications"]) {
    assert.ok(client.includes(`title="${title}"`), `${title} should use the shared Section component`);
  }
});

test("print output excludes global chrome and builder controls with Letter margins", async () => {
  const [css, layout] = await Promise.all([read("app/candidate-resources/resume-builder/resumeBuilder.module.css"), read("app/layout.tsx")]);
  assert.match(layout, /className="global-site-footer"/);
  for (const selector of [":global(.top-banner)", ":global(.top-banner__mobile-spacer)", ":global(.global-site-footer)", ".noPrint", ".jobs"]) assert.ok(css.includes(selector), selector);
  assert.match(css, /@page\{size:Letter portrait;margin:\.65in\}/);
  assert.match(css, /box-shadow:none!important/);
  assert.match(css, /break-inside:avoid/);
  assert.doesNotMatch(css, /body>header|body>nav/);
});

test("print typography has a readable professional hierarchy and resume bullets", async () => {
  const css = await read("app/candidate-resources/resume-builder/resumeBuilder.module.css");
  const printCss = css.slice(css.indexOf("@media print"));
  const size = (selector) => Number(printCss.match(new RegExp(`${selector}\\{[^}]*font-size:([\\d.]+)pt`))?.[1]);
  const nameSize = size("\\.resume header h1");
  const roleSize = size("\\.resume header h2");
  const sectionSize = size("\\.resume section>h2");
  const bodySize = size("\\.resume");
  const jobHeadingSize = size("\\.resumeEntry h3,\\.resume section h3");
  assert.ok(nameSize > roleSize, "candidate name should be larger than target role");
  assert.ok(roleSize > sectionSize, "target role should be larger than section headings");
  assert.ok(bodySize >= 9.5, "print body text should remain readable");
  assert.ok(bodySize > sectionSize, "section labels should be smaller than body text");
  assert.ok(jobHeadingSize > sectionSize, "experience heading should be larger than section labels");
  assert.match(printCss, /\.resumeEntry ul\{[^}]*padding-left:1[5-9]px/);
  assert.match(printCss, /\.resumeEntry li\{[^}]*line-height:1\.[34][^}]*margin:[2-4]px 0/);
  assert.match(printCss, /\.resume header\{[^}]*border:0/);
  assert.match(printCss, /\.resume section>h2\{[^}]*border-bottom:\.[5-9]pt solid #[a-f\d]{6}/i);
});

test("print geometry fills a white Letter page without scaling or constrained ancestors", async () => {
  const css = await read("app/candidate-resources/resume-builder/resumeBuilder.module.css");
  const printCss = css.slice(css.indexOf("@media print"));
  assert.match(printCss, /@page\{size:Letter portrait;margin:\.65in\}/);
  assert.match(printCss, /:global\(html\),:global\(body\),:global\(#main-content\)\{[^}]*width:100%!important[^}]*max-width:none!important/);
  assert.match(printCss, /\.page,\.shell,\.previewWrap\{[^}]*width:100%!important[^}]*max-width:none!important[^}]*background:#fff!important/);
  assert.match(printCss, /\.resume\{[^}]*width:100%!important[^}]*max-width:none!important[^}]*background:#fff!important[^}]*box-shadow:none!important[^}]*border:0!important[^}]*outline:0!important/);
  assert.doesNotMatch(printCss, /transform\s*:|scale\s*\(|zoom\s*:/);
  assert.match(printCss, /\.resume\{[^}]*font-size:10\.5pt/);
  assert.match(printCss, /\.resumeEntry ul\{list-style:disc outside[^}]*padding-left:18px/);
  assert.match(printCss, /\.resumeEntry li\{display:list-item/);
});
