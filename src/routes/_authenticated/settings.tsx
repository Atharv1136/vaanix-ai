import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Zap,
  DollarSign,
  Key,
  X,
  BarChart3,
  PhoneCall,
  Radio,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

// ─── AI Provider config ────────────────────────────────────────────────────────
const AI_PROVIDERS = [
  { value: "gemini",     label: "Google Gemini", badge: "✨", color: "#4285F4" },
  { value: "openai",     label: "OpenAI",        badge: "🤖", color: "#74AA9C" },
  { value: "anthropic",  label: "Anthropic",     badge: "⚡", color: "#CC9B7A" },
  { value: "groq",       label: "Groq",          badge: "🚀", color: "#F55036" },
  { value: "openrouter", label: "OpenRouter",    badge: "🔀", color: "#9B59B6" },
  { value: "together",   label: "Together AI",   badge: "🤝", color: "#3498DB" },
  { value: "nvidia",     label: "NVIDIA NIM",    badge: "💚", color: "#76B900" },
  { value: "custom",     label: "Custom",        badge: "⚙️", color: "#718096" },
];

function providerMeta(provider: string) {
  return AI_PROVIDERS.find((p) => p.value === provider) ?? AI_PROVIDERS[AI_PROVIDERS.length - 1];
}

// ─── Add Key Modal ─────────────────────────────────────────────────────────────
function AddKeyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [provider, setProvider] = useState("gemini");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Set suggested label on provider switch
  const handleProviderSelect = (p: string) => {
    setProvider(p);
    if (!label || AI_PROVIDERS.some((item) => label.toLowerCase().includes(item.label.toLowerCase()))) {
      const match = AI_PROVIDERS.find((item) => item.value === p);
      if (match) setLabel(`My ${match.label} Key`);
    }
  };

  async function save() {
    if (!label || !apiKey) {
      toast.error("Label and API Key are required.");
      return;
    }
    setSaving(true);

    const defaultModel = provider === "gemini" ? "gemini-1.5-flash" : modelOverride || null;

    const { error } = await (supabase as any).from("ai_provider_keys").insert({
      provider,
      label,
      api_key: apiKey.trim(),
      base_url: baseUrl.trim() || null,
      model_override: defaultModel,
      is_active: true,
      priority: 0,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to save key: " + error.message);
      return;
    }
    toast.success("AI key saved!");
    onSaved();
    onClose();
  }

  const needsBaseUrl = provider === "openrouter" || provider === "custom";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0A0D16] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#E8C77A]" />
            <h3 className="text-base font-semibold text-slate-100">Add AI Provider Key</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Provider</Label>
            <div className="grid grid-cols-4 gap-2">
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleProviderSelect(p.value)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-medium transition-all ${
                    provider === p.value
                      ? "border-[#E8C77A]/60 bg-[#E8C77A]/10 text-[#E8C77A] shadow-sm"
                      : "border-white/5 bg-white/2 text-slate-400 hover:border-white/10 hover:text-slate-200"
                  }`}
                >
                  <span className="text-base">{p.badge}</span>
                  <span className="truncate text-[11px]">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Gemini 1.5 Flash (Primary)"
              className="bg-white/2 border-white/10 text-slate-100 placeholder:text-slate-600"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === "gemini" ? "AIzaSy..." : "sk-..."}
                className="flex-1 bg-white/2 border-white/10 text-slate-100 placeholder:text-slate-600 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="px-3 rounded-lg border border-white/10 bg-white/2 text-slate-400 hover:text-slate-100 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL (for custom / openrouter) */}
          {(needsBaseUrl || provider === "openrouter") && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Base URL {provider !== "custom" && <span className="text-slate-600">(optional)</span>}
              </Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-proxy.com/v1"
                className="bg-white/2 border-white/10 text-slate-100 placeholder:text-slate-600"
              />
            </div>
          )}

          {/* Model override */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Model Override <span className="text-slate-600">(optional)</span>
            </Label>
            <Input
              value={modelOverride}
              onChange={(e) => setModelOverride(e.target.value)}
              placeholder={provider === "gemini" ? "gemini-1.5-flash (default)" : "Leave blank for default"}
              className="bg-white/2 border-white/10 text-slate-100 placeholder:text-slate-600"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !label || !apiKey}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gold-gradient text-[#05070D] font-bold text-sm px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Save Key
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── AI Key Pool Section ───────────────────────────────────────────────────────
function AiKeyPoolSection() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail">>({});

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["ai-provider-keys"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ai_provider_keys")
        .select("*")
        .order("priority", { ascending: true });
      return data ?? [];
    },
  });

  const { data: poolStats } = useQuery({
    queryKey: ["key-pool-stats"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/key-pool-stats");
      if (!res.ok) return null;
      return res.json();
    },
  });

  async function toggleActive(id: string, current: boolean) {
    await (supabase as any).from("ai_provider_keys").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["ai-provider-keys"] });
    qc.invalidateQueries({ queryKey: ["key-pool-stats"] });
  }

  async function deleteKey(id: string) {
    await (supabase as any).from("ai_provider_keys").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["ai-provider-keys"] });
    toast.success("Key removed.");
  }

  async function movePriority(id: string, direction: "up" | "down") {
    const idx = keys.findIndex((k: any) => k.id === id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === keys.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const swapKey = keys[swapIdx] as any;
    const thisKey = keys[idx] as any;

    // Swap priority values
    const newPriorityThis = swapKey.priority;
    const newPrioritySwap = thisKey.priority === swapKey.priority ? swapKey.priority + (direction === "up" ? 1 : -1) : thisKey.priority;

    await Promise.all([
      (supabase as any).from("ai_provider_keys").update({ priority: newPriorityThis }).eq("id", thisKey.id),
      (supabase as any).from("ai_provider_keys").update({ priority: newPrioritySwap }).eq("id", swapKey.id),
    ]);
    qc.invalidateQueries({ queryKey: ["ai-provider-keys"] });
  }

  async function testKeyFn(keyId: string) {
    setTestingId(keyId);
    try {
      const res = await fetch("/api/analytics/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [keyId]: data.ok ? "ok" : "fail" }));
      toast[data.ok ? "success" : "error"](data.ok ? "Key is working ✓" : `Key failed: ${data.error}`);
    } catch {
      setTestResults((prev) => ({ ...prev, [keyId]: "fail" }));
      toast.error("Test request failed.");
    }
    setTestingId(null);
  }

  const totalTokens = (poolStats?.totalTokensUsed ?? 0).toLocaleString();
  const totalCost = parseFloat(poolStats?.totalEstimatedCostUsd ?? 0).toFixed(4);

  return (
    <section className="rounded-2xl border border-white/5 bg-[#0A0D16] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#E8C77A]" />
            AI Provider Key Pool (Multi-Key Fallback & Priority)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Keys are tried in priority order. Use arrows to rank keys (e.g. Gemini → NVIDIA → Groq).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/8 hover:text-slate-100 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Key
        </button>
      </div>

      {/* Cumulative Stats Bar */}
      {keys.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5">
          {[
            { icon: <Key className="w-3.5 h-3.5" />, label: "Active Keys", value: `${keys.filter((k: any) => k.is_active).length} of ${keys.length}` },
            { icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Tokens Used", value: totalTokens },
            { icon: <DollarSign className="w-3.5 h-3.5" />, label: "Est. Spend", value: `$${totalCost}` },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 px-4 py-3">
              <div className="text-[#E8C77A]/60">{stat.icon}</div>
              <div>
                <div className="text-xs font-semibold text-slate-100">{stat.value}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Keys List */}
      {isLoading ? (
        <div className="p-6 space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/2" />)}
        </div>
      ) : keys.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center px-6">
          <Key className="w-8 h-8 text-slate-700" />
          <p className="text-sm text-slate-400">No AI keys configured.</p>
          <p className="text-xs text-slate-600 max-w-xs">
            Add a Gemini, OpenAI, Anthropic, Groq, or other API key. Phone calls and summaries will seamlessly failover between them.
          </p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-2 rounded-xl bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider px-5 py-2.5"
          >
            Add First Key
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {keys.map((key: any, idx: number) => {
            const meta = providerMeta(key.provider);
            const testResult = testResults[key.id];

            return (
              <motion.div
                key={key.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-4 px-6 py-4 group ${!key.is_active ? "opacity-50" : ""}`}
              >
                {/* Priority controls */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => movePriority(key.id, "up")}
                    disabled={idx === 0}
                    title="Move up priority rank"
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePriority(key.id, "down")}
                    disabled={idx === keys.length - 1}
                    title="Move down priority rank"
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Priority badge */}
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/2 border border-white/5 text-[11px] font-bold text-[#E8C77A]">
                  #{idx + 1}
                </div>

                {/* Provider badge */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
                >
                  {meta.badge}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{key.label}</span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                      style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}10` }}
                    >
                      {meta.label}
                    </span>
                    {testResult === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                    {testResult === "fail" && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                    <span>{(key.estimated_tokens_used || 0).toLocaleString()} tokens</span>
                    <span>·</span>
                    <span>${parseFloat(key.estimated_cost_usd || 0).toFixed(4)} est.</span>
                    {key.model_override && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-slate-400">{key.model_override}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                  {/* Test button */}
                  <button
                    type="button"
                    onClick={() => testKeyFn(key.id)}
                    disabled={testingId === key.id}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/2 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-100 hover:border-white/20 transition-all disabled:opacity-50"
                  >
                    {testingId === key.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Test
                  </button>

                  {/* Active toggle */}
                  <button
                    type="button"
                    onClick={() => toggleActive(key.id, key.is_active)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      key.is_active
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-red-500/5 hover:text-red-400 hover:border-red-500/20"
                        : "border-slate-700 bg-white/2 text-slate-500 hover:border-emerald-500/20 hover:bg-emerald-500/5 hover:text-emerald-400"
                    }`}
                  >
                    {key.is_active ? "Active" : "Inactive"}
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => deleteKey(key.id)}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/5 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Key Modal */}
      <AnimatePresence>
        {showAdd && (
          <AddKeyModal
            onClose={() => setShowAdd(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["ai-provider-keys"] });
              qc.invalidateQueries({ queryKey: ["key-pool-stats"] });
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Telephony BYOC Section ────────────────────────────────────────────────────
function TelephonyBYOCSection({ settingsData }: { settingsData: any }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState("twilio");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsData) return;
    setProvider(settingsData.telephony_provider || "twilio");
    setAccountSid(settingsData.telephony_account_sid || "");
    setAuthToken(settingsData.telephony_auth_token || "");
    setPhoneNumber(settingsData.telephony_phone_number || "");
  }, [settingsData]);

  async function saveTelephony() {
    setSaving(true);
    try {
      // 1. Update app_settings
      const { error: setErr } = await (supabase as any)
        .from("app_settings")
        .update({
          telephony_provider: provider,
          telephony_account_sid: accountSid.trim() || null,
          telephony_auth_token: authToken.trim() || null,
          telephony_phone_number: phoneNumber.trim() || null,
        })
        .eq("id", 1);

      if (setErr) throw setErr;

      // 2. If a phone number is provided, automatically ensure it's registered in phone_numbers table
      if (phoneNumber.trim()) {
        const cleanNumber = phoneNumber.trim();
        const { data: existing } = await supabase
          .from("phone_numbers")
          .select("id")
          .eq("phone_number", cleanNumber)
          .maybeSingle();

        if (!existing) {
          // Fetch first assistant if available to link
          const { data: firstAssistant } = await supabase
            .from("assistants")
            .select("id")
            .limit(1)
            .maybeSingle();

          await (supabase as any).from("phone_numbers").insert({
            label: `${provider.toUpperCase()} Outbound Line`,
            phone_number: cleanNumber,
            provider: provider,
            assistant_id: firstAssistant?.id || null,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["phone_numbers"] });
      qc.invalidateQueries({ queryKey: ["phone-numbers"] });
      toast.success("Telephony credentials & phone line updated!");
    } catch (err: any) {
      toast.error("Failed to save telephony credentials: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-[#E8C77A]" />
            Telephony Provider (BYOC — Twilio / Plivo)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect your own Twilio or Plivo account and phone number for outbound and bulk calling campaigns.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider Switcher */}
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Telephony Provider</Label>
          <div className="flex gap-3">
            {[
              { id: "twilio", label: "Twilio Voice", desc: "PSTN calls & media stream" },
              { id: "plivo", label: "Plivo Voice", desc: "Global outbound calling" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`flex-1 rounded-xl border p-3 text-left transition-all ${
                  provider === p.id
                    ? "border-[#E8C77A]/50 bg-[#E8C77A]/10 text-slate-100 shadow-sm"
                    : "border-white/5 bg-white/2 text-slate-400 hover:border-white/10"
                }`}
              >
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Radio className={`w-3.5 h-3.5 ${provider === p.id ? "text-[#E8C77A]" : "text-slate-600"}`} />
                  {p.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Account SID / Auth ID */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            {provider === "plivo" ? "Plivo Auth ID" : "Twilio Account SID"}
          </Label>
          <Input
            value={accountSid}
            onChange={(e) => setAccountSid(e.target.value)}
            placeholder={provider === "plivo" ? "MAM..." : "AC..."}
            className="bg-white/2 border-white/10 text-slate-100 font-mono text-sm placeholder:text-slate-600"
          />
        </div>

        {/* Auth Token */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Auth Token</Label>
          <div className="flex gap-2">
            <Input
              type={showToken ? "text" : "password"}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Your provider auth token"
              className="flex-1 bg-white/2 border-white/10 text-slate-100 font-mono text-sm placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="px-3 rounded-lg border border-white/10 bg-white/2 text-slate-400 hover:text-slate-100 transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Outbound Caller ID Phone Number */}
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            Primary Outbound Caller ID Phone Number
          </Label>
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+13186188647 or +919876543210"
            className="bg-white/2 border-white/10 text-slate-100 font-mono text-sm placeholder:text-slate-600"
          />
          <p className="text-[11px] text-slate-500">
            This number will automatically be added to your Phone Numbers dashboard for single & bulk calls.
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={saveTelephony}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider px-5 py-2.5 hover:shadow-[0_0_20px_rgba(232,199,122,0.3)] transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Save & Sync Phone Line
        </button>
      </div>
    </section>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data } = await supabase.from("staff").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [orgName, setOrgName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [days, setDays] = useState("");
  const [greet, setGreet] = useState("");

  useEffect(() => {
    if (!data) return;
    setOrgName(data.org_name || "");
    setStart(data.business_hours_start || "");
    setEnd(data.business_hours_end || "");
    setDays(data.business_days || "");
    setGreet(data.default_greeting || "");
  }, [data]);

  async function save() {
    const { error } = await (supabase as any)
      .from("app_settings")
      .update({
        org_name: orgName,
        business_hours_start: start,
        business_hours_end: end,
        business_days: days,
        default_greeting: greet,
      })
      .eq("id", 1);
    if (error) toast.error(error.message);
    else {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    }
  }

  const [playing, setPlaying] = useState(false);

  async function previewAudio() {
    if (!greet) return;
    setPlaying(true);
    const toastId = toast.loading("Generating audio preview...");
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: greet }),
      });
      if (!response.ok) throw new Error("Failed to generate preview audio.");
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      toast.dismiss(toastId);
      toast.success("Playing preview");
      audio.onended = () => setPlaying(false);
      await audio.play();
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.message || "Could not play preview audio.");
      setPlaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">Institution, hours, Telephony BYOC, AI Key Pool, and opening lines.</p>
      </div>

      <section className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Institution</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Organisation name</Label>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="bg-white/2 border-white/10 text-slate-100"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Business hours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Days</Label>
            <Input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="bg-white/2 border-white/10 text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Start</Label>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bg-white/2 border-white/10 text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">End</Label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-white/2 border-white/10 text-slate-100"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Default greeting</h2>
          <span className="text-xs text-slate-500">{greet.length} characters</span>
        </div>
        <textarea
          value={greet}
          onChange={(e) => setGreet(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/2 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-[#E8C77A]/30"
        />
        <button
          type="button"
          onClick={previewAudio}
          disabled={playing}
          className="inline-flex items-center gap-1.5 text-xs text-[#E8C77A] hover:underline disabled:opacity-50"
        >
          <Volume2 className="h-3.5 w-3.5" /> {playing ? "Generating..." : "Preview as audio"}
        </button>
      </section>

      {/* Telephony BYOC (Twilio / Plivo) */}
      <TelephonyBYOCSection settingsData={data} />

      {/* AI Provider Keys — BYOK */}
      <AiKeyPoolSection />

      <section className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-100">Staff accounts</h2>
        <ul className="divide-y divide-white/5">
          {staff.length === 0 && <li className="py-3 text-sm text-slate-500">No staff records yet — new sign-ins will appear here.</li>}
          {staff.map((s: any) => (
            <li key={s.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium text-slate-200">{s.full_name}</div>
                <div className="text-xs text-slate-500">{s.email}</div>
              </div>
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-400 border border-white/5 font-semibold">
                {s.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end pt-2">
        <Button onClick={save} className="bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider px-6 py-3">
          Save General Settings
        </Button>
      </div>
    </div>
  );
}