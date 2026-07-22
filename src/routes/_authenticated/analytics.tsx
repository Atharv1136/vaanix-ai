import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { BarChart3, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

function Analytics() {
  const { data: queries = [], isLoading: queriesLoading } = useQuery({
    queryKey: ["all-queries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("common_queries")
        .select("*")
        .order("count", { ascending: false });
      if (error) {
        console.error("Error fetching common queries:", error);
        return [];
      }
      return data ?? [];
    },
  });

  const { data: callStats } = useQuery({
    queryKey: ["call-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("outcome, duration_seconds, started_at");
      if (error) {
        console.error("Error fetching call stats:", error);
        return { total: 0, resolved: 0, avgDuration: 0 };
      }
      const calls = data ?? [];
      const total = calls.length;
      const resolved = calls.filter(c => c.outcome === "resolved").length;
      const totalDuration = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0);
      const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
      return { total, resolved, avgDuration };
    },
  });

  const max = queries.reduce((m: number, q: any) => Math.max(m, q.count), 1);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">What students are asking your assistants.</p>
      </div>

      {/* Stats row */}
      {callStats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Calls", value: callStats.total, icon: "📞" },
            { label: "Resolved", value: callStats.resolved, icon: "✅" },
            { label: "Avg Duration", value: `${callStats.avgDuration}s`, icon: "⏱" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Common Queries */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Most Common Queries</h3>
          {queries.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{queries.length} unique questions</span>
          )}
        </div>

        {queriesLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        )}

        {!queriesLoading && queries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No data yet. Common queries will appear here as calls come in.</p>
          </div>
        )}

        <div className="space-y-3">
          {queries.map((q: any, i: number) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group"
            >
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-foreground font-medium truncate flex-1 mr-3">{q.question_text}</span>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums bg-muted px-2 py-0.5 rounded-full">{q.count}×</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(q.count / max) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                  className="h-full rounded-full bg-primary"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}