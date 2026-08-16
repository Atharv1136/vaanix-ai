import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/call-logs/$callId")({
  component: TranscriptPanel,
});

function TranscriptPanel() {
  const { callId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["call", callId],
    queryFn: async () => {
      const [{ data: call }, { data: turns }] = await Promise.all([
        supabase.from("calls").select("*, call_lines(label, phone_number)").eq("id", callId).maybeSingle(),
        supabase.from("call_transcripts").select("*").eq("call_id", callId).order("turn_index"),
      ]);
      return { call, turns: turns ?? [] };
    },
  });

  async function deleteThisCall() {
    if (!confirm("Are you sure you want to delete this call log?")) return;
    const { error } = await supabase.from("calls").delete().eq("id", callId);
    if (error) return toast.error(error.message);
    toast.success("Call log deleted");
    qc.invalidateQueries();
    close();
  }

  async function flagTurn() {
    if (!data?.call) return;
    const { error } = await supabase.from("calls").update({ flagged: true, outcome: "flagged" }).eq("id", callId);
    if (error) return toast.error(error.message);
    toast.success("Call flagged. Update the Knowledge Base to correct it.");
    qc.invalidateQueries();
  }

  function close() {
    navigate({ to: "/call-logs" });
  }

  async function endCall() {
    if (!data?.call) return;
    const toastId = toast.loading("Terminating call...");
    try {
      const response = await fetch(`/api/calls/${callId}/end`, {
        method: "POST",
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to end call.");
      }
      toast.dismiss(toastId);
      toast.success("Call terminated");
      qc.invalidateQueries();
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.message || "Failed to end call");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px]"
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto flex h-full w-full max-w-lg flex-col border-l border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Call transcript</div>
              {data?.call && (
                <div className="text-xs text-muted-foreground">
                  {(data.call as any).student_or_caller_number || (data.call as any).student_number} · {new Date(data.call.started_at).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={deleteThisCall}
                title="Delete Call Log"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button onClick={close} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
              ))
            ) : data?.turns.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">No transcript recorded.</div>
            ) : (
              data?.turns.map((t, i) => {
                const isAi = t.speaker === "ai";
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={"flex " + (isAi ? "justify-start" : "justify-end")}
                  >
                    <div
                      className={
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm " +
                        (isAi ? "bg-muted text-foreground" : "bg-primary text-primary-foreground")
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wide opacity-70">
                         {isAi ? "AI" : "Student"}
                      </div>
                      <div>{t.text}</div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-5 py-3 gap-3">
            <button
              onClick={flagTurn}
              disabled={data?.call?.flagged}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              <Flag className="h-4 w-4 text-warning" />
              {data?.call?.flagged ? "Already flagged" : "Flag this call"}
            </button>

            {data?.call?.outcome === "in_progress" && (
              <button
                onClick={endCall}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                <X className="h-4 w-4" />
                End Call
              </button>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}