import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { runLoop } from "../src/loop.js";

const ENV = { GOOGLE_PLACES_API_KEY: "g", OPENCODE_API_KEY: "o" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Stub global fetch. `llm(body, n)` returns the assistant message, or
// `{ raw }` for a custom response body. Everything else goes to `other`.
function stub({ llm, other = () => ({}), llmStatus = 200 }) {
  const calls = { llm: [], other: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/chat/completions")) {
      const body = JSON.parse(init.body);
      calls.llm.push({ url: u, body, init });
      if (calls.llm.length > 30) throw new Error("runaway loop");
      const out = llm(body, calls.llm.length);
      const payload = out && out.raw ? out.raw : { choices: [{ message: out }] };
      return new Response(JSON.stringify(payload), { status: llmStatus });
    }
    calls.other.push({ url: u, init });
    return new Response(JSON.stringify(other(u, init)), { status: 200 });
  };
  return calls;
}
const say = (content) => ({ role: "assistant", content });
const toolCall = (name, args, id = "t1") => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

test("LLM call targets a real endpoint and model", async () => {
  const calls = stub({ llm: () => say("ok") });
  await runLoop([], "hi", ENV);
  assert.match(calls.llm[0].url, /^https:\/\/.+\/chat\/completions$/);
  assert.notEqual(calls.llm[0].body.model, "TODO");
});

test("after MAX_ROUNDS the model is asked for a final answer without tools", async () => {
  const calls = stub({
    llm: (body) =>
      body.tools
        ? { role: "assistant", content: null, tool_calls: [toolCall("get_rain_forecast", {})] }
        : say("final answer from the tool results"),
    other: () => ({ data: { items: [{ forecasts: [{ area: "Kallang", forecast: "Fair" }] }] } }),
  });
  const reply = await runLoop([], "will it rain", ENV);
  assert.equal(reply, "final answer from the tool results");
  assert.equal(calls.llm.length, 9);
  assert.equal(calls.llm.at(-1).body.tools, undefined);
});

test("a turn that exceeds its time budget stops calling tools and answers", async () => {
  let t = 1_000_000;
  mock.method(Date, "now", () => (t += 40_000));
  try {
    const calls = stub({
      llm: (body) =>
        body.tools
          ? { role: "assistant", content: null, tool_calls: [toolCall("get_rain_forecast", {})] }
          : say("answer before the deadline"),
      other: () => ({ data: { items: [{ forecasts: [] }] } }),
    });
    const reply = await runLoop([], "will it rain", ENV);
    assert.equal(reply, "answer before the deadline");
    assert.equal(calls.llm.length, 2);
  } finally {
    mock.restoreAll();
  }
});

test("food questions reach the model instead of the canned fallback", async () => {
  const calls = stub({ llm: () => say("Go Tiong Bahru lah.") });
  const reply = await runLoop([], "where to eat lunch?", ENV);
  assert.equal(reply, "Go Tiong Bahru lah.");
  assert.equal(calls.llm.length, 1);
});

test("a tool that throws becomes an error result instead of failing the turn", async () => {
  const calls = stub({
    llm: (body, n) =>
      n === 1
        ? { role: "assistant", content: null, tool_calls: [toolCall("get_rain_forecast", {})] }
        : say("Cannot check weather, just bring umbrella."),
    other: () => {
      throw new Error("network down");
    },
  });
  const reply = await runLoop([], "will it rain", ENV);
  assert.equal(reply, "Cannot check weather, just bring umbrella.");
  const toolMsg = calls.llm[1].body.messages.find((m) => m.role === "tool");
  assert.match(toolMsg.content, /error/i);
});

test("a 200 response without choices fails with a clear error", async () => {
  stub({ llm: () => ({ raw: { error: "overloaded" } }) });
  await assert.rejects(() => runLoop([], "hi", ENV), /no message/i);
});

test("a null or blank model reply becomes a friendly message, not an empty string", async () => {
  stub({ llm: () => ({ role: "assistant", content: null }) });
  assert.match(await runLoop([], "hi", ENV), /blur/);
  stub({ llm: () => say("   ") });
  assert.match(await runLoop([], "hi", ENV), /blur/);
});

test("a malformed tool call does not abort the turn and still gets a tool_call_id", async () => {
  const calls = stub({
    llm: (body, n) =>
      n === 1
        ? { role: "assistant", content: null, tool_calls: [{}] }
        : say("ok"),
  });
  assert.equal(await runLoop([], "hi", ENV), "ok");
  const toolMsg = calls.llm[1].body.messages.find((m) => m.role === "tool");
  assert.equal(typeof toolMsg.tool_call_id, "string");
});

test("a missing OPENCODE_API_KEY fails clearly before any request is made", async () => {
  const calls = stub({ llm: () => say("ok") });
  await assert.rejects(
    () => runLoop([], "hi", { GOOGLE_PLACES_API_KEY: "g" }),
    /OPENCODE_API_KEY/,
  );
  assert.equal(calls.llm.length, 0);
});

test("completion requests set a bounded max_tokens", async () => {
  const calls = stub({ llm: () => say("ok") });
  await runLoop([], "hi", ENV);
  const max = calls.llm[0].body.max_tokens;
  assert.equal(typeof max, "number");
  assert.ok(max > 0 && max <= 2000, `got ${max}`);
});
