import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

function Analytics() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["all-queries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("common_queries")
        .select("*")
        .order("count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const max = data.reduce((m, q) => Math.max(m, q.count), 1);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Student queries</h1>
        <p className="text-sm text-muted-foreground">
          What students actually keep asking — use this to close gaps in the Knowledge Base.
        </p>
      </div>

      <div className="space-y-2 rounded-[10px] border border-border bg-card p-5">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted/40" />)}
        {data.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="py-2"
          >
            <div className="flex items-center justify-between text-sm">
              <div className="text-foreground">{q.question_text}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{q.count}</div>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
  );
}