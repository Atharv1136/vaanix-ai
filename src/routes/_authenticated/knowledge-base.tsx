import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
  component: KB,
});

const CATEGORIES = [
  { id: "courses", label: "Courses" },
  { id: "cutoffs", label: "Cutoffs" },
  { id: "documents", label: "Required Documents" },
  { id: "cap_dates", label: "CAP Round Dates" },
  { id: "fees", label: "Fees" },
  { id: "faq", label: "General FAQ" },
] as const;

type Entry = {
  id: string;
  title: string;
  content: string;
  category: string;
  updated_by: string | null;
  updated_at: string;
};

function KB() {
  const [cat, setCat] = useState<string>("courses");
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["kb", cat],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_sections")
        .select("*")
        .eq("category", cat)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const filtered = useMemo(
    () => entries.filter((e) => (e.title + " " + e.content).toLowerCase().includes(q.toLowerCase())),
    [entries, q]
  );

  const addEntry = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("kb_sections").insert({
        category: cat,
        title: "New entry",
        content: "",
        updated_by: u.user?.email ?? "staff",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kb", cat] }),
  });

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      <aside className="w-56 shrink-0 space-y-1">
        <div className="mb-2 px-2 text-xs uppercase tracking-wide text-muted-foreground">Categories</div>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={
              "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors " +
              (cat === c.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {c.label}
          </button>
        ))}
      </aside>

      <motion.section
        key={cat}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries…" className="pl-9" />
          </div>
          <Button onClick={() => addEntry.mutate()} disabled={addEntry.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add entry
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[10px] bg-muted/40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No entries in this category yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => (
              <EntryCard key={e.id} entry={e} onChanged={() => qc.invalidateQueries({ queryKey: ["kb", cat] })} />
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}

function EntryCard({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function save(partial: Partial<Entry>) {
    if (partial.title === entry.title && partial.content === entry.content) return;
    setState("saving");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("kb_sections")
      .update({ ...partial, updated_by: u.user?.email ?? "staff", updated_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (error) {
      toast.error(error.message);
      setState("idle");
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
    onChanged();
  }

  async function del() {
    if (!confirm("Delete this entry? The AI will stop using it immediately.")) return;
    const { error } = await supabase.from("kb_sections").delete().eq("id", entry.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save({ title, content })}
          className="w-full flex-1 border-none bg-transparent text-base font-semibold text-foreground outline-none focus:ring-0"
        />
        <div className="flex items-center gap-2">
          {state === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {state === "saved" && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <button onClick={del} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => save({ title, content })}
        rows={Math.max(3, Math.min(10, content.split("\n").length + 1))}
        className="mt-2 w-full resize-none border-none bg-transparent text-sm text-foreground outline-none focus:ring-0"
        placeholder="Answer content the AI will use…"
      />
      <div className="mt-2 text-[11px] text-muted-foreground">
        Last updated by {entry.updated_by ?? "—"} · {new Date(entry.updated_at).toLocaleString()}
      </div>
    </div>
  );
}