import { buildSystemPrompt } from "./prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";

const LLM_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const LLM_MODEL = "glm-5";

const LLM_TIMEOUT_MS = 20_000;
const MAX_ROUNDS = 8;
// Stop calling tools once a turn has run this long, then ask for a final answer.
const TURN_BUDGET_MS = 60_000;

const FALLBACK_REPLY = "Just go Berseh Food Centre lah.";
const EMPTY_REPLY = "Uncle blur for a moment. Ask again lah.";

/**
 * Run the agentic loop for one user turn and return Uncle's reply.
 *
 * history is the prior conversation as OpenAI-style {role, content} messages.
 */
export async function runLoop(history, message, env) {
  // If the Places key is missing, Uncle cannot search, so give a safe answer.
  if (!env.GOOGLE_PLACES_API_KEY) {
    return FALLBACK_REPLY;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...history,
    { role: "user", content: message },
  ];

  // One session id per turn, shared by every model call in this loop run,
  // so the OpenCode Go endpoint can route and cache consistently.
  const sessionId = crypto.randomUUID();

  const deadline = Date.now() + TURN_BUDGET_MS;

  for (let round = 0; round < MAX_ROUNDS && Date.now() < deadline; round++) {
    const assistant = await callModel(messages, env, sessionId);
    messages.push(assistant);

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return replyText(assistant);
    }

    for (const [i, call] of toolCalls.entries()) {
      const name = call?.function?.name ?? "";
      const args = parseArgs(call?.function?.arguments);
      console.log(`round ${round}: ${name}`, args);
      let result;
      try {
        result = await executeTool(name, args, env);
      } catch (err) {
        console.error(`tool ${name} failed:`, err);
        result = JSON.stringify({ error: "Tool failed, try without it." });
      }
      messages.push({
        role: "tool",
        tool_call_id: call?.id ?? `call_${round}_${i}`,
        content: result,
      });
    }
  }

  // Out of rounds or time: the tool results are already collected, so ask for
  // an answer without offering tools instead of throwing the work away.
  const final = await callModel(messages, env, sessionId, { withTools: false });
  return replyText(final);
}

async function callModel(messages, env, sessionId, { withTools = true } = {}) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`,
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      ...(withTools ? { tools: toolDefinitions } : {}),
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LLM returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== "object") {
    throw new Error(`LLM returned no message: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return message;
}

function replyText(message) {
  const text = typeof message.content === "string" ? message.content.trim() : "";
  return text || EMPTY_REPLY;
}

function parseArgs(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
