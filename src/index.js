import ui from "./ui.html";
import { runLoop } from "./loop.js";
import { validateChatBody } from "./validate.js";
import { allowRequest } from "./ratelimit.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/") {
      return new Response(ui, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "POST" && pathname === "/chat") {
      return handleChat(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleChat(request, env) {
  if (!(await allowRequest(env, request))) {
    return new Response(
      JSON.stringify({ error: "Uncle needs a break. Try again in a minute." }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const checked = validateChatBody(body);
  if (checked.error) {
    return json({ error: checked.error }, 400);
  }
  const { history, message } = checked;

  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return streamChat(history, message, env);
  }

  try {
    const reply = await runLoop(history, message, env);
    return json({ reply });
  } catch (err) {
    console.error("chat failed:", err);
    return json({ error: "Uncle cannot think right now, try again later." }, 500);
  }
}

// Server-sent events: "step" while tools run, then one "reply" or "error".
function streamChat(history, message, env) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emit = (event, data) =>
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});

  (async () => {
    try {
      const reply = await runLoop(history, message, env, (step) => emit("step", step));
      await emit("reply", { reply });
    } catch (err) {
      console.error("chat failed:", err);
      await emit("error", { error: "Uncle cannot think right now, try again later." });
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
