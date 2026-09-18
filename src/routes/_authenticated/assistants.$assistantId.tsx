import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TestCallWidget } from "@/components/TestCallWidget";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Trash2,
  FileText,
  Brain,
  Mic2,
  Wrench,
  BookOpen,
  Sparkles,
  Play,
  Globe,
  Volume2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/assistants/$assistantId")({
  component: AssistantBuilder,
});

// AI models available
const MODELS = [
  { value: "qwen/qwen3.8-27b", label: "Qwen 2.5 27B (Recommended)", badge: "Groq" },
  { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Fast)", badge: "Groq" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", badge: "Google" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", badge: "OpenAI" },
  { value: "nvidia/nemotron-70b", label: "Nemotron 70B", badge: "NVIDIA" },
  { value: "nvidia/nemotron-mini", label: "Nemotron Nano 8B", badge: "NVIDIA" },
  { value: "meta/llama-3.3-70b", label: "Llama 3.3 70B Instruct", badge: "Meta" },
  { value: "meta/llama-3.1-8b", label: "Llama 3.1 8B Instruct (Fast)", badge: "Meta" },
  { value: "mistralai/mistral-7b", label: "Mistral 7B Instruct", badge: "Mistral" },
];

// Supported languages
const LANGUAGES = [
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
  { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
  { code: "hi-IN", label: "Hindi — हिंदी", flag: "🇮🇳" },
  { code: "mr-IN", label: "Marathi — मराठी", flag: "🇮🇳" },
];

// Voices grouped by language and provider
const VOICES_BY_LANGUAGE: Record<string, { provider: string; value: string; label: string; gender: string }[]> = {
  "en-US": [
    // Deepgram Aura (English only)
    { provider: "deepgram", value: "aura-asteria-en",  label: "Asteria",  gender: "Female" },
    { provider: "deepgram", value: "aura-luna-en",     label: "Luna",     gender: "Female" },
    { provider: "deepgram", value: "aura-stella-en",   label: "Stella",   gender: "Female" },
    { provider: "deepgram", value: "aura-hera-en",     label: "Hera",     gender: "Female" },
    { provider: "deepgram", value: "aura-orpheus-en",  label: "Orpheus",  gender: "Male"   },
    { provider: "deepgram", value: "aura-helios-en",   label: "Helios",   gender: "Male"   },
    { provider: "deepgram", value: "aura-angus-en",    label: "Angus",    gender: "Male"   },
    // Edge TTS (English)
    { provider: "edge",     value: "en-US-AriaNeural",    label: "Aria (Neural)",    gender: "Female" },
    { provider: "edge",     value: "en-US-GuyNeural",     label: "Guy (Neural)",     gender: "Male"   },
    { provider: "edge",     value: "en-US-JennyNeural",   label: "Jenny (Neural)",   gender: "Female" },
    // ElevenLabs (if key available)
    { provider: "elevenlabs", value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", gender: "Female" },
    { provider: "elevenlabs", value: "EXAVITQu4vr4xnSDxMaL", label: "Bella",  gender: "Female" },
    { provider: "elevenlabs", value: "pNInz6obbfDQGcgMyIGC", label: "Adam",   gender: "Male"   },
  ],
  "en-IN": [
    { provider: "edge", value: "en-IN-NeerjaNeural",  label: "Neerja (Neural)",  gender: "Female" },
    { provider: "edge", value: "en-IN-PrabhatNeural", label: "Prabhat (Neural)", gender: "Male"   },
  ],
  "hi-IN": [
    { provider: "edge", value: "hi-IN-SwaraNeural",  label: "Swara — स्वरा (Female)",  gender: "Female" },
    { provider: "edge", value: "hi-IN-MadhurNeural", label: "Madhur — मधुर (Male)", gender: "Male"   },
  ],
  "mr-IN": [
    { provider: "edge", value: "mr-IN-AarohiNeural",  label: "Aarohi — आरोही (Female)",  gender: "Female" },
    { provider: "edge", value: "mr-IN-ManoharNeural", label: "Manohar — मनोहर (Male)", gender: "Male"   },
  ],
};

const PROVIDER_BADGE: Record<string, { label: string; color: string }> = {
  deepgram:   { label: "Deepgram",   color: "#13EF93" },
  edge:       { label: "Edge TTS",   color: "#00A4EF" },
  elevenlabs: { label: "ElevenLabs", color: "#FF6B35" },
  neets:      { label: "Neets",      color: "#9B59B6" },
};


function SectionCard({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: number;
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
          {number}
        </div>
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </label>
  );
}

function AssistantBuilder() {
  const { assistantId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<any>(null);
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [kbUploading, setKbUploading] = useState(false);

  // High-Speed Cached Q&As State
  const [qaInstruction, setQaInstruction] = useState("");
  const [generatingQas, setGeneratingQas] = useState(false);
  const [editingQaId, setEditingQaId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState("");
  const [editingAnswer, setEditingAnswer] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [showAddManual, setShowAddManual] = useState(false);
  const [pasteQAsText, setPasteQAsText] = useState("");
  const [importingQas, setImportingQas] = useState(false);
  const [activeQaTab, setActiveQaTab] = useState<"generate" | "paste">("generate");
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const { data: qas = [], refetch: refetchQas } = useQuery({
    queryKey: ["assistant_qas", assistantId],
    queryFn: async () => {
      if (assistantId === "new") return [];
      try {
        const res = await fetch(`/api/assistants/${assistantId}/qas`);
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        console.error("Failed to load QAs:", err);
        return [];
      }
    },
    enabled: assistantId !== "new",
  });

  const { data: assistant, isLoading } = useQuery({
    queryKey: ["assistant", assistantId],
    queryFn: async () => {
      const defaultAss = {
        name: "New Assistant",
        system_prompt: "",
        first_message: "",
        model: "qwen/qwen3.8-27b",
        voice_provider: "deepgram",
        voice_id: "aura-asteria-en",
        language: "en-US",
        is_published: false,
      };
      if (assistantId === "new") return defaultAss;
      const { data, error } = await supabase
        .from("assistants")
        .select("*")
        .eq("id", assistantId)
        .single();
      if (error) {
        console.error("Error fetching assistant:", error);
        return defaultAss;
      }
      return data ?? defaultAss;
    },
  });

  const { data: allTools = [] } = useQuery({
    queryKey: ["tools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tools").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignedTools = [] } = useQuery({
    queryKey: ["assistant_tools", assistantId],
    queryFn: async () => {
      if (assistantId === "new") return [];
      const { data, error } = await supabase
        .from("assistant_tools")
        .select("*")
        .eq("assistant_id", assistantId);
      if (error) throw error;
      return data;
    },
    enabled: assistantId !== "new",
  });

  useEffect(() => {
    if (assistant) setFormData(assistant);
  }, [assistant]);

  // Fetch KB documents from server
  useEffect(() => {
    if (assistantId === "new") return;
    fetch(`/api/assistants/${assistantId}/kb-documents`)
      .then((r) => r.json())
      .then((docs) => setKbDocs(Array.isArray(docs) ? docs : []))
      .catch(() => {});
  }, [assistantId]);

  const saveMutation = useMutation({
    mutationFn: async (newData: any) => {
      // Clean the payload — only send known DB columns, strip undefined/null where not needed
      const payload = {
        name: newData.name || "New Assistant",
        system_prompt: newData.system_prompt || "You are a helpful AI assistant.",
        first_message: newData.first_message || null,
        model: newData.model || "qwen/qwen3.8-27b",
        voice_provider: newData.voice_provider || "deepgram",
        voice_id: newData.voice_id || "aura-asteria-en",
        language: newData.language || "en-US",
        is_published: newData.is_published ?? false,
      };
      if (assistantId === "new") {
        const { data, error } = await supabase
          .from("assistants")
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("assistants")
          .update(payload)
          .eq("id", assistantId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      qc.setQueryData(["assistant", data.id], data);
      if (assistantId === "new") {
        navigate({
          to: `/assistants/$assistantId`,
          params: { assistantId: data.id },
          replace: true,
        });
      }
      toast.success("Saved", { description: "Assistant configuration updated." });
    },
    onError: (error: any) => toast.error("Failed to save", { description: error.message }),
  });

  const toggleToolMutation = useMutation({
    mutationFn: async ({ toolId, enabled }: { toolId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase
          .from("assistant_tools")
          .insert([{ assistant_id: assistantId, tool_id: toolId, enabled: true }]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("assistant_tools")
          .delete()
          .match({ assistant_id: assistantId, tool_id: toolId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant_tools", assistantId] }),
  });

  const handleBlurSave = () => {
    if (formData) saveMutation.mutate(formData);
  };
  const isAssigned = (toolId: string) =>
    assignedTools.some((at: any) => at.tool_id === toolId && at.enabled);

  async function handleKbFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKbUploading(true);
    try {
      const text = await file.text();
      const res = await fetch(`/api/assistants/${assistantId}/kb-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name, content: text }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const doc = await res.json();
      setKbDocs((prev) => [doc, ...prev]);
      toast.success("File uploaded", { description: `"${file.name}" added to knowledge base.` });
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setKbUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteKbDoc(id: string, title: string) {
    const res = await fetch(`/api/kb-documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKbDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success(`"${title}" removed.`);
    } else {
      toast.error("Failed to delete document.");
    }
  }

  async function handleGenerateQAs() {
    setGeneratingQas(true);
    try {
      const res = await fetch(`/api/assistants/${assistantId}/qas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: qaInstruction }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await res.json();
      toast.success("Q&As Generated", {
        description: `Successfully generated ${data.length} Q&As.`,
      });
      refetchQas();
    } catch (err: any) {
      toast.error("Generation failed", { description: err.message });
    } finally {
      setGeneratingQas(false);
    }
  }

  async function handleBulkImportQAs() {
    if (!pasteQAsText.trim()) {
      toast.error("Please paste some Q&As to import.");
      return;
    }

    setImportingQas(true);
    try {
      const regex =
        /(?:Q|Question)\s*\d*[\s]*[\.:\-]+([\s\S]+?)(?:\s+A|Answer)\s*\d*[\s]*[\.:\-]+([\s\S]+?)(?=\s+(?:Q|Question)\s*\d*[\s]*[\.:\-]+|$)/gi;

      const parsed: { question: string; answer: string }[] = [];
      let match;
      const cleanText = pasteQAsText;
      while ((match = regex.exec(cleanText)) !== null) {
        const question = match[1].trim();
        const answer = match[2].trim();
        if (question && answer) {
          parsed.push({ question, answer });
        }
      }

      if (parsed.length === 0) {
        const lines = cleanText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        let curQ = "";
        let curA = "";
        for (const line of lines) {
          const qMatch = line.match(/^(?:Q|Question)\s*\d*[\s]*[\.:\-]+(.*)/i);
          const aMatch = line.match(/^(?:A|Answer)\s*\d*[\s]*[\.:\-]+(.*)/i);
          if (qMatch) {
            if (curQ && curA) {
              parsed.push({ question: curQ, answer: curA });
              curQ = "";
              curA = "";
            }
            curQ = qMatch[1].trim();
          } else if (aMatch) {
            curA = aMatch[1].trim();
          } else if (curQ && !curA) {
            curQ += " " + line;
          } else if (curA) {
            curA += " " + line;
          }
        }
        if (curQ && curA) {
          parsed.push({ question: curQ, answer: curA });
        }
      }

      if (parsed.length === 0) {
        toast.error(
          "Could not detect any valid Q&As. Please make sure they follow the 'Q1. ... A: ...' format.",
        );
        return;
      }

      toast.info(`Detected ${parsed.length} Q&A items. Importing...`);

      const res = await fetch(`/api/assistants/${assistantId}/qas/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qas: parsed }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import Q&As.");
      }

      toast.success(`Successfully imported ${parsed.length} Q&As to cache!`);
      setPasteQAsText("");
      refetchQas();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Import failed.");
    } finally {
      setImportingQas(false);
    }
  }

  async function handleDeleteQA(id: string) {
    try {
      const res = await fetch(`/api/qas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Q&A deleted");
      refetchQas();
    } catch (err: any) {
      toast.error("Failed to delete Q&A", { description: err.message });
    }
  }

  async function handleSaveQA(id?: string) {
    const question = id ? editingQuestion : newQuestion;
    const answer = id ? editingAnswer : newAnswer;
    if (!question || !answer) {
      toast.error("Question and Answer are required.");
      return;
    }
    try {
      const res = await fetch(`/api/assistants/${assistantId}/qas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, question, answer }),
      });
      if (!res.ok) throw new Error("Failed to save QA");
      toast.success(id ? "Q&A updated" : "Q&A added");
      refetchQas();
      if (id) {
        setEditingQaId(null);
      } else {
        setNewQuestion("");
        setNewAnswer("");
        setShowAddManual(false);
      }
    } catch (err: any) {
      toast.error("Failed to save Q&A", { description: err.message });
    }
  }

  const startEditing = (qa: any) => {
    setEditingQaId(qa.id);
    setEditingQuestion(qa.question);
    setEditingAnswer(qa.answer);
  };

  if (isLoading || !formData)
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const currentLanguage = formData?.language || "en-US";
  const voicesForLanguage = VOICES_BY_LANGUAGE[currentLanguage] || VOICES_BY_LANGUAGE["en-US"];
  const isSaving = saveMutation.isPending;

  async function playVoicePreview(voiceId: string) {
    if (previewingVoice === voiceId) return;
    setPreviewingVoice(voiceId);
    try {
      const lang = currentLanguage;
      const res = await fetch(`/api/voice-preview?voice_id=${encodeURIComponent(voiceId)}&language=${encodeURIComponent(lang)}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPreviewingVoice(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setPreviewingVoice(null);
      audio.play();
    } catch (err: any) {
      toast.error("Voice preview failed", { description: err.message });
      setPreviewingVoice(null);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left Panel */}
      <div className="flex-1 space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to="/assistants"
            className="p-2 -ml-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <input
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              onBlur={handleBlurSave}
              className="bg-transparent text-2xl font-bold tracking-tight text-foreground border-none outline-none focus:ring-0 p-0 w-full placeholder-muted-foreground"
              placeholder="Assistant Name"
            />
          </div>
          <div className="flex items-center gap-2.5">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">Published</span>
            <Switch
              checked={formData.is_published}
              onCheckedChange={(v) => {
                const updated = { ...formData, is_published: v };
                setFormData(updated);
                saveMutation.mutate(updated);
              }}
            />
          </div>
        </div>

        {/* Section 1: Brain */}
        <SectionCard number={1} icon={Brain} title="Brain">
          <div className="space-y-1.5">
            <FieldLabel>System Prompt</FieldLabel>
            <Textarea
              value={formData.system_prompt || ""}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              onBlur={handleBlurSave}
              className="min-h-[180px] font-mono text-sm bg-background border-border resize-y"
              placeholder="You are a helpful college admissions assistant. Keep answers brief and conversational..."
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>First Message</FieldLabel>
            <Input
              value={formData.first_message || ""}
              onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
              onBlur={handleBlurSave}
              className="bg-background border-border"
              placeholder="Hello! How can I help you today?"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Model</FieldLabel>
            <Select
              value={formData.model}
              onValueChange={(v) => {
                const u = { ...formData, model: v };
                setFormData(u);
                saveMutation.mutate(u);
              }}
            >
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>{m.label}</span>
                      <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {m.badge}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SectionCard>

        {/* Section 2: Voice & Language */}
        <SectionCard number={2} icon={Mic2} title="Voice & Language">
          {/* Language Selector */}
          <div className="space-y-1.5">
            <FieldLabel>
              <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> Language</span>
            </FieldLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    const defaultVoice = VOICES_BY_LANGUAGE[lang.code]?.[0]?.value || "aura-asteria-en";
                    const u = { ...formData, language: lang.code, voice_id: defaultVoice, voice_provider: VOICES_BY_LANGUAGE[lang.code]?.[0]?.provider || "deepgram" };
                    setFormData(u);
                    saveMutation.mutate(u);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
                    currentLanguage === lang.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-center leading-tight">{lang.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Cards */}
          <div className="space-y-1.5">
            <FieldLabel>
              <span className="flex items-center gap-1.5"><Volume2 className="w-3 h-3" /> Voice</span>
            </FieldLabel>
            <div className="grid gap-2">
              {voicesForLanguage.map((v) => {
                const badge = PROVIDER_BADGE[v.provider];
                const isSelected = formData.voice_id === v.value;
                const isPreviewing = previewingVoice === v.value;
                return (
                  <div
                    key={v.value}
                    onClick={() => {
                      const u = { ...formData, voice_id: v.value, voice_provider: v.provider };
                      setFormData(u);
                      saveMutation.mutate(u);
                    }}
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/40 hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full transition-colors ${isSelected ? "bg-primary" : "bg-muted"}`} />
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {v.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{v.gender}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {badge && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: `${badge.color}22`, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      )}
                      <button
                        type="button"
                        title="Preview voice"
                        onClick={(e) => { e.stopPropagation(); playVoicePreview(v.value); }}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                      >
                        {isPreviewing
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Play className="w-3 h-3" />}
                        <span>Preview</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>

        {/* Section 3: Tools */}
        <SectionCard number={3} icon={Wrench} title="Tools">
          {assistantId === "new" ? (
            <p className="text-sm text-muted-foreground">
              Save the assistant first to assign tools.
            </p>
          ) : allTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tools configured. Go to Tools Library to create some.
            </p>
          ) : (
            <div className="space-y-2">
              {allTools.map((tool: any) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/30 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">{tool.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {tool.tool_type} • {tool.description}
                    </div>
                  </div>
                  <Switch
                    checked={isAssigned(tool.id)}
                    onCheckedChange={(c) =>
                      toggleToolMutation.mutate({ toolId: tool.id, enabled: c })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Section 4: Knowledge Base */}
        <SectionCard number={4} icon={BookOpen} title="Knowledge Base">
          {assistantId === "new" ? (
            <p className="text-sm text-muted-foreground">
              Save the assistant first to upload knowledge base files.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Upload .txt, .md, or .csv files. During calls, the AI can search this knowledge
                  base when questions exceed its training context.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  className="hidden"
                  onChange={handleKbFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={kbUploading}
                  className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border bg-background hover:border-primary hover:bg-primary/5 w-full px-4 py-3 text-sm text-muted-foreground hover:text-primary transition-all"
                >
                  {kbUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {kbUploading ? "Uploading..." : "Click to upload a file"}
                </button>
              </div>
              {kbDocs.length > 0 && (
                <div className="space-y-2 mt-2">
                  {kbDocs.map((doc) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background"
                    >
                      <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {doc.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {doc.content.length.toLocaleString()} chars •{" "}
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteKbDoc(doc.id, doc.title)}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
              {kbDocs.length === 0 && !kbUploading && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No documents uploaded yet.
                </p>
              )}
            </>
          )}
        </SectionCard>

        {/* Section 5: Cached Q&As */}
        <SectionCard number={5} icon={Sparkles} title="High-Speed Cached Q&As">
          {assistantId === "new" ? (
            <p className="text-sm text-muted-foreground">
              Save the assistant first to configure high-speed Q&A caching.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground font-medium leading-relaxed bg-primary/5 text-primary border border-primary/10 rounded-lg p-3">
                ⭐ Generate up to 50 commonly asked questions and answers based on your Assistant
                prompt and Knowledge Base files. If a caller asks a matching question, the assistant
                will reply instantly without calling the LLM—saving API costs and removing speech
                latency.
              </p>

              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveQaTab("generate")}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                    activeQaTab === "generate"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AI Generator
                </button>
                <button
                  onClick={() => setActiveQaTab("paste")}
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 ${
                    activeQaTab === "paste"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Copy-Paste Block
                </button>
              </div>

              {activeQaTab === "generate" ? (
                <div className="space-y-1.5">
                  <FieldLabel>Generation Prompt & Guidelines</FieldLabel>
                  <Textarea
                    value={qaInstruction}
                    onChange={(e) => setQaInstruction(e.target.value)}
                    className="min-h-[80px] bg-background border-border text-sm resize-none"
                    placeholder="e.g. Focus on course fee structures, admissions eligibility, intake capacity, and deadlines. Keep answers short and direct."
                  />
                  <button
                    onClick={handleGenerateQAs}
                    disabled={generatingQas}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground w-full py-2.5 text-sm font-semibold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {generatingQas ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generatingQas ? "Generating up to 50 Q&As..." : "Generate Cached Q&As"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <FieldLabel>Paste Q&A Raw Text Block</FieldLabel>
                  <Textarea
                    value={pasteQAsText}
                    onChange={(e) => setPasteQAsText(e.target.value)}
                    className="min-h-[140px] font-mono text-xs bg-background border-border resize-y"
                    placeholder="Q1. What is the location? A: Near Chakan, Pune.&#10;Q2. What is the fee? A: B.E. fee is eighty-five thousand rupees."
                  />
                  <button
                    onClick={handleBulkImportQAs}
                    disabled={importingQas}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground w-full py-2.5 text-sm font-semibold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {importingQas ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {importingQas ? "Importing & Saving..." : "Parse & Import Q&As"}
                  </button>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Cached Q&A Directory ({qas.length} Items)
                  </h4>
                  <button
                    onClick={() => setShowAddManual(!showAddManual)}
                    className="text-xs text-primary hover:underline font-medium cursor-pointer"
                  >
                    {showAddManual ? "Cancel" : "+ Add Manually"}
                  </button>
                </div>

                {showAddManual && (
                  <div className="rounded-lg border border-border bg-accent/20 p-3.5 space-y-3">
                    <div className="space-y-1">
                      <FieldLabel>Question</FieldLabel>
                      <Input
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        placeholder="e.g. What is the intake capacity for CS?"
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <FieldLabel>Answer</FieldLabel>
                      <Textarea
                        value={newAnswer}
                        onChange={(e) => setNewAnswer(e.target.value)}
                        placeholder="e.g. The intake capacity for Computer Engineering is one hundred and twenty students per year."
                        className="min-h-[60px] bg-background resize-none"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveQA()}
                      className="rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      Add to Cache
                    </button>
                  </div>
                )}

                {qas.length > 0 ? (
                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                    {qas.map((qa: any) => (
                      <div
                        key={qa.id}
                        className="rounded-lg border border-border bg-background p-3.5 space-y-2 shadow-sm"
                      >
                        {editingQaId === qa.id ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <FieldLabel>Question</FieldLabel>
                              <Input
                                value={editingQuestion}
                                onChange={(e) => setEditingQuestion(e.target.value)}
                                className="bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <FieldLabel>Answer</FieldLabel>
                              <Textarea
                                value={editingAnswer}
                                onChange={(e) => setEditingAnswer(e.target.value)}
                                className="min-h-[60px] bg-background resize-none"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveQA(qa.id)}
                                className="rounded bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                              >
                                Save Changes
                              </button>
                              <button
                                onClick={() => setEditingQaId(null)}
                                className="rounded border border-border bg-background text-muted-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-semibold text-foreground">
                                Q: {qa.question}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => startEditing(qa)}
                                  className="text-xs text-primary hover:underline font-medium px-1.5 py-0.5 cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteQA(qa.id)}
                                  className="text-xs text-destructive hover:underline font-medium px-1.5 py-0.5 cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 italic bg-accent/20 p-2.5 rounded border border-border/50">
                              A: {qa.answer}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No cached Q&As configured yet. Use the generator above or add manually.
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Right Panel - Test Call */}
      <div className="lg:w-96 flex-shrink-0">
        {assistantId === "new" ? (
          <div className="flex flex-col h-[600px] w-full max-w-sm rounded-xl border border-border bg-card p-8 items-center justify-center text-center sticky top-8">
            <Brain className="w-10 h-10 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">Save the assistant before testing.</p>
          </div>
        ) : (
          <TestCallWidget assistantId={assistantId} />
        )}
      </div>
    </div>
  );
}
