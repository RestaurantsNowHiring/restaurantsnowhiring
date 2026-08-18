import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("TopBanner keeps every public and authenticated navigation control", async () => {
  const component = await read("app/components/TopBanner.tsx");
  for (const label of [
    "AVAILABLE JOBS",
    "CANDIDATE RESOURCES",
    "COMPANIES",
    "POST A JOB",
    "DASHBOARD",
    "PRICING",
    "ABOUT",
    "CONTACT",
    "EMPLOYER LOGIN / SIGN UP",
    "SIGN OUT",
  ]) {
    assert.ok(component.includes(label), `missing navigation control: ${label}`);
  }
});

test("intermediate widths use the mobile menu before navigation can overflow", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /@media \(max-width: 1199px\) \{[\s\S]*?\.top-banner__mobile-header \{[\s\S]*?display: flex/);
  assert.match(css, /@media \(min-width: 1200px\) \{[\s\S]*?\.top-banner__nav[\s\S]*?flex-wrap: nowrap/);
  assert.match(css, /@media \(min-width: 1200px\) and \(max-width: 1350px\) \{[\s\S]*?gap: 16px !important/);

  const mobileMax = Number(css.match(/@media \(max-width: (\d+)px\) \{\s*\.top-banner/)?.[1]);
  for (const [width, usesMobileMenu] of [
    [768, true],
    [900, true],
    [1024, true],
    [1100, true],
    [1280, false],
    [1440, false],
  ]) {
    assert.equal(width <= mobileMax, usesMobileMenu, `${width}px navigation mode`);
  }
});

test("expanded mobile menu accommodates authenticated navigation without clipping", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.top-banner--menu-open \.top-banner__menu \{\s*max-height: 520px/);
  assert.match(css, /\.top-banner__mobile-spacer--menu-open \{\s*height: 500px/);
  assert.match(css, /\.top-banner__inner \{[\s\S]*?box-sizing: border-box/);
});
