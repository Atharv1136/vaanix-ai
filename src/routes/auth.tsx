import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneCall, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: email.split("@")[0] } },
        });
        if (error) throw error;
        if (data.session) {
          await supabase.from("staff").insert({
            user_id: data.user?.id,
            email,
            full_name: email.split("@")[0],
            role: "staff",
          });
          toast.success("Account created");
          navigate({ to: "/dashboard", replace: true });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
      setErrored((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <PhoneCall className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">CampusConnect AI</h1>
          <p className="text-xs text-muted-foreground">Admission cell staff console</p>
        </div>

        <motion.form
          key={errored}
          animate={errored > 0 ? { x: [-6, 6, -4, 4, 0] } : undefined}
          transition={{ duration: 0.35 }}
          onSubmit={handleSubmit}
          className="rounded-[10px] border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </div>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <button type="button" className="hover:text-foreground" onClick={() => setMode("signup")}>
                First-time staff? Create the initial account
              </button>
            ) : (
              <button type="button" className="hover:text-foreground" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </motion.form>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Internal tool · access is limited to admission-cell staff.
        </p>
      </motion.div>
    </div>
  );
}