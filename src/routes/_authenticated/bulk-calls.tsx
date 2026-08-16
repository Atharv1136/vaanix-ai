import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  Download,
  PhoneOutgoing,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  ChevronDown,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  BarChart3,
  Phone,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/bulk-calls")({
  component: BulkCalls,
});

// ─── Excel Template Download ──────────────────────────────────────────────────
function downloadTemplate() {
  // Generate a CSV template using 10-digit numbers (prevents Excel scientific notation truncation)
  const csv = "Name,Phone Number\nAtharv,9876543210\nAarohi,9123456789";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk_call_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function normalizePhoneNumber(raw: string): string {
  let str = (raw || "").trim();
  if (!str) return "";

  // Handle scientific notation from Excel (e.g. 9.19562E+11, 9.19562e11)
  if (/^[+\-]?\d+(\.\d+)?[eE][+\-]?\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = Math.round(num).toString();
    }
  }

  const hasPlus = str.startsWith("+");
  const digitsOnly = str.replace(/\D/g, "");

  if (!digitsOnly) return str;

  if (digitsOnly.length === 10) {
    return "+91" + digitsOnly;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return "+" + digitsOnly;
  }
  if (hasPlus) {
    return "+" + digitsOnly;
  }
  return "+" + digitsOnly;
}

// ─── CSV / Excel Parser (client-side using SheetJS) ───────────────────────────
async function parseExcelOrCSV(file: File): Promise<{ name: string; phone: string }[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read sheet into json objects preserving raw numbers
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true });
    if (rows.length === 0) return [];

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    const nameKey = keys.find((k) => k.toLowerCase().includes("name")) || keys[0];
    const phoneKey = keys.find((k) => {
      const l = k.toLowerCase();
      return l.includes("phone") || l.includes("mobile") || l.includes("number") || l.includes("contact");
    }) || keys[1];

    if (!nameKey || !phoneKey) return [];

    const results: { name: string; phone: string }[] = [];
    let hasTruncatedZeroes = false;

    for (const row of rows) {
      const rawName = String(row[nameKey] ?? "").trim();
      let rawPhoneVal = row[phoneKey];

      let rawPhoneStr = "";
      if (typeof rawPhoneVal === "number") {
        // Prevent scientific notation truncation by converting numeric cell values with BigInt/Math.round
        rawPhoneStr = BigInt(Math.round(rawPhoneVal)).toString();
      } else {
        rawPhoneStr = String(rawPhoneVal ?? "").trim();
      }

      if (rawPhoneStr.endsWith("000000")) {
        hasTruncatedZeroes = true;
      }

      const cleanPhone = normalizePhoneNumber(rawPhoneStr);
      if (rawName && cleanPhone) {
        results.push({ name: rawName, phone: cleanPhone });
      }
    }

    if (hasTruncatedZeroes) {
      toast.warning(
        "Excel truncated some phone numbers to scientific notation (e.g. 919562000000). To fix this in Excel, save your file as .xlsx OR format the Phone column as 'Number' (0 decimals) or 'Text' before saving.",
        { duration: 9000 }
      );
    }

    return results;
  } catch (err: any) {
    console.error("Failed to parse file:", err);
    return [];
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function CampaignBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "Pending",   cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
    running:   { label: "Running",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" },
    paused:    { label: "Paused",    cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    failed:    { label: "Failed",    cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  );
}

function ContactStatusIcon({ status }: { status: string }) {
  if (status === "answered") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "no_answer") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === "calling")   return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
  if (status === "failed")    return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function BulkCalls() {
  const qc = useQueryClient();

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [contacts, setContacts] = useState<{ name: string; phone: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Data queries
  const { data: assistants = [] } = useQuery({
    queryKey: ["assistants"],
    queryFn: async () => {
      const { data } = await supabase.from("assistants").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: phoneNumbers = [] } = useQuery({
    queryKey: ["phone-numbers"],
    queryFn: async () => {
      const { data } = await supabase.from("phone_numbers").select("id, label, phone_number").order("label");
      return data ?? [];
    },
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["bulk-campaigns"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bulk_call_campaigns")
        .select("*, assistants(name), phone_numbers(label, phone_number)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 3000,
  });

  const { data: campaignContacts = [] } = useQuery({
    queryKey: ["bulk-contacts", selectedCampaignId],
    enabled: !!selectedCampaignId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bulk_call_contacts")
        .select("*")
        .eq("campaign_id", selectedCampaignId!)
        .order("position");
      return data ?? [];
    },
    refetchInterval: selectedCampaignId ? 2500 : false,
  });

  // Realtime subscription for instant campaign updates
  useEffect(() => {
    const channel = supabase
      .channel("bulk-campaigns-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bulk_call_campaigns" }, () => {
        qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bulk_call_contacts" }, () => {
        qc.invalidateQueries({ queryKey: ["bulk-contacts"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const [demoMode, setDemoMode] = useState(false);

  // File parsing
  const handleFile = useCallback(async (file: File) => {
    const parsed = await parseExcelOrCSV(file);
    if (parsed.length === 0) {
      toast.error("Could not parse file. Make sure it has 'Name' and 'Phone Number' columns.");
      return;
    }
    setContacts(parsed);
    toast.success(`Loaded ${parsed.length} contacts from file.`);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Campaign creation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!campaignName || !assistantId || !phoneNumberId || contacts.length === 0)
        throw new Error("Fill all fields and upload a contact list.");

      // Insert campaign
      const { data: campaign, error: campErr } = await (supabase as any)
        .from("bulk_call_campaigns")
        .insert({
          name: campaignName,
          assistant_id: assistantId,
          phone_number_id: phoneNumberId,
          total_contacts: contacts.length,
          status: "pending",
        })
        .select()
        .single();
      if (campErr) throw campErr;

      // Insert contacts
      const contactRows = contacts.map((c, i) => ({
        campaign_id: campaign.id,
        name: c.name,
        phone_number: c.phone,
        position: i + 1,
        status: "pending",
      }));
      const { error: contErr } = await (supabase as any).from("bulk_call_contacts").insert(contactRows);
      if (contErr) throw contErr;

      // Trigger the campaign via server
      await fetch("/api/outbound/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, simulate: demoMode }),
      });

      return campaign.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      setSelectedCampaignId(id);
      setCampaignName("");
      setContacts([]);
      setAssistantId("");
      setPhoneNumberId("");
      toast.success("Campaign started! Calls are now queuing.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch("/api/outbound/bulk/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) throw new Error("Failed to pause campaign.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      toast.info("Campaign paused.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch("/api/outbound/bulk/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) throw new Error("Failed to resume campaign.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      toast.success("Campaign resumed.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const retryFailedMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await fetch("/api/outbound/bulk/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) throw new Error("Failed to retry failed contacts.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      qc.invalidateQueries({ queryKey: ["bulk-contacts"] });
      toast.success("Re-queued failed contacts. Campaign resuming...");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bulk_call_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulk-campaigns"] });
      toast.success("Campaign deleted");
      if (selectedCampaignId) setSelectedCampaignId(null);
    },
    onError: (err: any) => toast.error("Failed to delete campaign: " + err.message),
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await (supabase as any).from("bulk_call_contacts").delete().eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulk-contacts", selectedCampaignId] });
      toast.success("Contact deleted");
    },
    onError: (err: any) => toast.error("Failed to delete contact: " + err.message),
  });

  const selectedCampaign = campaigns.find((c: any) => c.id === selectedCampaignId);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans flex items-center gap-2">
            <PhoneOutgoing className="w-6 h-6 text-[#E8C77A]" />
            Bulk Calling
          </h1>
          <p className="text-sm text-slate-400 mt-1">Upload a contact list and launch an automated outbound call campaign.</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/2 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-slate-100 transition-all"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>

      {/* Create Campaign Panel */}
      <div className="rounded-2xl border border-white/5 bg-[#0A0D16] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#E8C77A]" />
          <h2 className="text-sm font-semibold text-slate-100">New Campaign</h2>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload + Preview */}
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-all ${
                isDragging
                  ? "border-[#E8C77A] bg-[#E8C77A]/5"
                  : contacts.length > 0
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-white/10 hover:border-white/20 hover:bg-white/2"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {contacts.length > 0 ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-sm font-semibold text-emerald-400">{contacts.length} contacts loaded</p>
                  <p className="text-xs text-slate-500 mt-1">Click to replace file</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-500 mb-3" />
                  <p className="text-sm font-medium text-slate-300">Drop CSV / Excel here</p>
                  <p className="text-xs text-slate-500 mt-1">or click to browse</p>
                  <p className="text-[11px] text-slate-600 mt-3">Columns required: Name, Phone Number</p>
                </>
              )}
            </div>

            {/* Contact Preview Table */}
            {contacts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/5 overflow-hidden"
              >
                <div className="px-4 py-2.5 bg-white/2 border-b border-white/5 text-[11px] uppercase tracking-wider text-slate-400 font-semibold grid grid-cols-12">
                  <span className="col-span-1">#</span>
                  <span className="col-span-5">Name</span>
                  <span className="col-span-6">Phone</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
                  {contacts.slice(0, 50).map((c, i) => (
                    <div key={i} className="grid grid-cols-12 px-4 py-2 text-xs">
                      <span className="col-span-1 text-slate-600">{i + 1}</span>
                      <span className="col-span-5 text-slate-300 truncate">{c.name}</span>
                      <span className="col-span-6 text-slate-400 font-mono">{c.phone}</span>
                    </div>
                  ))}
                  {contacts.length > 50 && (
                    <div className="px-4 py-2 text-xs text-slate-500 text-center">
                      +{contacts.length - 50} more contacts
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Campaign Config */}
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Campaign Name</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Admission Follow-up Aug 2026"
                className="bg-white/2 border-white/10 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Agent</Label>
              <select
                value={assistantId}
                onChange={(e) => setAssistantId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/2 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E8C77A]/30"
              >
                <option value="" className="bg-[#0A0D16]">Select an agent…</option>
                {assistants.map((a: any) => (
                  <option key={a.id} value={a.id} className="bg-[#0A0D16]">{a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Outbound Phone Line</Label>
              <select
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/2 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#E8C77A]/30"
              >
                <option value="" className="bg-[#0A0D16]">Select a phone line…</option>
                {phoneNumbers.map((p: any) => (
                  <option key={p.id} value={p.id} className="bg-[#0A0D16]">{p.label} — {p.phone_number}</option>
                ))}
              </select>
            </div>

            {/* Simulation Mode Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/2 p-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">Simulation / Demo Mode</div>
                <div className="text-[10px] text-slate-500">Run test campaign without making real telephone calls</div>
              </div>
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-slate-900 text-[#E8C77A] focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Summary */}
            {contacts.length > 0 && campaignName && assistantId && phoneNumberId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-[#E8C77A]/20 bg-[#E8C77A]/5 p-4 text-sm space-y-1.5"
              >
                <p className="text-[#E8C77A] font-semibold text-xs uppercase tracking-wider mb-2">Campaign Summary</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total contacts</span>
                  <span className="text-slate-200 font-semibold">{contacts.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Agent</span>
                  <span className="text-slate-200 font-semibold">{assistants.find((a: any) => a.id === assistantId)?.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Mode</span>
                  <span className="text-slate-200 font-semibold">{demoMode ? "Simulation / Test" : "Live Outbound Calls"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Call sequence</span>
                  <span className="text-slate-200 font-semibold">Sequential (1-by-1)</span>
                </div>
              </motion.div>
            )}

            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!campaignName || !assistantId || !phoneNumberId || contacts.length === 0 || createMutation.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold-gradient text-[#05070D] font-bold text-sm uppercase tracking-wider px-5 py-3 hover:shadow-[0_0_20px_rgba(232,199,122,0.4)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {createMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting Campaign…</>
              ) : (
                <><Play className="w-4 h-4" /> Start Campaign</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200 px-1">Campaigns</h2>

        {campaignsLoading && (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/2 border border-white/5" />)}
          </div>
        )}

        {!campaignsLoading && campaigns.length === 0 && (
          <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-12 text-center">
            <PhoneOutgoing className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No campaigns yet. Create one above.</p>
          </div>
        )}

        {campaigns.map((campaign: any, idx: number) => {
          const pct = campaign.total_contacts > 0
            ? Math.round((campaign.called_count / campaign.total_contacts) * 100)
            : 0;
          const isSelected = selectedCampaignId === campaign.id;

          return (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`rounded-2xl border bg-[#0A0D16] overflow-hidden transition-all duration-200 ${
                isSelected ? "border-[#E8C77A]/30" : "border-white/5"
              }`}
            >
              {/* Campaign Header Row */}
              <div
                onClick={() => setSelectedCampaignId(isSelected ? null : campaign.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/2 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/2 border border-white/5">
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{campaign.name}</span>
                      <CampaignBadge status={campaign.status} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <Phone className="w-3 h-3" />
                      <span>{(campaign.assistants as any)?.name ?? "—"}</span>
                      <span>·</span>
                      <span>{campaign.total_contacts} contacts</span>
                      <span>·</span>
                      <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Quick Campaign Controls */}
                  {campaign.status === "running" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseMutation.mutate(campaign.id);
                      }}
                      title="Pause Campaign"
                      className="flex items-center gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs text-yellow-300 hover:bg-yellow-500/20 transition-all"
                    >
                      <Pause className="w-3 h-3" />
                      <span className="hidden sm:inline">Pause</span>
                    </button>
                  )}

                  {campaign.status === "paused" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        resumeMutation.mutate(campaign.id);
                      }}
                      title="Resume Campaign"
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      <span className="hidden sm:inline">Resume</span>
                    </button>
                  )}

                  {(campaign.status === "completed" || campaign.status === "failed") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryFailedMutation.mutate(campaign.id);
                      }}
                      title="Retry unreached / failed contacts"
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="hidden sm:inline">Retry Failed</span>
                    </button>
                  )}

                  {/* Progress */}
                  <div className="hidden md:flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-400 font-semibold">{campaign.answered_count} answered</span>
                      <span className="text-slate-500">{campaign.called_count}/{campaign.total_contacts}</span>
                    </div>
                    <div className="w-28 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gold-gradient transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Delete Campaign */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete campaign "${campaign.name}"?`)) {
                        deleteCampaignMutation.mutate(campaign.id);
                      }
                    }}
                    title="Delete Campaign"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`} />
                </div>
              </div>

              {/* Expanded contacts list */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-white/5"
                  >
                    <div className="px-6 py-3 grid grid-cols-12 text-[11px] uppercase tracking-wider text-slate-500 font-semibold bg-white/1">
                      <span className="col-span-1">#</span>
                      <span className="col-span-4">Name</span>
                      <span className="col-span-4">Phone</span>
                      <span className="col-span-2">Status</span>
                      <span className="col-span-1 text-right">Action</span>
                    </div>
                    <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                      {campaignContacts.length === 0 && (
                        <div className="px-6 py-6 text-center text-sm text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                          Loading contacts…
                        </div>
                      )}
                      {campaignContacts.map((contact: any) => (
                        <div key={contact.id} className="grid grid-cols-12 px-6 py-3 text-sm items-center hover:bg-white/2">
                          <span className="col-span-1 text-slate-600 text-xs">{contact.position}</span>
                          <span className="col-span-4 text-slate-200 truncate">{contact.name}</span>
                          <span className="col-span-4 text-slate-400 font-mono text-xs">{contact.phone_number}</span>
                          <span className="col-span-2 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5">
                              <ContactStatusIcon status={contact.status} />
                              <span className="text-xs text-slate-400 capitalize">{contact.status.replace("_", " ")}</span>
                            </div>
                            {contact.status_reason && (
                              <div className="text-[10px] text-red-400/90 truncate max-w-full mt-0.5" title={contact.status_reason}>
                                {contact.status_reason}
                              </div>
                            )}
                          </span>
                          <div className="col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Remove ${contact.name} (${contact.phone_number})?`)) {
                                  deleteContactMutation.mutate(contact.id);
                                }
                              }}
                              title="Delete Contact"
                              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
