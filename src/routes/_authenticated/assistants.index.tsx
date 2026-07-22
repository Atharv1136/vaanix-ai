import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bot, Plus, Mic2, Trash2, Globe, PhoneCall, Clock, CheckCircle2, ChevronRight, AlertCircle } from "lucide-react";
import { motion, animate } from "framer-motion";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/assistants/")({
  component: Dashboard,
});

// Counter component for stats count-in animation
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate: (latest) => setCount(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value]);

  return <span>{count}{suffix}</span>;
}

function Dashboard() {
  const qc = useQueryClient();

  // Query assistants list
  const { data: assistants = [], isLoading: assistantsLoading } = useQuery({
    queryKey: ["assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching assistants:", error);
        return [];
      }
      return data ?? [];
    },
  });

  // Query recent calls list
  const { data: recentCalls = [], isLoading: callsLoading } = useQuery({
    queryKey: ["recent-calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, student_or_caller_number, started_at, duration_seconds, outcome, assistant_id, assistants(name)")
        .order("started_at", { ascending: false })
        .limit(5);
      if (error) {
        console.error("Error fetching recent calls:", error);
        return [];
      }
      return data ?? [];
    },
  });

  // Query aggregated dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: calls, error: callsError } = await supabase
        .from("calls")
        .select("duration_seconds, outcome, started_at");
      
      const { data: allAssistants, error: assistantsError } = await supabase
        .from("assistants")
        .select("is_published");

      if (callsError || assistantsError) {
        console.error(callsError || assistantsError);
        return { activeAgents: 0, callsThisMonth: 0, minutesUsed: 0, successRate: 100 };
      }

      const activeAgents = allAssistants?.filter(a => a.is_published).length ?? 0;
      
      // Calculate calls in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const callsThisMonth = calls?.filter(c => new Date(c.started_at) >= thirtyDaysAgo).length ?? 0;
      
      // Calculate minutes used
      const totalSeconds = calls?.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) ?? 0;
      const minutesUsed = Math.round(totalSeconds / 60);

      // Calculate success rate (resolved / total)
      const totalCalls = calls?.length ?? 0;
      const resolvedCalls = calls?.filter(c => c.outcome === "resolved").length ?? 0;
      const successRate = totalCalls > 0 ? Math.round((resolvedCalls / totalCalls) * 100) : 100;

      return {
        activeAgents,
        callsThisMonth,
        minutesUsed,
        successRate
      };
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assistants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assistants"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Agent deleted successfully.");
    },
    onError: (err: any) => toast.error("Delete failed", { description: err.message }),
  });

  const isLoading = assistantsLoading || callsLoading || statsLoading;

  const statItems = [
    { 
      label: "Active Agents", 
      value: stats?.activeAgents ?? 0, 
      suffix: "",
      icon: <Bot className="w-4 h-4 text-blue-400" />
    },
    { 
      label: "Calls (Last 30d)", 
      value: stats?.callsThisMonth ?? 0, 
      suffix: "",
      icon: <PhoneCall className="w-4 h-4 text-teal-455" /> 
    },
    { 
      label: "Minutes Used", 
      value: stats?.minutesUsed ?? 0, 
      suffix: "m",
      icon: <Clock className="w-4 h-4 text-amber-500" /> 
    },
    { 
      label: "Success Rate", 
      value: stats?.successRate ?? 100, 
      suffix: "%",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 
    }
  ];

  function getOutcomeBadge(outcome: string) {
    if (outcome === "flagged") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/20">
          <AlertCircle className="w-2.5 h-2.5" /> Flagged
        </span>
      );
    }
    if (outcome === "forwarded") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
          Forwarded
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
        Resolved
      </span>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      
      {/* Dashboard Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">Developer Console</h1>
          <p className="text-sm text-slate-400 mt-1">Deploy, monitor, and analyze your Vaanix voice agents.</p>
        </div>
        <Link to="/assistants/new">
          <button className="bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-full hover:shadow-[0_0_20px_rgba(232,199,122,0.4)] transition-all duration-300 flex items-center gap-2">
            <Plus className="w-4 h-4 stroke-[3px]" />
            New Agent
          </button>
        </Link>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-white/2 border border-white/5" />
          ))
        ) : (
          statItems.map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
              className="relative rounded-2xl border border-white/5 bg-[#0A0D16] p-5 md:p-6 overflow-hidden flex flex-col justify-between"
            >
              {/* Thin gradient border at top */}
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-brand-gradient" />
              
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
                <div className="p-1.5 rounded-lg bg-white/2 border border-white/5">
                  {item.icon}
                </div>
              </div>

              <div className="text-2xl md:text-3xl font-extrabold text-slate-100 font-sans mt-3">
                <Counter value={item.value} suffix={item.suffix} />
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Main Grid: Left Recent Agents, Right Recent Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Recent Agents */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-slate-200">Recent Agents</h2>
            <Link to="/assistants/new" className="text-xs font-bold text-[#E8C77A] hover:underline uppercase tracking-wider">
              View All
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-24 animate-pulse rounded-2xl bg-white/2 border border-white/5" />
              ))}
            </div>
          ) : assistants.length === 0 ? (
            /* Empty state for agents */
            <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-10 text-center flex flex-col items-center justify-center gap-5">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/2 border border-white/5">
                <div className="absolute inset-0 bg-brand-gradient opacity-10 rounded-full blur-md" />
                <Bot className="w-8 h-8 text-teal-400 relative z-10 animate-pulse" />
              </div>
              <div className="max-w-xs space-y-1.5">
                <h3 className="text-sm font-bold text-slate-200">No Agents Active</h3>
                <p className="text-xs text-slate-400">Design your first conversational agent flow and go live instantly.</p>
              </div>
              <Link to="/assistants/new">
                <button className="bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider px-6 py-2.5 rounded-full shadow-md">
                  Create Agent
                </button>
              </Link>
            </div>
          ) : (
            /* Agents List */
            <div className="space-y-4">
              {assistants.slice(0, 4).map((assistant: any, idx: number) => (
                <motion.div
                  key={assistant.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link to="/assistants/$assistantId" params={{ assistantId: assistant.id }} className="group block">
                    <div className="relative rounded-2xl border border-white/5 bg-[#0A0D16] p-5 transition-all duration-300 hover:border-slate-800 hover:translate-y-[-2px] hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex items-center justify-between overflow-hidden">
                      {/* Interactive edge glow on hover */}
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-brand-gradient transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" />
                      
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/2 border border-white/5 text-slate-350 transition-colors group-hover:text-[#E8C77A]">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-100 truncate group-hover:text-[#E8C77A] transition-colors">{assistant.name}</h3>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              assistant.is_published
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}>
                              {assistant.is_published ? "Live" : "Draft"}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs text-slate-450 mt-1 font-medium">
                            <Mic2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>{assistant.voice_provider}</span>
                            <span className="text-slate-700">•</span>
                            <Globe className="w-3.5 h-3.5 text-slate-500" />
                            <span className="truncate max-w-[120px]">{assistant.model?.split("/")[1] || assistant.model}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Delete Assistant button */}
                        <button
                          onClick={e => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            if(confirm("Are you sure you want to delete this agent?")) {
                              deleteMutation.mutate(assistant.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Recent Calls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-slate-200">Recent Calls</h2>
            <Link to="/call-logs" className="text-xs font-bold text-[#E8C77A] hover:underline uppercase tracking-wider">
              View Logs
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-20 animate-pulse rounded-2xl bg-white/2 border border-white/5" />
              ))}
            </div>
          ) : recentCalls.length === 0 ? (
            /* Empty state for calls */
            <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-10 text-center flex flex-col items-center justify-center gap-5 h-[272px]">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/2 border border-white/5">
                <div className="absolute inset-0 bg-brand-gradient opacity-10 rounded-full blur-md" />
                <PhoneCall className="w-7 h-7 text-amber-500 relative z-10 animate-pulse" />
              </div>
              <div className="max-w-xs space-y-1.5">
                <h3 className="text-sm font-bold text-slate-200">No Call History</h3>
                <p className="text-xs text-slate-400">Trigger standard Twilio test sequences or test directly in the browser.</p>
              </div>
            </div>
          ) : (
            /* Recent Calls List */
            <div className="space-y-3">
              {recentCalls.map((call: any, idx: number) => (
                <motion.div
                  key={call.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link to={`/call-logs/${call.id}`} className="group block">
                    <div className="relative rounded-2xl border border-white/5 bg-[#0A0D16] p-4 transition-all duration-300 hover:border-slate-800 hover:translate-y-[-2px] hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex items-center justify-between overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-brand-gradient transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-top" />
                      
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200 font-mono truncate">{call.student_or_caller_number}</span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide truncate">
                            via {call.assistants?.name ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                          <span>{new Date(call.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span>{call.duration_seconds ?? 0}s duration</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {getOutcomeBadge(call.outcome)}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
