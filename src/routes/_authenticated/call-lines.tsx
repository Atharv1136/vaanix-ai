import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { PhoneCall, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/call-lines")({
  component: Lines,
});

type Line = {
  id: string;
  phone_number: string;
  label: string;
  ai_enabled: boolean;
  forward_to: string | null;
};

function inBusinessHours() {
  const h = new Date().getHours();
  const d = new Date().getDay();
  return d >= 1 && d <= 6 && h >= 9 && h < 18;
}

function Lines() {
  const qc = useQueryClient();
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("call_lines").select("*").order("phone_number");
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });

  async function toggle(line: Line, next: boolean) {
    if (!next && inBusinessHours()) {
      if (!confirm(`Turn AI OFF for "${line.label}" during business hours? Calls will ring ${line.forward_to ?? "the desk phone"}.`))
        return;
    }
    const { error } = await supabase
      .from("call_lines")
      .update({ ai_enabled: next, updated_at: new Date().toISOString() })
      .eq("id", line.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lines"] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Call lines</h1>
        <p className="text-sm text-muted-foreground">Control which numbers the AI is allowed to answer right now.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[10px] bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lines.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              className="rounded-[10px] border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-foreground">
                    <PhoneCall className="h-4 w-4 text-primary" />
                    <div className="font-semibold">{l.phone_number}</div>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{l.label}</div>
                </div>
                <Switch checked={l.ai_enabled} onCheckedChange={(v) => toggle(l, v)} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground transition">
                {l.ai_enabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" /> AI answering
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> AI off
                  </span>
                )}
                {!l.ai_enabled && l.forward_to && (
                  <span className="inline-flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" /> {l.forward_to}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}