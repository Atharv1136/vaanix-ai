import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Volume2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
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
    setOrgName(data.org_name);
    setStart(data.business_hours_start);
    setEnd(data.business_hours_end);
    setDays(data.business_days);
    setGreet(data.default_greeting);
  }, [data]);

  async function save() {
    const { error } = await supabase
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: greet }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate preview audio.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      toast.dismiss(toastId);
      toast.success("Playing preview");
      
      audio.onended = () => {
        setPlaying(false);
      };
      
      await audio.play();
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.message || "Could not play preview audio.");
      setPlaying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Institution, hours, and the AI's opening line.</p>
      </div>

      <section className="rounded-[10px] border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Institution</h2>
        <Label>Organisation name</Label>
        <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1.5" />
      </section>

      <section className="rounded-[10px] border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Business hours</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Days</Label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5" />
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-border bg-card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Default greeting</h2>
          <span className="text-xs text-muted-foreground">{greet.length} characters</span>
        </div>
        <textarea
          value={greet}
          onChange={(e) => setGreet(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={previewAudio}
          disabled={playing}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
        >
          <Volume2 className="h-3.5 w-3.5" /> {playing ? "Generating..." : "Preview as audio"}
        </button>
      </section>

      <section className="rounded-[10px] border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Staff accounts</h2>
        <ul className="divide-y divide-border">
          {staff.length === 0 && <li className="py-3 text-sm text-muted-foreground">No staff records yet — new sign-ins will appear here.</li>}
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium text-foreground">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">{s.email}</div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{s.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-end">
        <Button onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}