import { test, afterEach } from "node:test";
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

test("loop stops after MAX_ROUNDS when the model keeps calling tools", async () => {
  const calls = stub({
    llm: () => ({ role: "assistant", content: null, tool_calls: [toolCall("get_rain_forecast", {})] }),
    other: () => ({ data: { items: [{ forecasts: [{ area: "Kallang", forecast: "Fair" }] }] } }),
  });
  const reply = await runLoop([], "will it rain", ENV);
  assert.equal(typeof reply, "string");
  assert.equal(calls.llm.length, 8);
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
