/**
 * Per-client rate limiting for POST /chat, backed by a Cloudflare Workers
 * Rate Limiting binding (CHAT_LIMITER, configured in wrangler.toml).
 */

/** Cloudflare sets cf-connecting-ip; local dev has none, so share one bucket. */
export function clientKey(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Returns true if this request may proceed. With no binding (local dev) or a
 * limiter error it lets the request through, so an outage in the limiter does
 * not take Uncle down.
 */
export async function allowRequest(env, request) {
  const limiter = env.CHAT_LIMITER;
  if (!limiter) {
    console.warn("CHAT_LIMITER binding is not configured, rate limiting is off");
    return true;
  }
  try {
    const { success } = await limiter.limit({ key: clientKey(request) });
    return success;
  } catch (err) {
    console.error("rate limiter failed, allowing request:", err);
    return true;
  }
}
