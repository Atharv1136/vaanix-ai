import { ActionKey } from "../../lib/domainPacks";

export interface ActionContext {
  userId: string;
  agentId?: string;
  callId?: string;
  callerNumber?: string;
  now?: Date;
  config?: Record<string, any>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  error?: string;
  data?: any;
  spokenFallback?: string;
}

export interface ActionDefinition {
  key: ActionKey;
  label: string;
  description: string;
  phase: "live" | "post_call";
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  spokenFallback: string;
  handler: (input: any, ctx: ActionContext) => Promise<ActionResult>;
}
