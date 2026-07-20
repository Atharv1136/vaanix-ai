import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCall, Plus, Phone, RefreshCw, X, Loader2, Zap, PhoneOutgoing } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/phone-numbers")({
  component: PhoneNumbers,
});

function PhoneNumbers() {
  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [importLabel, setImportLabel] = useState("");
  const [importNumber, setImportNumber] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Outbound call state
  const [outboundNumber, setOutboundNumber] = useState("");
  const [outboundName, setOutboundName] = useState("");
  const [outboundLineId, setOutboundLineId] = useState("");
  const [outboundAssistantId, setOutboundAssistantId] = useState("");
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "success" | "error">("idle");
  const [callError, setCallError] = useState("");

  const { data: phoneNumbers = [], isLoading } = useQuery({
    queryKey: ["phone_numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phone_numbers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: assistants = [] } = useQuery({
    queryKey: ["assistants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistants")
        .select("id, name")
        .eq("is_published", true);
      if (error) throw error;
      return data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, assistantId }: { id: string; assistantId: string | null }) => {
      const { error } = await supabase
        .from("phone_numbers")
        .update({ assistant_id: assistantId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["phone_numbers"] });
      toast.success("Assignment updated.");
    },
  });

  async function handleManualImport() {
    if (!importNumber || !importLabel) {
      toast.error("Phone number and label are required.");
      return;
    }
    const res = await fetch("/api/phone-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: importNumber, label: importLabel }),
    });
    if (res.ok) {
      toast.success("Phone number added.");
      setShowImport(false);
      setImportNumber("");
      setImportLabel("");
      qc.invalidateQueries({ queryKey: ["phone_numbers"] });
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add phone number.");
    }
  }

  async function handleTwilioSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/phone-numbers/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Synced ${data.synced} number(s) from Twilio.`);
        qc.invalidateQueries({ queryKey: ["phone_numbers"] });
      } else {
        toast.error(data.error || "Sync failed.");
      }
    } catch {
      toast.error("Failed to reach server.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleMakeCall() {
    if (!outboundNumber) {
      toast.error("Enter a target phone number.");
      return;
    }
    if (!outboundLineId) {
      toast.error("Select a phone line.");
      return;
    }
    setCallStatus("calling");
    setCallError("");
    try {
      const res = await fetch("/api/outbound/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_number: outboundNumber,
          line_id: outboundLineId,
          context_note: outboundAssistantId ? `assistant_id:${outboundAssistantId}` : "",
          caller_name: outboundName || "",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCallStatus("success");
        toast.success("Call initiated!", { description: `Dialing ${outboundNumber}...` });
      } else {
        setCallStatus("error");
        setCallError(data.error || "Unknown error");
        toast.error("Call failed", { description: data.error });
      }
    } catch (err: any) {
      setCallStatus("error");
      setCallError(err.message);
      toast.error("Failed to start call.");
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Phone Numbers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your Twilio phone numbers and assign them to assistants.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTwilioSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            Sync Twilio
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Number
          </button>
        </div>
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
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
                  <PhoneCall className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">Add Phone Number</h3>
                </div>
                <button
                  onClick={() => setShowImport(false)}
                  className="p-1.5 rounded text-muted-foreground hover:bg-accent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input
                    value={importNumber}
                    onChange={(e) => setImportNumber(e.target.value)}
                    placeholder="+13186188647"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Include country code (e.g., +1 for US, +91 for India)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <Input
                    value={importLabel}
                    onChange={(e) => setImportLabel(e.target.value)}
                    placeholder="Main Admissions Line"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setShowImport(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManualImport}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Add Number
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Numbers Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
          <div>Number</div>
          <div>Label</div>
          <div>Assigned Assistant</div>
          <div>Status</div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : phoneNumbers.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-center">
            <Phone className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No phone numbers yet. Add one or sync from Twilio.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {phoneNumbers.map((phone: any) => (
              <div
                key={phone.id}
                className="grid grid-cols-4 px-6 py-4 items-center text-sm hover:bg-accent/20 transition-colors"
              >
                <div className="font-mono text-foreground font-medium">{phone.phone_number}</div>
                <div className="text-muted-foreground">{phone.label || "—"}</div>
                <div>
                  <Select
                    value={phone.assistant_id || "unassigned"}
                    onValueChange={(val) =>
                      assignMutation.mutate({
                        id: phone.id,
                        assistantId: val === "unassigned" ? null : val,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-48 bg-background border-border">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">
                        <span className="text-muted-foreground italic">Unassigned</span>
                      </SelectItem>
                      {assistants.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {phone.assistant_id ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-medium border border-success/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Make a Call Panel */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <PhoneOutgoing className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Make an Outbound Call</h3>
            <p className="text-xs text-muted-foreground">
              Launch a fully autonomous AI call to any number.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              From (Your Line)
            </Label>
            <Select value={outboundLineId} onValueChange={setOutboundLineId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Select a phone number" />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono">{p.phone_number}</span>
                    {p.label && (
                      <span className="ml-2 text-muted-foreground text-xs">({p.label})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Call To
            </Label>
            <Input
              value={outboundNumber}
              onChange={(e) => setOutboundNumber(e.target.value)}
              placeholder="+919876543210"
              className="font-mono bg-background border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Caller Name (optional)
            </Label>
            <Input
              value={outboundName}
              onChange={(e) => setOutboundName(e.target.value)}
              placeholder="e.g. John Doe"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Assistant (optional)
            </Label>
            <Select value={outboundAssistantId} onValueChange={setOutboundAssistantId}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Auto (from line)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Auto (from line assignment)</SelectItem>
                {assistants.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleMakeCall}
            disabled={callStatus === "calling"}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
              callStatus === "calling"
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : callStatus === "success"
                  ? "bg-success text-success-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {callStatus === "calling" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {callStatus === "calling"
              ? "Initiating..."
              : callStatus === "success"
                ? "Call Initiated!"
                : "Start Autonomous Call"}
          </button>
          {callStatus === "success" && (
            <button
              onClick={() => setCallStatus("idle")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Make another
            </button>
          )}
          {callStatus === "error" && <span className="text-xs text-destructive">{callError}</span>}
        </div>

        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">How it works:</strong> Twilio will dial the number.
            When answered, your AI assistant handles the entire conversation autonomously using the
            Deepgram → NVIDIA NIM → TTS pipeline. Transcripts appear in Call Logs.
          </p>
        </div>
      </div>
    </div>
  );
}
