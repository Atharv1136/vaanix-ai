import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, Plus, Copy, Check, X, Trash2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/api-keys")({
  component: ApiKeys,
});

function ApiKeys() {
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [keyLabel, setKeyLabel] = useState("");
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);
  const [newKeyVisible, setNewKeyVisible] = useState(false);

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["api_keys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (label: string) => {
      // Generate a random API key
      const rawKey = `cc_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data, error } = await supabase
        .from("api_keys")
        .insert({ key_hash: rawKey, label })
        .select()
        .single();
      if (error) throw error;
      return { key: rawKey, record: data };
    },
    onSuccess: ({ key }) => {
      qc.invalidateQueries({ queryKey: ["api_keys"] });
      setNewKeyPlain(key);
      setKeyLabel("");
      toast.success("API key created! Copy it now — it won't be shown again.");
    },
    onError: (err: any) => toast.error("Failed to create key", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api_keys"] });
      toast.success("API key revoked.");
    },
  });

  const handleCopy = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">Programmatic access to your CampusConnect AI assistants.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setNewKeyPlain(null); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create API Key
        </button>
      </div>

      {/* Create Modal */}
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
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Create API Key</h3>
                </div>
                <button onClick={() => setShowCreate(false)} className="p-1.5 rounded text-muted-foreground hover:bg-accent">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {newKeyPlain ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-success font-medium">Copy this key now. It will not be shown again.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono text-foreground truncate">
                      {newKeyVisible ? newKeyPlain : newKeyPlain.substring(0, 8) + "••••••••••••••••••••••••"}
                    </code>
                    <button
                      onClick={() => setNewKeyVisible(v => !v)}
                      className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground"
                    >
                      {newKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleCopy("new", newKeyPlain)}
                      className="p-2 rounded-lg border border-border hover:bg-accent text-muted-foreground"
                    >
                      {copiedId === "new" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input
                      value={keyLabel}
                      onChange={e => setKeyLabel(e.target.value)}
                      placeholder="e.g. Production Integration"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCreate(false)}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => createMutation.mutate(keyLabel)}
                      disabled={!keyLabel || createMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Generate Key
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keys Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
          <div className="col-span-2">Label / Key</div>
          <div>Created</div>
          <div>Last Used</div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No API keys yet. Create one to access your assistants programmatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {apiKeys.map((key: any) => (
              <div key={key.id} className="group grid grid-cols-4 px-6 py-4 items-center text-sm hover:bg-accent/20 transition-colors">
                <div className="col-span-2 space-y-1">
                  <div className="font-medium text-foreground">{key.label || key.name}</div>
                  <div className="flex items-center gap-2">
                    <code className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-xs border border-border">
                      {key.key_hash.substring(0, 8)}••••••••
                    </code>
                    <button
                      onClick={() => handleCopy(key.id, key.key_hash)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
                    >
                      {copiedId === key.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="text-muted-foreground">{new Date(key.created_at).toLocaleDateString()}</div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(key.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">Using API Keys</h3>
        <p className="text-xs text-muted-foreground mb-3">Pass the key in the <code className="px-1 py-0.5 rounded bg-muted font-mono">Authorization</code> header:</p>
        <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto text-foreground">
{`curl https://your-server.com/api/assistants \\
  -H "Authorization: Bearer cc_your_api_key"`}
        </pre>
      </div>
    </div>
  );
}
