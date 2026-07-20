import { useState, useEffect, useRef } from "react";
import { Device, Call } from "@twilio/voice-sdk";
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TestCallWidgetProps {
  assistantId: string;
}

export function TestCallWidget({ assistantId }: TestCallWidgetProps) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [device, setDevice] = useState<Device | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [callerName, setCallerName] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // A ref to hold the active call record ID to fetch transcripts
  const currentCallRecordId = useRef<string | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const initDevice = async () => {
    try {
      setStatus("connecting");

      const res = await fetch("/api/voice-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get token");
      const { token } = await res.json();

      const newDevice = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      newDevice.on("ready", () => {
        setDevice(newDevice);
        makeCall(newDevice);
      });

      newDevice.on("error", (err) => {
        console.error("Twilio Device Error:", err);
        setStatus("error");
      });

      newDevice.register();
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const makeCall = async (readyDevice: Device) => {
    try {
      const call = await readyDevice.connect({
        params: {
          assistant_id: assistantId,
          caller_name: callerName || "",
        },
      });

      call.on("accept", () => {
        setActiveCall(call);
        setStatus("live");

        // Listen to custom parameters returned by the webhook if we wanted to
        // or just subscribe to the newest call in Supabase for this assistant
        subscribeToTranscripts();
      });

      call.on("disconnect", () => {
        endCallCleanup();
      });

      call.on("error", (err) => {
        console.error("Call error:", err);
        endCallCleanup();
      });
    } catch (err) {
      console.error("Failed to connect call:", err);
      endCallCleanup();
    }
  };

  const endCallCleanup = () => {
    setActiveCall(null);
    setStatus("idle");
    if (device) {
      device.destroy();
      setDevice(null);
    }
    // Remove realtime subscription
    supabase.removeAllChannels();
  };

  const subscribeToTranscripts = async () => {
    setTranscripts([]);

    // We'll just subscribe to ALL transcripts for this assistant for the current time
    // For production, the webhook should return the specific callRecordId, but here
    // we can filter by the most recent call started in the last minute.

    const { data: recentCalls } = await supabase
      .from("calls")
      .select("id")
      .eq("assistant_id", assistantId)
      .order("started_at", { ascending: false })
      .limit(1);

    if (recentCalls && recentCalls.length > 0) {
      currentCallRecordId.current = recentCalls[0].id;

      supabase
        .channel("transcripts_channel")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_transcripts",
            filter: `call_id=eq.${currentCallRecordId.current}`,
          },
          (payload) => {
            setTranscripts((prev) => [...prev, payload.new]);
          },
        )
        .subscribe();
    }
  };

  const handleToggleCall = () => {
    if (status === "idle" || status === "error") {
      initDevice();
    } else {
      if (activeCall) {
        activeCall.disconnect();
      }
      endCallCleanup();
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-sm rounded-xl border border-border bg-card shadow-xl overflow-hidden sticky top-8">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/50">
        <span className="text-sm font-medium text-foreground">Test Call</span>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              status === "live"
                ? "bg-emerald-500 animate-pulse"
                : status === "connecting"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-muted-foreground"
            }`}
          />
          <span className="text-xs text-muted-foreground capitalize">{status}</span>
        </div>
      </div>

      {/* Transcript Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcripts.length === 0 && status !== "live" ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <MicOff className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center">
              Click the call button to start a<br />
              browser-based test call.
            </p>
          </div>
        ) : (
          transcripts.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.speaker === "caller" ? "items-end" : "items-start"}`}
            >
              <span className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">
                {msg.speaker}
              </span>
              <div
                className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${
                  msg.speaker === "caller"
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-muted text-foreground rounded-bl-none border border-border"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-border bg-background/50 flex flex-col justify-center items-center gap-3">
        {status === "idle" && (
          <div className="w-full space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Caller Name (optional)
            </label>
            <input
              type="text"
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
              placeholder="e.g. Sarah"
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        )}
        <button
          onClick={handleToggleCall}
          disabled={status === "connecting"}
          className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all ${
            status === "idle" || status === "error"
              ? "bg-success hover:bg-success/90 text-success-foreground"
              : status === "connecting"
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          }`}
        >
          {status === "idle" || status === "error" ? (
            <Phone className="w-6 h-6 fill-current" />
          ) : status === "connecting" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <PhoneOff className="w-6 h-6 fill-current" />
          )}
        </button>
      </div>
    </div>
  );
}
