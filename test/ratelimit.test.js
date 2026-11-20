import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, allowRequest } from "../src/ratelimit.js";

const req = (headers = {}) => new Request("https://uncle.test/chat", { method: "POST", headers });

test("clientKey uses the Cloudflare client IP, with a shared fallback", () => {
  assert.equal(clientKey(req({ "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientKey(req()), "unknown");
});

test("allowRequest asks the limiter with the client key and returns its verdict", async () => {
  const seen = [];
  const limiter = { limit: async (opts) => (seen.push(opts), { success: seen.length <= 2 }) };
  const env = { CHAT_LIMITER: limiter };
  const r = req({ "cf-connecting-ip": "203.0.113.7" });
  assert.equal(await allowRequest(env, r), true);
  assert.equal(await allowRequest(env, r), true);
  assert.equal(await allowRequest(env, r), false);
  assert.deepEqual(seen[0], { key: "203.0.113.7" });
});

test("allowRequest lets requests through when no limiter is bound (local dev)", async () => {
  assert.equal(await allowRequest({}, req()), true);
});

test("allowRequest fails open if the limiter itself errors", async () => {
  const env = { CHAT_LIMITER: { limit: async () => { throw new Error("boom"); } } };
  assert.equal(await allowRequest(env, req()), true);
});
