import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User,
  Building2,
  Clock,
  Briefcase,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Phone,
  Stethoscope,
  Scissors,
  Headphones,
  Receipt,
  Home,
  ShoppingBag,
  Zap,
  Loader2,
} from "lucide-react";
import { DOMAIN_PACKS as LIB_DOMAIN_PACKS } from "@/lib/domainPacks";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const UI_DOMAIN_PACKS = [
  {
    id: "clinic",
    title: "Healthcare & Clinic",
    icon: Stethoscope,
    badge: "Most Popular",
    color: "from-blue-500/20 to-cyan-500/20 border-cyan-500/30",
    desc: "Autonomous patient booking, slot engine with double-booking prevention, clinic FAQ and emergency transfer.",
  },
  {
    id: "salon",
    title: "Salon, Spa & Wellness",
    icon: Scissors,
    color: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
    desc: "Styling sessions, treatments, therapist slot management, and SMS confirmation.",
  },
  {
    id: "real_estate",
    title: "Real Estate & Properties",
    icon: Building2,
    color: "from-orange-500/20 to-amber-500/20 border-orange-500/30",
    desc: "Site visit scheduling, property catalog lookups, pre-qualification, and buyer lead capture.",
  },
  {
    id: "support",
    title: "Customer Support & Handoff",
    icon: Headphones,
    color: "from-sky-500/20 to-indigo-500/20 border-sky-500/30",
    desc: "Inquiry triage, order lookups, policy FAQ, dispute capture, and intelligent human escalation.",
  },
  {
    id: "collections",
    title: "Payment & Collections",
    icon: Receipt,
    color: "from-emerald-500/20 to-green-500/20 border-emerald-500/30",
    desc: "Friendly payment reminders, identity verification, promise-to-pay logging, and settlement scheduling.",
  },
  {
    id: "generic",
    title: "General Business & Scheduling",
    icon: Briefcase,
    color: "from-teal-500/20 to-cyan-500/20 border-teal-500/30",
    desc: "Universal conversational voice assistant configured with appointments, lead capture, and business FAQs.",
  },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // Step 1: About You
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Owner / Practice Lead");

  // Step 2: Business Profile
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [teamSize, setTeamSize] = useState("2-5");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  // Step 3: Operations
  const [workDays, setWorkDays] = useState("mon-sat");
  const [startHour, setStartHour] = useState("10:00");
  const [endHour, setEndHour] = useState("19:00");
  const [lunchBreak, setLunchBreak] = useState("13:30 - 14:30");
  const [transferPhone, setTransferPhone] = useState("");

  // Step 4: Use Case
  const [domainPack, setDomainPack] = useState("clinic");
  const [callVolume, setCallVolume] = useState("500-2500");
  const [language, setLanguage] = useState("en-IN");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
        (supabase as any)
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }: any) => {
            if (data) {
              if (data.full_name) setFullName(data.full_name);
              if (data.phone) setPhone(data.phone);
              if (data.business_name) setBusinessName(data.business_name);
              if (data.city) setCity(data.city);
              if (data.domain_pack) setDomainPack(data.domain_pack);
              if (data.transfer_number) setTransferPhone(data.transfer_number);
            }
          });
      }
    });
  }, []);

  async function handleFinish() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication expired. Please sign in again.");

      const selectedPack = LIB_DOMAIN_PACKS.find((p) => p.key === domainPack) || LIB_DOMAIN_PACKS[0];

      // 1. Create or check starter assistant for this user
      let assistantId = null;
      const { data: existingAssistants } = await (supabase as any)
        .from("assistants")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (existingAssistants && existingAssistants.length > 0) {
        assistantId = existingAssistants[0].id;
      } else {
        const { data: newAssistant, error: asstErr } = await (supabase as any)
          .from("assistants")
          .insert({
            name: selectedPack.defaultAgentName,
            user_id: user.id,
            system_prompt: selectedPack.systemPromptTemplate,
            first_message: `Hello! Thank you for calling ${businessName || "us"}. How may I assist you today?`,
            voice_id: "en-IN-NeerjaNeural",
            model: "gemini-1.5-flash",
            is_published: true,
          })
          .select("id")
          .single();

        if (!asstErr && newAssistant) {
          assistantId = newAssistant.id;
        }
      }

      // 2. Ensure initial service & resource exist for scheduling
      const { data: existingRes } = await (supabase as any)
        .from("resources")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!existingRes || existingRes.length === 0) {
        await (supabase as any).from("resources").insert({
          user_id: user.id,
          name: fullName || selectedPack.starterResource.name,
          type: selectedPack.starterResource.type,
          phone: transferPhone || null,
          is_active: true,
        });
      }

      const { data: existingServ } = await (supabase as any)
        .from("services")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!existingServ || existingServ.length === 0) {
        for (const serv of selectedPack.starterServices) {
          await (supabase as any).from("services").insert({
            user_id: user.id,
            name: serv.name,
            duration_minutes: serv.duration_minutes,
            price: serv.price,
            description: serv.description,
            is_active: true,
          });
        }
      }

      // 3. Save profile details and mark onboarding complete
      const workingHoursObj = {
        days: workDays,
        start: startHour,
        end: endHour,
        lunch: lunchBreak,
      };

      const { error: profErr } = await (supabase as any)
        .from("business_profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          role,
          business_name: businessName.trim() || `${fullName}'s Clinic`,
          city: city.trim(),
          team_size: teamSize,
          timezone,
          working_hours: workingHoursObj,
          transfer_number: transferPhone.trim() || null,
          domain_pack: domainPack,
          monthly_call_volume: callVolume,
          primary_language: language,
          default_assistant_id: assistantId,
          onboarding_completed: true,
          onboarding_step: 5,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (profErr) throw profErr;

      toast.success("Workspace deployed successfully!");
      navigate({ to: "/workspace", replace: true });
    } catch (err: any) {
      console.error("[Onboarding] Error completing onboarding:", err);
      toast.error(err.message || "Failed to finalize workspace setup.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#060912] text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden">
      {/* Aurora Ambient Background Glow */}
      <div className="absolute top-[10%] left-[30%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.1),transparent_70%)] pointer-events-none blur-3xl z-0" />
      <div className="absolute bottom-[20%] right-[25%] w-[450px] h-[450px] bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08),transparent_70%)] pointer-events-none blur-3xl z-0" />

      {/* Header */}
      <header className="relative z-10 max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 p-2">
            <img src="/logo.png" alt="Vaanix" className="h-full w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider text-slate-100">VAANIX SETUP</h1>
            <p className="text-[11px] text-slate-400">Configure your business workspace</p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="hidden sm:flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === currentStep
                  ? "w-8 bg-gradient-to-r from-blue-500 to-cyan-400"
                  : s < currentStep
                  ? "w-2.5 bg-blue-500/50"
                  : "w-2.5 bg-white/10"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Main Form Body */}
      <main className="relative z-10 max-w-2xl mx-auto w-full py-8">
        <AnimatePresence mode="wait">
          {/* STEP 1: ABOUT YOU */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 mb-1">
                  <User className="w-3.5 h-3.5" /> Step 1 of 5
                </span>
                <h2 className="text-2xl font-bold text-slate-100">Tell us about yourself</h2>
                <p className="text-xs text-slate-400 mt-1">This helps tailor your AI voice greeting and notifications.</p>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0B1120]/70 backdrop-blur-xl p-6 shadow-xl">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Dr. Atharv Patil"
                    className="bg-[#060912]/80 border-white/10 text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Direct Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="bg-[#060912]/80 border-white/10 text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your Role</Label>
                  <Input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Clinic Owner, Practice Director, Operations Lead"
                    className="bg-[#060912]/80 border-white/10 text-slate-100"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: BUSINESS PROFILE */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5" /> Step 2 of 5
                </span>
                <h2 className="text-2xl font-bold text-slate-100">Business Profile</h2>
                <p className="text-xs text-slate-400 mt-1">Configure your organization details.</p>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0B1120]/70 backdrop-blur-xl p-6 shadow-xl">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Business or Clinic Name</Label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Apex Health Clinic"
                    className="bg-[#060912]/80 border-white/10 text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">City / Location</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Mumbai"
                      className="bg-[#060912]/80 border-white/10 text-slate-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team Size</Label>
                    <select
                      value={teamSize}
                      onChange={(e) => setTeamSize(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#060912]/80 border border-white/10 text-slate-100 text-sm outline-none"
                    >
                      <option value="solo">Solo Practice (Just me)</option>
                      <option value="2-5">2 - 5 Staff Members</option>
                      <option value="6-20">6 - 20 Staff Members</option>
                      <option value="20+">20+ Enterprise</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Operating Timezone</Label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#060912]/80 border border-white/10 text-slate-100 text-sm outline-none"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                    <option value="America/New_York">America/New_York (EST - UTC-05:00)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST - UTC-08:00)</option>
                    <option value="Europe/London">Europe/London (GMT - UTC+00:00)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: OPERATIONS & SCHEDULE */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5" /> Step 3 of 5
                </span>
                <h2 className="text-2xl font-bold text-slate-100">Operating Hours & Routing</h2>
                <p className="text-xs text-slate-400 mt-1">Defines slot availability and human escalation lines.</p>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0B1120]/70 backdrop-blur-xl p-6 shadow-xl">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Working Days</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "mon-sat", label: "Mon - Sat" },
                      { id: "mon-fri", label: "Mon - Fri" },
                      { id: "everyday", label: "All 7 Days" },
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setWorkDays(d.id)}
                        className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                          workDays === d.id
                            ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                            : "bg-white/2 border-white/10 text-slate-400 hover:border-white/20"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Opens At</Label>
                    <Input
                      type="time"
                      value={startHour}
                      onChange={(e) => setStartHour(e.target.value)}
                      className="bg-[#060912]/80 border-white/10 text-slate-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Closes At</Label>
                    <Input
                      type="time"
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                      className="bg-[#060912]/80 border-white/10 text-slate-100"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Emergency Human Transfer Number
                  </Label>
                  <Input
                    value={transferPhone}
                    onChange={(e) => setTransferPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="bg-[#060912]/80 border-white/10 text-slate-100"
                  />
                  <p className="text-[11px] text-slate-500">
                    The AI transfers callers here when a human escalation or emergency is requested.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: DOMAIN PACK & USE CASE */}
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1.5 mb-1">
                  <Briefcase className="w-3.5 h-3.5" /> Step 4 of 5
                </span>
                <h2 className="text-2xl font-bold text-slate-100">Select Industry Domain Pack</h2>
                <p className="text-xs text-slate-400 mt-1">Pre-loads actions, slots, prompts, and workflows.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {UI_DOMAIN_PACKS.map((pack) => {
                  const Icon = pack.icon;
                  const isSelected = domainPack === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setDomainPack(pack.id)}
                      className={`relative text-left p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? `bg-gradient-to-br ${pack.color} shadow-lg ring-1 ring-cyan-400/40`
                          : "bg-[#0B1120]/70 border-white/10 hover:border-white/20"
                      }`}
                    >
                      {pack.badge && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {pack.badge}
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-5 h-5 ${isSelected ? "text-cyan-400" : "text-slate-400"}`} />
                        <h3 className="text-sm font-bold text-slate-100">{pack.title}</h3>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{pack.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#0B1120]/70 p-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Call Volume</Label>
                  <select
                    value={callVolume}
                    onChange={(e) => setCallVolume(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#060912]/80 border border-white/10 text-slate-100 text-xs outline-none"
                  >
                    <option value="under-500">&lt; 500 calls / month</option>
                    <option value="500-2500">500 - 2,500 calls / month</option>
                    <option value="2500+">2,500+ calls / month</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Primary Voice Language</Label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#060912]/80 border border-white/10 text-slate-100 text-xs outline-none"
                  >
                    <option value="en-IN">Indian English (en-IN)</option>
                    <option value="en-US">US English (en-US)</option>
                    <option value="hi-IN">Hindi / Hinglish (hi-IN)</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 5: REVIEW & LAUNCH */}
          {currentStep === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Step 5 of 5
                </span>
                <h2 className="text-2xl font-bold text-slate-100">Ready to Launch</h2>
                <p className="text-xs text-slate-400 mt-1">Review your setup before deploying your workspace.</p>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0B1120]/70 backdrop-blur-xl p-6 shadow-xl text-xs space-y-3">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Organization</span>
                  <span className="font-semibold text-slate-200">{businessName || "Your Business"} ({city || "Online"})</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Lead Contact</span>
                  <span className="font-semibold text-slate-200">{fullName} ({phone || userEmail})</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Operating Schedule</span>
                  <span className="font-semibold text-slate-200">{workDays.toUpperCase()} • {startHour} to {endHour}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Domain Pack</span>
                  <span className="font-semibold text-cyan-400 uppercase tracking-wider">{domainPack} Pack</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Double-Booking Guard</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PostgreSQL GiST Active
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Navigation Buttons */}
      <footer className="relative z-10 max-w-2xl mx-auto w-full pt-6 border-t border-white/5 flex items-center justify-between">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s - 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div />
        )}

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={() => {
              if (currentStep === 1 && !fullName.trim()) {
                toast.error("Please enter your name.");
                return;
              }
              if (currentStep === 2 && !businessName.trim()) {
                toast.error("Please enter your business or clinic name.");
                return;
              }
              setCurrentStep((s) => s + 1);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl hover:shadow-[0_0_20px_rgba(59,130,246,0.35)] transition-all"
          >
            Next Step <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-orange-500 text-white font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-xl hover:shadow-[0_0_25px_rgba(59,130,246,0.4)] transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Launch My AI Workspace
          </button>
        )}
      </footer>
    </div>
  );
}
