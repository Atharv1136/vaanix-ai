import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TestCallWidget } from "@/components/TestCallWidget";
import { ArrowLeft, Loader2, Upload, Trash2, FileText, Brain, Mic2, Wrench, BookOpen, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/assistants/$assistantId")({
  component: AssistantBuilder,
});

// NVIDIA NIM models available
const MODELS = [
  { value: "nvidia/nemotron-70b", label: "Nemotron 70B (Recommended)", badge: "NVIDIA" },
  { value: "nvidia/nemotron-mini", label: "Nemotron Nano 8B (Fast)", badge: "NVIDIA" },
  { value: "meta/llama-3.3-70b", label: "Llama 3.3 70B Instruct", badge: "Meta" },
  { value: "meta/llama-3.1-8b", label: "Llama 3.1 8B Instruct (Fast)", badge: "Meta" },
  { value: "mistralai/mistral-7b", label: "Mistral 7B Instruct", badge: "Mistral" },
];

// Free voice options grouped by provider
const VOICES: Record<string, { value: string; label: string; gender: string }[]> = {
  deepgram: [
    { value: "aura-asteria-en", label: "Asteria", gender: "Female" },
    { value: "aura-luna-en", label: "Luna", gender: "Female" },
    { value: "aura-stella-en", label: "Stella", gender: "Female" },
    { value: "aura-hera-en", label: "Hera", gender: "Female" },
    { value: "aura-orpheus-en", label: "Orpheus", gender: "Male" },
    { value: "aura-helios-en", label: "Helios", gender: "Male" },
    { value: "aura-angus-en", label: "Angus", gender: "Male" },
  ],
  elevenlabs: [
    { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", gender: "Female" },
    { value: "EXAVITQu4vr4xnSDxMaL", label: "Bella", gender: "Female" },
    { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", gender: "Female" },
    { value: "pNInz6obbfDQGcgMyIGC", label: "Adam", gender: "Male" },
    { value: "VR6AewLTigWG4xSOukaG", label: "Arnold", gender: "Male" },
    { value: "XrExE9yKIg1WjnnlVkGX", label: "Josh", gender: "Male" },
  ],
  neets: [
    { value: "us-female-2", label: "US Female 2", gender: "Female" },
    { value: "us-female-4", label: "US Female 4", gender: "Female" },
    { value: "us-male-2", label: "US Male 2", gender: "Male" },
    { value: "us-male-4", label: "US Male 4", gender: "Male" },
  ],
};

function SectionCard({ number, icon: Icon, title, children }: { number: number; icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">{number}</div>
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</label>;
}

function AssistantBuilder() {
  const { assistantId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<any>(null);
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [kbUploading, setKbUploading] = useState(false);

  const { data: assistant, isLoading } = useQuery({
    queryKey: ["assistant", assistantId],
    queryFn: async () => {
      if (assistantId === "new") return { name: "New Assistant", system_prompt: "", first_message: "", model: "nvidia/nemotron-70b", voice_provider: "deepgram", voice_id: "aura-asteria-en", is_published: false };
      const { data, error } = await supabase.from("assistants").select("*").eq("id", assistantId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: allTools = [] } = useQuery({
    queryKey: ["tools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tools").select("*");
      if (error) throw error;
      return data;
    }
  });

  const { data: assignedTools = [] } = useQuery({
    queryKey: ["assistant_tools", assistantId],
    queryFn: async () => {
      if (assistantId === "new") return [];
      const { data, error } = await supabase.from("assistant_tools").select("*").eq("assistant_id", assistantId);
      if (error) throw error;
      return data;
    },
    enabled: assistantId !== "new"
  });

  useEffect(() => {
    if (assistant) setFormData(assistant);
  }, [assistant]);

  // Fetch KB documents from server
  useEffect(() => {
    if (assistantId === "new") return;
    fetch(`/api/assistants/${assistantId}/kb-documents`)
      .then(r => r.json())
      .then(docs => setKbDocs(Array.isArray(docs) ? docs : []))
      .catch(() => {});
  }, [assistantId]);

  const saveMutation = useMutation({
    mutationFn: async (newData: any) => {
      // Clean the payload — only send known DB columns, strip undefined/null where not needed
      const payload = {
        name: newData.name || "New Assistant",
        system_prompt: newData.system_prompt || "You are a helpful AI assistant.",
        first_message: newData.first_message || null,
        model: newData.model || "nvidia/nemotron-70b",
        voice_provider: newData.voice_provider || "deepgram",
        voice_id: newData.voice_id || "aura-asteria-en",
        is_published: newData.is_published ?? false,
      };
      if (assistantId === "new") {
        const { data, error } = await supabase.from("assistants").insert([payload]).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("assistants").update(payload).eq("id", assistantId).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      qc.setQueryData(["assistant", data.id], data);
      if (assistantId === "new") {
        navigate({ to: `/assistants/$assistantId`, params: { assistantId: data.id }, replace: true });
      }
      toast.success("Saved", { description: "Assistant configuration updated." });
    },
    onError: (error: any) => toast.error("Failed to save", { description: error.message }),
  });

  const toggleToolMutation = useMutation({
    mutationFn: async ({ toolId, enabled }: { toolId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from("assistant_tools").insert([{ assistant_id: assistantId, tool_id: toolId, enabled: true }]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assistant_tools").delete().match({ assistant_id: assistantId, tool_id: toolId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant_tools", assistantId] }),
  });

  const handleBlurSave = () => { if (formData) saveMutation.mutate(formData); };
  const isAssigned = (toolId: string) => assignedTools.some((at: any) => at.tool_id === toolId && at.enabled);

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
      setKbDocs(prev => [doc, ...prev]);
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
      setKbDocs(prev => prev.filter(d => d.id !== id));
      toast.success(`"${title}" removed.`);
    } else {
      toast.error("Failed to delete document.");
    }
  }

  if (isLoading || !formData) return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const voicesForProvider = VOICES[formData.voice_provider] || [];
  const isSaving = saveMutation.isPending;

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left Panel */}
      <div className="flex-1 space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/assistants" className="p-2 -ml-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <input
              type="text"
              value={formData.name || ""}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
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
              onCheckedChange={v => {
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
              onChange={e => setFormData({ ...formData, system_prompt: e.target.value })}
              onBlur={handleBlurSave}
              className="min-h-[180px] font-mono text-sm bg-background border-border resize-y"
              placeholder="You are a helpful college admissions assistant. Keep answers brief and conversational..."
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>First Message</FieldLabel>
            <Input
              value={formData.first_message || ""}
              onChange={e => setFormData({ ...formData, first_message: e.target.value })}
              onBlur={handleBlurSave}
              className="bg-background border-border"
              placeholder="Hello! How can I help you today?"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Model</FieldLabel>
            <Select
              value={formData.model}
              onValueChange={v => { const u = { ...formData, model: v }; setFormData(u); saveMutation.mutate(u); }}
            >
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>{m.label}</span>
                      <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">{m.badge}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SectionCard>

        {/* Section 2: Voice */}
        <SectionCard number={2} icon={Mic2} title="Voice">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel>Provider</FieldLabel>
              <Select
                value={formData.voice_provider}
                onValueChange={v => {
                  const defaultVoice = VOICES[v]?.[0]?.value || "";
                  const u = { ...formData, voice_provider: v, voice_id: defaultVoice };
                  setFormData(u);
                  saveMutation.mutate(u);
                }}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepgram">Deepgram Aura (Free)</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="neets">Neets.ai (Free)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Voice</FieldLabel>
              <Select
                value={formData.voice_id}
                onValueChange={v => { const u = { ...formData, voice_id: v }; setFormData(u); saveMutation.mutate(u); }}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {voicesForProvider.map(v => (
                    <SelectItem key={v.value} value={v.value}>
                      <span>{v.label}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">({v.gender})</span>
                    </SelectItem>
                  ))}
                  {voicesForProvider.length === 0 && (
                    <SelectItem value={formData.voice_id || "custom"}>{formData.voice_id || "Custom ID"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Voice ID (override)</FieldLabel>
            <Input
              value={formData.voice_id || ""}
              onChange={e => setFormData({ ...formData, voice_id: e.target.value })}
              onBlur={handleBlurSave}
              className="bg-background border-border font-mono text-sm"
              placeholder="e.g. aura-asteria-en"
            />
            <p className="text-[11px] text-muted-foreground">Use the dropdown above or paste a custom voice ID directly.</p>
          </div>
        </SectionCard>

        {/* Section 3: Tools */}
        <SectionCard number={3} icon={Wrench} title="Tools">
          {assistantId === "new" ? (
            <p className="text-sm text-muted-foreground">Save the assistant first to assign tools.</p>
          ) : allTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tools configured. Go to Tools Library to create some.</p>
          ) : (
            <div className="space-y-2">
              {allTools.map((tool: any) => (
                <div key={tool.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-accent/30 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-foreground">{tool.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{tool.tool_type} • {tool.description}</div>
                  </div>
                  <Switch
                    checked={isAssigned(tool.id)}
                    onCheckedChange={c => toggleToolMutation.mutate({ toolId: tool.id, enabled: c })}
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Section 4: Knowledge Base */}
        <SectionCard number={4} icon={BookOpen} title="Knowledge Base">
          {assistantId === "new" ? (
            <p className="text-sm text-muted-foreground">Save the assistant first to upload knowledge base files.</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Upload .txt, .md, or .csv files. During calls, the AI can search this knowledge base when questions exceed its training context.
                </p>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={handleKbFileUpload} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={kbUploading}
                  className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border bg-background hover:border-primary hover:bg-primary/5 w-full px-4 py-3 text-sm text-muted-foreground hover:text-primary transition-all"
                >
                  {kbUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {kbUploading ? "Uploading..." : "Click to upload a file"}
                </button>
              </div>
              {kbDocs.length > 0 && (
                <div className="space-y-2 mt-2">
                  {kbDocs.map(doc => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background"
                    >
                      <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{doc.title}</div>
                        <div className="text-xs text-muted-foreground">{doc.content.length.toLocaleString()} chars • {new Date(doc.created_at).toLocaleDateString()}</div>
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
                <p className="text-xs text-muted-foreground text-center py-2">No documents uploaded yet.</p>
              )}
            </>
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
