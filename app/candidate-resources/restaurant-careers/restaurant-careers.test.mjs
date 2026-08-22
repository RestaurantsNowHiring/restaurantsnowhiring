import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
async function dataModule() {
  const source = await read("lib/restaurantCareers.ts");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

test("the explorer route and accessible filters exist", async () => {
  const [page, client] = await Promise.all([read("app/candidate-resources/restaurant-careers/page.tsx"), read("app/candidate-resources/restaurant-careers/RestaurantCareersClient.tsx")]);
  assert.match(page, /Restaurant Careers & Job Guides/);
  assert.match(client, /aria-pressed/);
  assert.match(client, /All Roles/);
});

test("all eleven unique, complete career records have unique SEO", async () => {
  const { restaurantCareers } = await dataModule();
  assert.equal(restaurantCareers.length, 11);
  assert.equal(new Set(restaurantCareers.map((role) => role.slug)).size, 11);
  assert.equal(new Set(restaurantCareers.map((role) => role.metadataDescription)).size, 11);
  for (const role of restaurantCareers) {
    for (const field of ["responsibilities", "skills", "goodFit", "careerPath", "interviewQuestions"]) assert.ok(role[field].length >= 3, `${role.slug}: ${field}`);
    assert.ok(role.experienceGuidance.length > 40, `${role.slug}: experience guidance`);
    assert.doesNotMatch(role.metadataDescription, /Restaurants Now Hiring/);
  }
});

test("shared dynamic guide resolves roles and links the candidate journey", async () => {
  const [{ restaurantCareers, getRestaurantCareer }, guide] = await Promise.all([dataModule(), read("app/candidate-resources/restaurant-careers/[slug]/page.tsx")]);
  for (const role of restaurantCareers) assert.equal(getRestaurantCareer(role.slug), role);
  assert.equal(getRestaurantCareer("not-a-role"), undefined);
  for (const route of ["/candidate-resources/resume-builder", "/candidate-resources/interview-practice", "/jobs", "/candidate-resources/restaurant-careers"]) assert.ok(guide.includes(route), route);
  assert.match(guide, /BreadcrumbList/);
});

test("career content adds no salary figures, persistence, or legal claims", async () => {
  const files = await Promise.all([read("lib/restaurantCareers.ts"), read("app/candidate-resources/restaurant-careers/[slug]/page.tsx")]);
  const content = files.join("\n");
  assert.doesNotMatch(content, /\$\s*\d|salary|minimum wage|tip credit|overtime|Supabase|\.from\(/i);
});
