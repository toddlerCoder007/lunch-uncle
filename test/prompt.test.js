import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/prompt.js";

test("system prompt is identical across calls so provider caching can hit", () => {
  assert.equal(buildSystemPrompt(), buildSystemPrompt());
});

test("system prompt carries no per-request id or timestamp", () => {
  const p = buildSystemPrompt();
  assert.doesNotMatch(p, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  assert.doesNotMatch(p, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
});
