import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const { data: profile } = await (supabase as any)
          .from("business_profiles")
          .select("onboarding_completed")
          .eq("user_id", data.session.user.id)
          .maybeSingle();

        if (profile?.onboarding_completed) {
          navigate({ to: "/workspace", replace: true });
        } else {
          navigate({ to: "/onboarding", replace: true });
        }
      }
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "signup") {
      if (!fullName.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        setErrored((n) => n + 1);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const userId = data.user?.id;
        const { data: profile } = await (supabase as any)
          .from("business_profiles")
          .select("onboarding_completed")
          .eq("user_id", userId)
          .maybeSingle();

        toast.success("Welcome back!");
        if (profile?.onboarding_completed) {
          navigate({ to: "/workspace", replace: true });
        } else {
          navigate({ to: "/onboarding", replace: true });
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;

        if (data.session) {
          // Profile is created by trigger vx_handle_new_user
          toast.success("Account created! Let's set up your business.");
          navigate({ to: "/onboarding", replace: true });
        } else {
          toast.success("Check your email to confirm your account.");
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
      setErrored((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060912] px-4 selection:bg-[#3B82F6]/30 selection:text-[#38BDF8] relative overflow-hidden">
      {/* Aurora Ambient Background Globs */}
      <div className="absolute top-[20%] left-[25%] w-[450px] h-[450px] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_70%)] pointer-events-none blur-2xl z-0" />
      <div className="absolute top-[50%] right-[20%] w-[400px] h-[400px] bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.10),transparent_70%)] pointer-events-none blur-2xl z-0" />
      <div className="absolute bottom-[10%] left-[40%] w-[350px] h-[350px] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_70%)] pointer-events-none blur-2xl z-0" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 shadow-[0_0_30px_rgba(59,130,246,0.2)] p-3">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-orange-500/20 rounded-2xl blur-md" />
            <img src="/logo.png" alt="Vaanix" className="h-full w-auto object-contain relative z-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-slate-100 font-sans mt-1">VAANIX</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Autonomous Voice & Action Engine
          </p>
        </div>

        <motion.form
          key={errored}
          animate={errored > 0 ? { x: [-6, 6, -4, 4, 0] } : undefined}
          transition={{ duration: 0.35 }}
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-[#0B1120]/80 backdrop-blur-xl p-8 shadow-[0_10px_50px_rgba(0,0,0,0.6)] space-y-4"
        >
          <div className="flex border-b border-white/10 pb-4 mb-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                mode === "signin"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                mode === "signup"
                  ? "text-orange-400 border-b-2 border-orange-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Atharv Patil"
                className="bg-[#060912]/80 border-white/10 focus:border-blue-500/50 text-slate-100 rounded-xl"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-slate-400 font-bold">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@business.com"
              className="bg-[#060912]/80 border-white/10 focus:border-blue-500/50 text-slate-100 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-400 font-bold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#060912]/80 border-white/10 focus:border-blue-500/50 text-slate-100 rounded-xl"
            />
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[#060912]/80 border-white/10 focus:border-blue-500/50 text-slate-100 rounded-xl"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-blue-600 via-cyan-500 to-orange-500 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] hover:brightness-105 active:scale-[0.99] transition-all duration-200 flex items-center justify-center disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : mode === "signin" ? (
              "Sign In to Console"
            ) : (
              "Create Business Account"
            )}
          </button>
        </motion.form>

        <p className="mt-6 text-center text-[10px] text-slate-500 uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          Multi-tenant isolated workspace
        </p>
      </motion.div>
    </div>
  );
}