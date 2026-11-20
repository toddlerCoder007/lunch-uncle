export const MAX_MESSAGE_CHARS = 500;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_HISTORY_CONTENT_CHARS = 2000;

/**
 * Validate the POST /chat body. Returns { error } or { message, history }.
 * Pure, so it can be tested without a Worker runtime.
 */
export function validateChatBody(body) {
  const { history = [], message } = body ?? {};
  if (typeof message !== "string" || message.trim() === "") {
    return { error: "message is required" };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { error: `message must be at most ${MAX_MESSAGE_CHARS} characters` };
  }
  const validHistory =
    Array.isArray(history) &&
    history.every(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length <= MAX_HISTORY_CONTENT_CHARS,
    );
  if (!validHistory) {
    return { error: "history must be short user/assistant messages" };
  }
  // Older turns cost tokens on every round and add little, so drop them.
  return { message, history: history.slice(-MAX_HISTORY_MESSAGES) };
}
