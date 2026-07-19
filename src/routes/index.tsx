import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, 
  Sparkles, 
  Volume2, 
  ShieldCheck, 
  Layers,
  ArrowRight,
  Menu,
  X,
  Activity,
  Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Auth check & Scroll listener for Navbar
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setIsAuthenticated(true);
      }
    });

    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#05070D] text-slate-100 overflow-x-hidden selection:bg-[#E8C77A]/30 selection:text-[#E8C77A]">
      
      {/* Sparkles / Particles in Top Corners */}
      <div className="absolute top-0 left-0 right-0 h-[500px] overflow-hidden pointer-events-none z-10">
        <div className="absolute top-10 left-[10%] w-[2px] h-[2px] bg-white rounded-full animate-ping opacity-35" style={{ animationDuration: '3s' }} />
        <div className="absolute top-32 right-[15%] w-[3px] h-[3px] bg-[#E8C77A] rounded-full animate-pulse opacity-40" style={{ animationDuration: '4s' }} />
        <div className="absolute top-24 left-[30%] w-[1px] h-[1px] bg-teal-400 rounded-full opacity-50" />
        <div className="absolute top-48 right-[30%] w-[2px] h-[2px] bg-blue-400 rounded-full animate-pulse opacity-30" style={{ animationDuration: '5s' }} />
      </div>

      {/* Sticky Navbar */}
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled 
            ? "bg-[#05070D]/90 backdrop-blur-md border-b border-white/5 py-4 shadow-xl" 
            : "bg-transparent py-6 border-b border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="Vaanix" className="h-7 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
            <span className="text-xl font-bold tracking-widest text-slate-100 font-sans">VAANIX</span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">Product</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">How It Works</a>
            <a href="#pricing" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">Pricing</a>
            <a href="https://docs.vaanix.ai" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">Docs</a>
          </div>

          {/* CTA Right */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <Link 
                to="/assistants" 
                className="bg-gold-gradient text-[#05070D] font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_rgba(232,199,122,0.4)] transition-all duration-300 flex items-center gap-1.5"
              >
                Go to Console <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">
                  Sign In
                </Link>
                <Link 
                  to="/auth" 
                  className="bg-gold-gradient text-[#05070D] font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full hover:shadow-[0_0_20px_rgba(232,199,122,0.4)] transition-all duration-300"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-slate-400 hover:text-slate-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Backdrop & Panel */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-[70px] z-40 bg-[#05070D] border-b border-white/5 py-6 px-6 flex flex-col gap-6 md:hidden shadow-2xl"
          >
            <div className="flex flex-col gap-4">
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
              >
                Product
              </a>
              <a 
                href="#how-it-works" 
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
              >
                How It Works
              </a>
              <a 
                href="#pricing" 
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
              >
                Pricing
              </a>
              <a 
                href="https://docs.vaanix.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
              >
                Docs
              </a>
            </div>
            
            <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
              {isAuthenticated ? (
                <Link 
                  to="/assistants" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="bg-gold-gradient text-center text-[#05070D] font-semibold text-sm uppercase tracking-wider py-3 rounded-full hover:shadow-lg transition-all duration-300"
                >
                  Go to Console
                </Link>
              ) : (
                <>
                  <Link 
                    to="/auth" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center text-slate-400 font-medium py-2 hover:text-slate-100 transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link 
                    to="/auth" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-gold-gradient text-center text-[#05070D] font-semibold text-sm uppercase tracking-wider py-3 rounded-full hover:shadow-lg transition-all duration-300"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center items-center px-6 pt-24 pb-16 overflow-hidden">
        
        {/* Ambient background glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.04),transparent_65%)] pointer-events-none z-0" />
        <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03),transparent_65%)] pointer-events-none z-0" />
        
        {/* Soft Warm/Gold Floor Reflection Glow */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] md:w-[80%] h-[300px] bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(232,199,122,0.07),transparent)] pointer-events-none z-0" />
        
        {/* Cinematic Radial Backdrop Blur */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#05070D_95%)] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center text-center">
          
          {/* Logo settling into place */}
          <motion.div
            initial={{ scale: 0.4, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ 
              type: "spring",
              damping: 15,
              stiffness: 80,
              duration: 1.0,
              delay: 0.1
            }}
            className="mb-8"
          >
            <div className="relative flex items-center justify-center p-6 rounded-full bg-slate-950/20 backdrop-blur-sm border border-white/5 shadow-2xl">
              {/* Pulse ambient glow behind logo */}
              <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute inset-0 bg-brand-gradient rounded-full blur-2xl pointer-events-none" 
              />
              <img src="/logo.png" alt="Vaanix" className="h-28 w-28 md:h-36 md:w-36 object-contain relative z-10 filter drop-shadow-[0_0_25px_rgba(20,184,166,0.35)]" />
            </div>
          </motion.div>

          {/* Wordmark tracking & fading in */}
          <motion.h1
            initial={{ opacity: 0, letterSpacing: "0.4em" }}
            animate={{ opacity: 1, letterSpacing: "0.2em" }}
            transition={{ duration: 1.0, delay: 0.6, ease: "easeOut" }}
            className="text-4xl md:text-6xl font-extrabold tracking-widest text-slate-100 font-sans mb-4 flex items-center justify-center select-none"
          >
            VAANIX
          </motion.h1>

          {/* Tagline fading up - fixed gradient text clipping */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0, ease: "easeOut" }}
            className="text-lg md:text-2xl font-light text-slate-400 max-w-xl mx-auto mb-10 select-none"
          >
            Voice AI Agents, <span className="bg-gradient-to-r from-blue-400 via-teal-400 to-amber-500 bg-clip-text text-transparent font-medium">Simplified</span>.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.4, ease: "easeOut" }}
            className="flex flex-col sm:flex-row gap-4 items-center justify-center"
          >
            <Link 
              to={isAuthenticated ? "/assistants" : "/auth"}
              className="bg-gold-gradient text-[#05070D] font-bold text-sm uppercase tracking-wider px-10 py-4.5 rounded-full shadow-[0_0_30px_rgba(232,199,122,0.25)] hover:shadow-[0_0_40px_rgba(232,199,122,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              {isAuthenticated ? "Enter Console" : "Get Started Now"}
            </Link>
            
            <a 
              href="#features"
              className="px-8 py-4.5 rounded-full border border-white/10 hover:border-white/20 text-slate-350 hover:text-slate-100 text-sm font-semibold transition-all duration-300 backdrop-blur-sm bg-white/2"
            >
              Explore Platform
            </a>
          </motion.div>
        </div>

        {/* Bounce scroll down indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-slate-500 cursor-pointer hidden md:block z-10"
        >
          <a href="#features" className="flex flex-col items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Scroll Down</span>
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
          </a>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 relative px-6 max-w-7xl mx-auto scroll-mt-16">
        <div className="text-center mb-20">
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/5 bg-slate-900/30 text-teal-400 text-xs font-semibold tracking-wide mb-4"
          >
            <Sparkles className="w-3.5 h-3.5" /> High-Performance Stack
          </motion.div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 font-sans">
            Built for Cinematic Quality Voice AI
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-base">
            No delays. No robot artifacts. Vaanix handles full duplex conversation logic, noise suppression, and prompt tuning out-of-the-box.
          </p>
        </div>

        {/* 3-column features layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: <Bot className="w-6 h-6 text-blue-400" />,
              title: "Sub-Second Latency",
              description: "Custom WebSocket orchestration ensures speech-to-speech response lag stays under 700ms."
            },
            {
              icon: <Volume2 className="w-6 h-6 text-teal-400" />,
              title: "Adaptive Voice Profiles",
              description: "Select from highly realistic generative voice templates or clone custom profiles in minutes."
            },
            {
              icon: <Zap className="w-6 h-6 text-amber-500" />,
              title: "Visual Prompt Design",
              description: "Construct flow trees, knowledge bases, and Twilio webhooks in a unified console layout."
            },
            {
              icon: <Activity className="w-6 h-6 text-red-400" />,
              title: "Realtime Analytics",
              description: "Track common user queries, resolution success, duration metrics, and flagged responses."
            },
            {
              icon: <ShieldCheck className="w-6 h-6 text-slate-350" />,
              title: "Enterprise Protection",
              description: "Encryption-at-rest, custom role permissions, and PII filters protect user voice data."
            },
            {
              icon: <Layers className="w-6 h-6 text-yellow-500" />,
              title: "Seamless Tool Integrations",
              description: "Provide voice agents with dynamic databases, external calendar endpoints, or payment hooks."
            }
          ].map((feat, index) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="relative p-8 rounded-2xl border border-white/5 bg-[#0A0D16] hover:border-slate-800 transition-all duration-300 group overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-brand-gradient transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
              
              <div className="mb-5 p-3 w-fit rounded-xl bg-white/2 border border-white/5 relative z-10 group-hover:bg-white/5 transition-colors">
                {feat.icon}
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2 relative z-10">{feat.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed relative z-10">{feat.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works Flow */}
      <section id="how-it-works" className="py-24 relative bg-[#070912]/50 border-y border-white/5 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              Deploy in Three Simple Steps
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">
              Vaanix bridges the gap between complex AI logic and telephone networks.
            </p>
          </div>

          <div className="relative mt-12">
            <div className="absolute top-[35px] left-[15%] right-[15%] h-[1.5px] bg-brand-gradient opacity-20 hidden md:block" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              {[
                {
                  step: "01",
                  title: "Build Agent Flow",
                  desc: "Design system prompts, upload documents, and choose standard voice characteristics in our console."
                },
                {
                  step: "02",
                  title: "Connect Phone Number",
                  desc: "Provision virtual local or toll-free Twilio numbers or bridge into your existing SIP trunk."
                },
                {
                  step: "03",
                  title: "Go Live Instantly",
                  desc: "Handle calls immediately. View automated logs, transcript lists, and common conversation stats."
                }
              ].map((step, idx) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ delay: idx * 0.2, duration: 0.6 }}
                  className="flex flex-col items-center md:items-start text-center md:text-left"
                >
                  <div className="h-18 w-18 flex items-center justify-center rounded-full bg-[#0A0D16] border border-white/10 mb-6 text-[#E8C77A] font-bold text-xl relative">
                    <div className="absolute inset-0 bg-brand-gradient opacity-10 rounded-full blur-sm" />
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold text-slate-100 mb-3">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-sm">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto scroll-mt-16">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Transparent, Usage-Based Plans
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">
            Start free, scale up as call volume grows. Cancel or upgrade anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          
          {/* Starter Plan */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-white/5 bg-[#0A0D16] p-8 flex flex-col justify-between"
          >
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-2">Starter</div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$29</span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-300 mb-8">
                <li className="flex items-center gap-2">✓ 1 Active AI Voice Assistant</li>
                <li className="flex items-center gap-2">✓ 500 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ Standard voices included</li>
                <li className="flex items-center gap-2">✓ Basic analytics & Call transcripts</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full border border-white/10 hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-wider mt-auto"
            >
              Choose Starter
            </Link>
          </motion.div>

          {/* Pro Plan */}
          <div 
            className="rounded-2xl relative p-8 flex flex-col justify-between bg-[#0B0F1D] shadow-[0_0_40px_rgba(20,184,166,0.1)] border-2 border-[#14B8A6]"
          >
            <div className="absolute top-4 right-4 bg-brand-gradient text-[#05070D] font-bold text-[9px] uppercase tracking-wider px-2.5 py-1 rounded">
              Most Popular
            </div>

            <div>
              <div className="text-[#E8C77A] text-xs uppercase tracking-widest font-bold mb-2">Pro</div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-white">$99</span>
                <span className="text-slate-400 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-200 mb-8">
                <li className="flex items-center gap-2">✓ 5 Active AI Voice Assistants</li>
                <li className="flex items-center gap-2">✓ 2,500 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ Access to ElevenLabs Premium voices</li>
                <li className="flex items-center gap-2">✓ Advanced analytics & Webhook tools</li>
                <li className="flex items-center gap-2">✓ Priority email/chat support</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider mt-auto shadow-md hover:shadow-[0_0_20px_rgba(232,199,122,0.4)] transition-all"
            >
              Choose Pro
            </Link>
          </div>

          {/* Enterprise Plan */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-white/5 bg-[#0A0D16] p-8 flex flex-col justify-between"
          >
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-2">Enterprise</div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$399</span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-4 text-sm text-slate-300 mb-8">
                <li className="flex items-center gap-2">✓ Unlimited Voice Assistants</li>
                <li className="flex items-center gap-2">✓ 15,000 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ Custom voice cloning & fine-tuning</li>
                <li className="flex items-center gap-2">✓ Custom SIP and telephony trunks</li>
                <li className="flex items-center gap-2">✓ Dedicated slack support & SLA</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full border border-white/10 hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-wider mt-auto"
            >
              Choose Enterprise
            </Link>
          </motion.div>

        </div>
      </section>

      {/* Final CTA Banner */}
      <section className="py-32 relative overflow-hidden border-t border-white/5">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140%] h-[320px] bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(232,199,122,0.05),transparent)] pointer-events-none z-0" />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center px-6">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Ready to Build Your First Agent?
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto mb-10 text-base">
            No credit card required. Get 100 free minutes immediately upon sign up.
          </p>
          
          <Link 
            to="/auth"
            className="bg-gold-gradient text-[#05070D] font-bold text-sm uppercase tracking-wider px-12 py-4.5 rounded-full inline-block shadow-[0_0_30px_rgba(232,199,122,0.25)] hover:shadow-[0_0_40px_rgba(232,199,122,0.45)] hover:scale-[1.02] active:scale-[0.99] transition-all duration-300"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#030408] border-t border-white/5 py-16 px-6 relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div className="flex flex-col gap-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Vaanix" className="h-6 w-auto object-contain" />
              <span className="text-lg font-bold tracking-wider text-slate-100">VAANIX</span>
            </Link>
            <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
              Voice AI Agents, Simplified. Premium, sub-second latency speech logic built for production pipelines.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Product</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
              <a href="#pricing" className="hover:text-slate-350 transition-colors">Pricing</a>
              <a href="https://docs.vaanix.ai" className="hover:text-slate-350 transition-colors">API Docs</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Status</a>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Company</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-350 transition-colors">About Us</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Blog</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Careers</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Contact</a>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Legal</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-350 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-slate-350 transition-colors">GDPR Compliance</a>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div>© {new Date().getFullYear()} Vaanix Inc. All rights reserved.</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-400">Twitter / X</a>
            <span>•</span>
            <a href="#" className="hover:text-slate-400">GitHub</a>
            <span>•</span>
            <a href="#" className="hover:text-slate-400">Discord</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
