// The Anthropic provider's request side (STEP 11-prep §A1b): the gate's OpenRouter request as a
// Messages API body.

// Thinking off, each model's own way: no thinking blocks to replay in the history, the cheapest call.
const NO_THINKING: Record<string, { type: string }> = {
  "claude-sonnet-5-5": { type: "between_tools" },
  "claude-haiku-5-5": { type: "disabled" },
};

type Text = string | { type: "text"; text: string; cache_control?: unknown }[];
type GateMessage =
  | { role: "system" | "user"; content: Text }
  | {
      role: "assistant";
      content: string;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: Text };
export interface GateRequest {
  model: string;
  max_tokens: number;
  messages: GateMessage[];
  tools?: {
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }[];
}

function argumentsOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A call the model cut short: sent back as it was, so the next answer can see it.
    return { arguments: text };
  }
}

function assistantOf(message: Extract<GateMessage, { role: "assistant" }>) {
  return [
    ...(message.content ? [{ type: "text", text: message.content }] : []),
    ...(message.tool_calls ?? []).map((call) => ({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input: argumentsOf(call.function.arguments),
    })),
  ];
}

/** One gate message as the Messages API takes it; the system prompt goes in its own field. */
function turnOf(message: GateMessage): { role: string; content: unknown }[] {
  if (message.role === "user") {
    return [{ role: "user", content: message.content }];
  }
  if (message.role === "tool") {
    const result = {
      type: "tool_result",
      tool_use_id: message.tool_call_id,
      content: message.content,
    };
    return [{ role: "user", content: [result] }];
  }
  if (message.role === "assistant") {
    const content = assistantOf(message);
    return content.length > 0 ? [{ role: "assistant", content }] : [];
  }
  return [];
}

/** The Messages API body for a gate request: same words, same cache marks, same limits. */
export function messagesBody(request: GateRequest, model: string) {
  const system = request.messages.find((message) => message.role === "system");
  const messages = request.messages.flatMap(turnOf);
  return {
    model,
    max_tokens: request.max_tokens,
    stream: true,
    thinking: NO_THINKING[model],
    ...(system ? { system: system.content } : {}),
    ...(request.tools
      ? {
          tools: request.tools.map(({ function: tool }) => {
            const { $schema: _schema, ...input_schema } = tool.parameters;
            return { name: tool.name, description: tool.description, input_schema };
          }),
        }
      : {}),
    messages,
  };
}
