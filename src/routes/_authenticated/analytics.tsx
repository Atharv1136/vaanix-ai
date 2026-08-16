import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ChevronRight,
  BarChart3,
  Sparkles,
  Users,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "flagged")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20 uppercase tracking-wider">Flagged</span>;
  if (outcome === "forwarded")
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/20 uppercase tracking-wider">Forwarded</span>;
  if (outcome === "in_progress")
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/20 uppercase tracking-wider animate-pulse">Live</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">Resolved</span>;
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`relative rounded-2xl border bg-[#0A0D16] p-5 overflow-hidden flex flex-col justify-between border-white/5`}>
      <div className={`absolute top-0 left-0 right-0 h-[1.5px] ${color}`} />
      <div className="flex items-center justify-between text-slate-400 mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <div className="p-1.5 rounded-lg bg-white/2 border border-white/5">{icon}</div>
      </div>
      <div className="text-2xl font-extrabold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Mini bar chart (last 14 days) ────────────────────────────────────────────
function DailyBarChart({ calls }: { calls: any[] }) {
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const count = calls.filter((c) => c.started_at?.slice(0, 10) === key).length;
    days.push({ label, count });
  }
  const max = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1.5 h-24 w-full">
      {days.map((day, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full rounded-t-sm bg-[#E8C77A]/20 group-hover:bg-[#E8C77A]/60 transition-all duration-200"
            style={{ height: `${(day.count / max) * 80}px`, minHeight: day.count > 0 ? "4px" : "2px" }}
          />
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-900 border border-white/10 rounded px-2 py-1 text-[10px] text-slate-200 whitespace-nowrap z-10 shadow-xl">
            {day.label}: {day.count}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Call Detail Overlay ───────────────────────────────────────────────────────
function CallDetailOverlay({ callId, onClose }: { callId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-call", callId],
    queryFn: async () => {
      const [{ data: call }, { data: turns }] = await Promise.all([
        supabase
          .from("calls")
          .select("*, assistants(name), phone_numbers(label)")
          .eq("id", callId)
          .maybeSingle(),
        supabase
          .from("call_transcripts")
          .select("*")
          .eq("call_id", callId)
          .order("turn_index"),
      ]);
      return { call, turns: turns ?? [] };
    },
  });

  // Generate AI summary
  const summaryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/analytics/call-summary/${callId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate summary");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analytics-call", callId] });
    },
  });

  const call = data?.call;
  const turns = data?.turns ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
    >
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-2xl flex-col bg-[#080A12] border-l border-white/5"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <div className="text-sm font-semibold text-slate-100">Call Detail</div>
            {call && (
              <div className="text-xs text-slate-500 mt-0.5">
                {call.student_or_caller_number} · {new Date(call.started_at).toLocaleString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {call && (
              <button
                onClick={async () => {
                  if (confirm("Delete this call log?")) {
                    await (supabase as any).from("calls").delete().eq("id", callId);
                    toast.success("Call log deleted");
                    qc.invalidateQueries({ queryKey: ["agent-calls"] });
                    qc.invalidateQueries({ queryKey: ["overall-analytics-stats"] });
                    onClose();
                  }
                }}
                title="Delete Call Log"
                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-white/2" />
              ))}
            </div>
          ) : (
            <>
              {/* AI Summary Banner */}
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#E8C77A]" />
                    <span className="text-sm font-semibold text-slate-100">AI Summary</span>
                  </div>
                  <button
                    onClick={() => summaryMutation.mutate()}
                    disabled={summaryMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-50"
                  >
                    {summaryMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    {(call as any)?.ai_summary ? "Regenerate" : "Generate"}
                  </button>
                </div>

                {(call as any)?.ai_summary ? (
                  <div className="rounded-xl bg-[#E8C77A]/5 border border-[#E8C77A]/15 px-4 py-3 text-sm text-slate-300 leading-relaxed">
                    {(call as any).ai_summary}
                  </div>
                ) : (
                  <div className="rounded-xl bg-white/2 border border-white/5 px-4 py-3 text-sm text-slate-500 text-center">
                    {summaryMutation.isPending
                      ? "Generating summary…"
                      : "No summary yet. Click Generate to create one."}
                  </div>
                )}
              </div>

              {/* Metadata Grid */}
              {call && (
                <div className="grid grid-cols-2 gap-3 p-6 border-b border-white/5">
                  {[
                    { label: "Caller", value: call.student_or_caller_number },
                    { label: "Duration", value: `${call.duration_seconds ?? 0}s` },
                    { label: "Agent", value: (call.assistants as any)?.name ?? "—" },
                    { label: "Outcome", value: <OutcomeBadge outcome={call.outcome} /> },
                    { label: "Direction", value: call.direction === "outbound" ? "Outbound" : "Inbound" },
                    { label: "Date", value: new Date(call.started_at).toLocaleDateString() },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl bg-white/2 border border-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{item.label}</div>
                      <div className="text-sm text-slate-200">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Transcript */}
              <div className="p-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-100 mb-4">Conversation Transcript</h3>
                {turns.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No transcript recorded for this call.</p>
                ) : (
                  turns.map((t: any, i: number) => {
                    const isAi = t.speaker === "ai";
                    return (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`flex ${isAi ? "justify-start" : "justify-end"}`}
                      >
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${isAi ? "bg-white/5 text-slate-200" : "bg-[#E8C77A]/10 border border-[#E8C77A]/20 text-[#E8C77A]"}`}>
                          <div className="text-[9px] uppercase tracking-wider opacity-60 mb-1">
                            {isAi ? "AI Agent" : "Caller"}
                          </div>
                          <div className="leading-relaxed">{t.text}</div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}

// ─── Agent Dashboard ───────────────────────────────────────────────────────────
function AgentDashboard({ assistant, onBack }: { assistant: any; onBack: () => void }) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["agent-calls", assistant.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("assistant_id", assistant.id)
        .order("started_at", { ascending: false });
      return data ?? [];
    },
  });

  const total = calls.length;
  const resolved = calls.filter((c) => c.outcome === "resolved").length;
  const forwarded = calls.filter((c) => c.outcome === "forwarded").length;
  const flagged = calls.filter((c) => c.outcome === "flagged").length;
  const avgDur = total > 0 ? Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / total) : 0;
  const successRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/2 px-3 py-2 text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          All Agents
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#E8C77A]" />
            {assistant.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Agent performance dashboard</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Calls" value={total} icon={<PhoneCall className="w-4 h-4 text-blue-400" />} color="bg-blue-500/30" />
        <StatCard label="Resolved" value={resolved} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} color="bg-emerald-500/30" />
        <StatCard label="Forwarded" value={forwarded} icon={<TrendingUp className="w-4 h-4 text-amber-400" />} color="bg-amber-500/30" />
        <StatCard label="Flagged" value={flagged} icon={<AlertCircle className="w-4 h-4 text-red-400" />} color="bg-red-500/30" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon={<CheckCircle2 className="w-4 h-4 text-teal-400" />} color="bg-teal-500/30" />
        <StatCard label="Avg Duration" value={`${avgDur}s`} icon={<Clock className="w-4 h-4 text-purple-400" />} color="bg-purple-500/30" />
      </div>

      {/* Daily Chart */}
      {calls.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[#E8C77A]" />
            <span className="text-sm font-semibold text-slate-100">Calls — Last 14 Days</span>
          </div>
          <DailyBarChart calls={calls} />
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-600">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      {/* Calls Table */}
      <div className="rounded-2xl border border-white/5 bg-[#0A0D16] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-slate-100">All Calls ({total})</h3>
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse bg-white/1" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">
            <PhoneCall className="w-8 h-8 mx-auto mb-3 text-slate-700" />
            No calls made with this agent yet.
          </div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {calls.map((call, idx) => (
              <motion.button
                key={call.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                onClick={() => setSelectedCallId(call.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/2 transition-colors group text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    call.outcome === "resolved" ? "bg-emerald-500/10 text-emerald-400" :
                    call.outcome === "flagged" ? "bg-red-500/10 text-red-400" :
                    "bg-amber-500/10 text-amber-400"
                  }`}>
                    {call.direction === "outbound" ? "↑" : "↓"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200 font-mono truncate">{call.student_or_caller_number}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(call.started_at).toLocaleString()} · {call.duration_seconds ?? 0}s
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <OutcomeBadge outcome={call.outcome} />
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Call Detail Overlay */}
      <AnimatePresence>
        {selectedCallId && (
          <CallDetailOverlay callId={selectedCallId} onClose={() => setSelectedCallId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Analytics Page ───────────────────────────────────────────────────────
function Analytics() {
  const [selectedAssistant, setSelectedAssistant] = useState<any | null>(null);

  const { data: assistants = [], isLoading: assistantsLoading } = useQuery({
    queryKey: ["assistants-analytics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assistants")
        .select("id, name, model, voice_provider, is_published")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Per-agent call counts summary
  const { data: callCounts = {} } = useQuery({
    queryKey: ["call-counts-by-agent"],
    queryFn: async () => {
      const { data } = await supabase.from("calls").select("assistant_id, outcome");
      const counts: Record<string, { total: number; resolved: number }> = {};
      (data ?? []).forEach((c) => {
        if (!c.assistant_id) return;
        if (!counts[c.assistant_id]) counts[c.assistant_id] = { total: 0, resolved: 0 };
        counts[c.assistant_id].total++;
        if (c.outcome === "resolved") counts[c.assistant_id].resolved++;
      });
      return counts;
    },
  });

  // Overall stats
  const { data: overallStats } = useQuery({
    queryKey: ["overall-analytics-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("calls").select("outcome, duration_seconds, started_at");
      const calls = data ?? [];
      const total = calls.length;
      const resolved = calls.filter((c) => c.outcome === "resolved").length;
      const totalDur = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0);
      const avgDur = total > 0 ? Math.round(totalDur / total) : 0;
      const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;
      return { total, resolved, avgDur, rate };
    },
  });

  if (selectedAssistant) {
    return (
      <div className="max-w-7xl mx-auto">
        <AgentDashboard assistant={selectedAssistant} onBack={() => setSelectedAssistant(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">Select an agent to view its detailed performance dashboard.</p>
      </div>

      {/* Overall Stats */}
      {overallStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Calls" value={overallStats.total} icon={<PhoneCall className="w-4 h-4 text-blue-400" />} color="bg-blue-500/30" />
          <StatCard label="Resolved" value={overallStats.resolved} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} color="bg-emerald-500/30" />
          <StatCard label="Success Rate" value={`${overallStats.rate}%`} icon={<TrendingUp className="w-4 h-4 text-teal-400" />} color="bg-teal-500/30" />
          <StatCard label="Avg Duration" value={`${overallStats.avgDur}s`} icon={<Clock className="w-4 h-4 text-purple-400" />} color="bg-purple-500/30" />
        </div>
      )}

      {/* Agent Cards */}
      <div>
        <div className="flex items-center gap-2 px-1 mb-4">
          <Users className="w-4 h-4 text-[#E8C77A]" />
          <h2 className="text-lg font-bold text-slate-200">Select an Agent</h2>
        </div>

        {assistantsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/2 border border-white/5" />)}
          </div>
        ) : assistants.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-14 text-center">
            <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No agents yet. Create one on the Agents page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assistants.map((assistant: any, idx: number) => {
              const counts = (callCounts as any)[assistant.id] ?? { total: 0, resolved: 0 };
              const rate = counts.total > 0 ? Math.round((counts.resolved / counts.total) * 100) : 100;

              return (
                <motion.button
                  key={assistant.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  onClick={() => setSelectedAssistant(assistant)}
                  className="group relative rounded-2xl border border-white/5 bg-[#0A0D16] p-5 text-left hover:border-slate-800 hover:translate-y-[-2px] hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 overflow-hidden"
                >
                  {/* Gradient accent line */}
                  <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-brand-gradient" />
                  {/* Hover left glow */}
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold-gradient transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" />

                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/2 border border-white/5 group-hover:border-[#E8C77A]/20 transition-colors">
                      <Bot className="w-5 h-5 text-slate-400 group-hover:text-[#E8C77A] transition-colors" />
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      assistant.is_published
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}>
                      {assistant.is_published ? "Live" : "Draft"}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-100 group-hover:text-[#E8C77A] transition-colors mb-1 truncate">{assistant.name}</h3>
                  <p className="text-[11px] text-slate-500 truncate mb-4">{assistant.model?.split("/")[1] || assistant.model}</p>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Calls", val: counts.total },
                      { label: "Resolved", val: counts.resolved },
                      { label: "Rate", val: `${rate}%` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-white/2 border border-white/5 p-2 text-center">
                        <div className="text-sm font-bold text-slate-100">{s.val}</div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-[#E8C77A]" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}