import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
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
      if (data.session) navigate({ to: "/assistants", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in successfully");
        navigate({ to: "/assistants", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: email.split("@")[0] } },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          navigate({ to: "/assistants", replace: true });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
      setErrored((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070D] px-4 selection:bg-[#E8C77A]/30 selection:text-[#E8C77A] relative overflow-hidden">
      
      {/* Soft Ambient Globs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(232,199,122,0.03),transparent_70%)] pointer-events-none z-0" />
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.03),transparent_70%)] pointer-events-none z-0" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/2 border border-white/5 shadow-2xl p-3">
            <div className="absolute inset-0 bg-brand-gradient opacity-10 rounded-2xl blur-md" />
            <img src="/logo.png" alt="Vaanix" className="h-full w-auto object-contain relative z-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-slate-100 font-sans mt-2">VAANIX</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Voice AI Agents, Simplified</p>
        </div>

        <motion.form
          key={errored}
          animate={errored > 0 ? { x: [-6, 6, -4, 4, 0] } : undefined}
          transition={{ duration: 0.35 }}
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/5 bg-[#0A0D16] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-slate-400 font-bold">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="bg-[#05070D] border-white/5 focus:border-[#E8C77A]/50 focus:ring-0 text-slate-100 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-400 font-bold">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[#05070D] border-white/5 focus:border-[#E8C77A]/50 focus:ring-0 text-slate-100 rounded-xl"
              />
            </div>
            
            <button 
              type="submit" 
              className="w-full bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider py-3.5 rounded-full hover:shadow-[0_0_20px_rgba(232,199,122,0.35)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 flex items-center justify-center disabled:opacity-50" 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#05070D]" />
              ) : mode === "signin" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </div>
          
          <div className="mt-6 text-center text-xs text-slate-400">
            {mode === "signin" ? (
              <button type="button" className="hover:text-slate-100 transition-colors font-medium underline underline-offset-4" onClick={() => setMode("signup")}>
                Need an account? Create one
              </button>
            ) : (
              <button type="button" className="hover:text-slate-100 transition-colors font-medium underline underline-offset-4" onClick={() => setMode("signin")}>
                Back to Sign In
              </button>
            )}
          </div>
        </motion.form>
        
        <p className="mt-8 text-center text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
          Secure developer console access
        </p>
      </motion.div>
    </div>
  );
}