import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test(".gitignore covers .env and .dev.vars so secrets are never committed", () => {
  const lines = readFileSync(new URL("../.gitignore", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim());
  assert.ok(lines.includes(".env"));
  assert.ok(lines.includes(".dev.vars"));
});
