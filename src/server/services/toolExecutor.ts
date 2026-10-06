import { getKBDocuments } from "../supabase";
import { executeAction } from "../actions/runner";
import { ACTION_REGISTRY } from "../actions/registry";

export async function executeTool(
  toolName: string,
  input: any,
  assistantTools: any[] = [],
  userId?: string,
  callId?: string,
  callerPhone?: string
): Promise<string> {
  // Check Action Registry first (all 11 built-in and domain actions)
  if (ACTION_REGISTRY[toolName]) {
    if (!userId) return "Unable to verify organization authorization.";
    const result = await executeAction(toolName, input, {
      userId,
      callId,
      callerNumber: input?.phone || input?.customer_phone || callerPhone,
    });
    return result.message;
  }

  // Find the matched tool configuration in custom assistant tools
  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const matchedTool = assistantTools.find(
    (t) =>
      t.name === toolName ||
      t.tool_type === toolName ||
      sanitize(t.name) === toolName ||
      sanitize(t.tool_type || "") === toolName
  );

  if (!matchedTool) {
    return `Error: Tool '${toolName}' not found or not enabled for this assistant.`;
  }

  try {
    switch (matchedTool.tool_type) {
      case "knowledge_base": {
        const query = input.query || "";
        console.log(`[ToolExecutor] Executing knowledge_base search for: ${query}`);
        const docs = await getKBDocuments(matchedTool.id);

        if (!docs || docs.length === 0) {
          return "No knowledge base documents found for this query.";
        }

        // Return concatenated relevant content
        const combined = docs
          .map((d: any) => `Document: ${d.title}\nContent:\n${d.content}`)
          .join("\n\n---\n\n");

        return combined.slice(0, 1500); // Guard token length
      }

      case "webhook": {
        const endpoint = matchedTool.config?.url;
        if (!endpoint) {
          return "Error: Webhook tool does not have a configured URL.";
        }

        const res = await fetch(endpoint, {
          method: matchedTool.config?.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(matchedTool.config?.headers || {}),
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(5000),
        });

        const text = await res.text();
        return `Webhook response (status ${res.status}): ${text.slice(0, 1000)}`;
      }

      default:
        return `Error: Unsupported tool type '${matchedTool.tool_type}'`;
    }
  } catch (err: any) {
    console.error(`[ToolExecutor] Error executing tool '${toolName}':`, err);
    return `Tool execution failed: ${err.message}`;
  }
}
