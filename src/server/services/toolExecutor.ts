import { getKBDocuments } from "../supabase";

export async function executeTool(toolName: string, input: any, assistantTools: any[]): Promise<string> {
  // Find the matched tool configuration
  const matchedTool = assistantTools.find(t => t.name === toolName);
  
  if (!matchedTool) {
    return `Error: Tool '${toolName}' not found or not enabled for this assistant.`;
  }

  try {
    switch (matchedTool.tool_type) {
      case 'knowledge_base': {
        const query = input.query || "";
        console.log(`[ToolExecutor] Executing knowledge_base search for: ${query}`);
        // Simple search for MVP: return all KB documents for this tool_id.
        // For production, you'd want pgvector/embeddings or full-text search.
        const docs = await getKBDocuments(matchedTool.id);
        if (docs.length === 0) {
          return "No knowledge base documents found.";
        }
        
        // Very basic keyword match if query exists, else return all
        let matchedDocs = docs;
        if (query) {
          const lowerQuery = query.toLowerCase();
          matchedDocs = docs.filter(d => 
            d.title.toLowerCase().includes(lowerQuery) || 
            d.content.toLowerCase().includes(lowerQuery)
          );
          if (matchedDocs.length === 0) {
             matchedDocs = docs; // fallback to providing all if no exact keyword match
          }
        }
        
        const resultText = matchedDocs.map(d => `--- ${d.title} ---\n${d.content}`).join("\n\n");
        return resultText.substring(0, 4000); // truncate if too large for LLM context
      }
      
      case 'webhook': {
        console.log(`[ToolExecutor] Executing webhook for tool ${toolName}`);
        const config = matchedTool.config_json as any || {};
        const url = config.url;
        if (!url) return "Error: Webhook URL not configured.";
        
        const response = await fetch(url, {
          method: config.method || "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.headers || {})
          },
          body: JSON.stringify(input)
        });
        
        const text = await response.text();
        return text.substring(0, 2000);
      }
      
      case 'transfer_call': {
        console.log(`[ToolExecutor] Executing transfer_call`);
        // Signal to the conversation loop to issue a TwiML transfer command
        return JSON.stringify({ _action: "transfer_call" });
      }
      
      case 'end_call': {
        console.log(`[ToolExecutor] Executing end_call`);
        // Signal to the conversation loop to hang up
        return JSON.stringify({ _action: "end_call" });
      }

      default:
        return `Error: Unknown tool type '${matchedTool.tool_type}'.`;
    }
  } catch (error: any) {
    console.error(`[ToolExecutor] Error executing tool ${toolName}:`, error);
    return `Error executing tool: ${error.message}`;
  }
}
