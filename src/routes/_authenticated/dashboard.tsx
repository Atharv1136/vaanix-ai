import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCall, Bot, Clock, Flag } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{n}{suffix}</span>;
}

function StatCard({ icon: Icon, label, value, suffix, tint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  tint?: "primary" | "success" | "warning";
}) {
  const tintCls =
    tint === "success" ? "bg-success/10 text-success" :
    tint === "warning" ? "bg-warning/15 text-warning" :
    "bg-primary/10 text-primary";
  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={"flex h-8 w-8 items-center justify-center rounded-lg " + tintCls}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold text-foreground tabular-nums">
        <CountUp value={value} suffix={suffix} />
      </div>
    </div>
  );
}

function outcomeBadge(outcome: string, flagged: boolean) {
  if (flagged || outcome === "flagged")
    return <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Flagged</span>;
  if (outcome === "forwarded")
    return <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">Forwarded</span>;
  return <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Resolved</span>;
}

function Dashboard() {
  const callsQ = useQuery({
    queryKey: ["calls-today"],
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const topQ = useQuery({
    queryKey: ["top-queries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("common_queries")
        .select("*")
        .order("count", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const calls = callsQ.data ?? [];
  const total = calls.length;
  const aiHandled = calls.filter((c) => c.outcome !== "forwarded").length;
  const aiPct = total ? Math.round((aiHandled / total) * 100) : 0;
  const avgDur = total ? Math.round(calls.reduce((s, c) => s + c.duration_seconds, 0) / total) : 0;
  const flagged = calls.filter((c) => c.flagged).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Today's operations</h1>
        <p className="text-sm text-muted-foreground">Live snapshot of the admission line.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={PhoneCall} label="Calls today" value={total} />
        <StatCard icon={Bot} label="AI handled" value={aiPct} suffix="%" tint="success" />
        <StatCard icon={Clock} label="Avg. duration" value={avgDur} suffix="s" />
        <StatCard icon={Flag} label="Flagged" value={flagged} tint="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[10px] border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Recent calls</h2>
            <Link to="/call-logs" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-border">
            {callsQ.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="h-14 animate-pulse bg-muted/30" />
              ))}
            {!callsQ.isLoading && calls.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No calls today yet.</li>
            )}
            {calls.slice(0, 8).map((c, i) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    {i === 0 && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${i === 0 ? "bg-success" : "bg-muted-foreground/40"}`} />
                  </span>
                  <div>
                    <div className="font-medium text-foreground">{c.student_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(c.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {c.duration_seconds}s</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {outcomeBadge(c.outcome, c.flagged)}
                  <Link
                    to="/call-logs/$callId"
                    params={{ callId: c.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Transcript
                  </Link>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="rounded-[10px] border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Top questions this week</h2>
          </div>
          <ul className="divide-y divide-border">
            {(topQ.data ?? []).map((q, i) => (
              <motion.li
                key={q.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="px-5 py-3 text-sm"
              >
                <Link to="/knowledge-base" className="block hover:text-primary">
                  <div className="text-foreground">{q.question_text}</div>
                  <div className="text-xs text-muted-foreground">Asked {q.count} times</div>
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}