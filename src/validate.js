/**
 * Validate the POST /chat body. Returns { error } or { message, history }.
 * Pure, so it can be tested without a Worker runtime.
 */
export function validateChatBody(body) {
  const { history = [], message } = body ?? {};
  if (typeof message !== "string" || message.trim() === "") {
    return { error: "message is required" };
  }
  const validHistory =
    Array.isArray(history) &&
    history.every(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    );
  if (!validHistory) {
    return { error: "history must be user/assistant messages" };
  }
  return { message, history };
}
