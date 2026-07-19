import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, BookOpen, Webhook, PhoneForwarded, PhoneOff, Plus, X, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/tools")({
  component: ToolsLibrary,
});

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string; description: string }> = {
  knowledge_base: {
    icon: <BookOpen className="w-4 h-4" />,
    label: "Knowledge Base",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    description: "Search uploaded documents during calls",
  },
  webhook: {
    icon: <Webhook className="w-4 h-4" />,
    label: "Webhook",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    description: "Call an external HTTP endpoint",
  },
  transfer_call: {
    icon: <PhoneForwarded className="w-4 h-4" />,
    label: "Transfer Call",
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    description: "Forward the call to a human agent",
  },
  end_call: {
    icon: <PhoneOff className="w-4 h-4" />,
    label: "End Call",
    color: "bg-red-500/10 text-red-600 border-red-500/20",
    description: "Hang up the call gracefully",
  },
};

function ToolsLibrary() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [toolName, setToolName] = useState("");
  const [toolDescription, setToolDescription] = useState("");
  const [toolType, setToolType] = useState("knowledge_base");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["tools_library"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tools").select("*");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const config: Record<string, any> = {};
      if (toolType === "webhook") config.url = webhookUrl;
      if (toolType === "transfer_call") config.forward_to = transferTo;

      const { data, error } = await supabase
        .from("tools")
        .insert({ name: toolName, description: toolDescription, tool_type: toolType, config_json: config })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools_library"] });
      qc.invalidateQueries({ queryKey: ["tools"] });
      toast.success("Tool created successfully.");
      setShowCreate(false);
      setToolName(""); setToolDescription(""); setToolType("knowledge_base"); setWebhookUrl(""); setTransferTo("");
    },
    onError: (err: any) => toast.error("Failed to create tool", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools_library"] });
      qc.invalidateQueries({ queryKey: ["tools"] });
      toast.success("Tool deleted.");
    },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Tools Library</h2>
          <p className="text-sm text-muted-foreground mt-1">Create reusable tools that your assistants can invoke during calls.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Tool
        </button>
      </div>

      {/* Create Tool Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Create Tool</h3>
                </div>
                <button onClick={() => setShowCreate(false)} className="p-1.5 rounded text-muted-foreground hover:bg-accent">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tool Name</Label>
                  <Input
                    value={toolName}
                    onChange={e => setToolName(e.target.value)}
                    placeholder="e.g. Search Admissions FAQ"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={toolDescription}
                    onChange={e => setToolDescription(e.target.value)}
                    placeholder="Describe what this tool does and when the AI should use it..."
                    className="resize-none"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tool Type</Label>
                  <Select value={toolType} onValueChange={setToolType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([value, meta]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            {meta.icon}
                            <span>{meta.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{TYPE_META[toolType]?.description}</p>
                </div>
                {toolType === "webhook" && (
                  <div className="space-y-1.5">
                    <Label>Webhook URL</Label>
                    <Input
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      placeholder="https://your-api.com/webhook"
                      className="font-mono"
                    />
                  </div>
                )}
                {toolType === "transfer_call" && (
                  <div className="space-y-1.5">
                    <Label>Transfer To Number</Label>
                    <Input
                      value={transferTo}
                      onChange={e => setTransferTo(e.target.value)}
                      placeholder="+919876543210"
                      className="font-mono"
                    />
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={!toolName || createMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Tool
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tools Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted/40 border border-border" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border-2 border-dashed border-border text-center gap-3">
          <Wrench className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No tools yet. Create your first tool to get started.</p>
          <button onClick={() => setShowCreate(true)} className="text-sm text-primary hover:underline">
            Create a tool →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool: any, i: number) => {
            const meta = TYPE_META[tool.tool_type] || { icon: <Wrench className="w-4 h-4" />, label: tool.tool_type, color: "bg-muted text-muted-foreground", description: "" };
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group rounded-xl border border-border bg-card p-5 flex flex-col hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(tool.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{tool.name}</h3>
                <p className="text-xs text-muted-foreground flex-1 line-clamp-2">
                  {tool.description || meta.description}
                </p>
                {tool.config_json?.url && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <code className="text-[10px] text-muted-foreground font-mono truncate block">{tool.config_json.url}</code>
                  </div>
                )}
                {tool.config_json?.forward_to && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <code className="text-[10px] text-muted-foreground font-mono">{tool.config_json.forward_to}</code>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
