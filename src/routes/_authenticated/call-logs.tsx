import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/call-logs")({
  component: Logs,
});

function badge(outcome: string, flagged: boolean) {
  if (flagged || outcome === "flagged")
    return <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Flagged</span>;
  if (outcome === "forwarded")
    return <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">Forwarded</span>;
  return <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Resolved</span>;
}

function Logs() {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [q, setQ] = useState("");
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isDetail = pathname.startsWith("/call-logs/") && pathname !== "/call-logs/";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["call-logs", flaggedOnly],
    queryFn: async () => {
      let query = supabase
        .from("calls")
        .select("id, student_number, started_at, duration_seconds, outcome, flagged, line_id, call_lines(label)")
        .order("started_at", { ascending: false })
        .limit(200);
      if (flaggedOnly) query = query.eq("flagged", true);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = rows.filter((r) => r.student_number.includes(q));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">Call logs</h1>
        <p className="text-sm text-muted-foreground">Every call, searchable, with full transcripts.</p>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Input placeholder="Search by student number…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged only
        </label>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Line</th>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Outcome</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="h-10 animate-pulse bg-muted/20" />
                </tr>
              ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No calls match.</td></tr>
            )}
            {filtered.map((c, i) => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="hover:bg-muted/30"
              >
                <td className="px-4 py-2.5 text-foreground">{new Date(c.started_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {(c.call_lines as { label?: string } | null)?.label ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-foreground">{c.student_number}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.duration_seconds}s</td>
                <td className="px-4 py-2.5">{badge(c.outcome, c.flagged)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link to="/call-logs/$callId" params={{ callId: c.id }} className="text-xs text-primary hover:underline">
                    View transcript
                  </Link>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDetail && <Outlet />}
    </div>
  );
}