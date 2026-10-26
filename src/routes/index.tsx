import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { VaanixParallax } from "@/components/ui/vaanix-parallax";
import { useSmoothScroll, scrollToTarget } from "@/hooks/use-smooth-scroll";
import { useSectionReveal } from "@/hooks/use-section-reveal";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Initialize single smooth scroll / scroll controller at page level
  useSmoothScroll();

  // Section reveal hooks for scroll-triggered entrance animations
  const featuresRef = useSectionReveal<HTMLElement>();
  const howItWorksRef = useSectionReveal<HTMLElement>();
  const pricingRef = useSectionReveal<HTMLElement>();
  const ctaRef = useSectionReveal<HTMLElement>();
  const footerRef = useSectionReveal<HTMLElement>();

  // Auth check & Scroll listener for Navbar morphing
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setIsAuthenticated(true);
      }
    });

    const handleScroll = () => {
      if (window.scrollY > 60) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      setMobileMenuOpen(false);
      const targetSelector = href === "#product" ? "#product, #features" : href;
      scrollToTarget(targetSelector, -80);
    }
  };

  return (
    <div className="min-h-screen bg-[#050810] text-slate-100 overflow-x-clip selection:bg-[#E8C77A]/30 selection:text-[#E8C77A]">
      
      {/* Dynamic Floating Glassmorphism Navbar - Automatically blends with the page */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 transition-all duration-500 ease-out pointer-events-none">
        <div 
          className={`pointer-events-auto mx-auto transition-all duration-500 ease-out flex items-center justify-between ${
            scrolled 
              ? "max-w-5xl mt-3 px-6 py-2.5 rounded-full bg-[#070B16]/85 backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.85),0_0_25px_-4px_rgba(124,92,255,0.25)] ring-1 ring-white/5" 
              : "max-w-7xl pt-5 pb-3 px-4 bg-transparent border-transparent"
          }`}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] rounded-full blur-md opacity-0 group-hover:opacity-75 transition-opacity duration-300" />
              <img src="/logo.png" alt="Vaanix" className="h-7 w-auto object-contain relative z-10 transition-transform duration-300 group-hover:scale-105" />
            </div>
            <span className="text-xl font-bold tracking-widest text-slate-100 font-sans">VAANIX</span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            <a 
              href="#product" 
              onClick={(e) => handleAnchorClick(e, "#product")}
              className="text-sm font-medium text-slate-350 hover:text-white transition-colors duration-200 relative group py-1"
            >
              Product
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300 group-hover:w-full rounded-full" />
            </a>
            <a 
              href="#how-it-works" 
              onClick={(e) => handleAnchorClick(e, "#how-it-works")}
              className="text-sm font-medium text-slate-350 hover:text-white transition-colors duration-200 relative group py-1"
            >
              How It Works
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300 group-hover:w-full rounded-full" />
            </a>
            <a 
              href="#pricing" 
              onClick={(e) => handleAnchorClick(e, "#pricing")}
              className="text-sm font-medium text-slate-350 hover:text-white transition-colors duration-200 relative group py-1"
            >
              Pricing
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300 group-hover:w-full rounded-full" />
            </a>
            <a 
              href="https://docs.vaanix.ai" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm font-medium text-slate-350 hover:text-white transition-colors duration-200 relative group py-1"
            >
              Docs
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300 group-hover:w-full rounded-full" />
            </a>
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
                <Link to="/auth" className="text-sm font-medium text-slate-350 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link 
                  to="/auth" 
                  className="bg-gold-gradient text-[#05070D] font-semibold text-xs uppercase tracking-wider px-5 py-2.5 rounded-full shadow-[0_0_20px_-3px_rgba(34,211,238,0.4)] hover:shadow-[0_0_25px_rgba(34,211,238,0.6)] hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Backdrop & Panel */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-x-4 top-[74px] z-50 max-w-lg mx-auto bg-[#070B16]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col gap-6 md:hidden shadow-2xl transition-all duration-300 ring-1 ring-white/10"
        >
          <div className="flex flex-col gap-4">
            <a 
              href="#product" 
              onClick={(e) => handleAnchorClick(e, "#product")}
              className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
            >
              Product
            </a>
            <a 
              href="#how-it-works" 
              onClick={(e) => handleAnchorClick(e, "#how-it-works")}
              className="text-lg font-medium text-slate-350 hover:text-slate-100 transition-colors"
            >
              How It Works
            </a>
            <a 
              href="#pricing" 
              onClick={(e) => handleAnchorClick(e, "#pricing")}
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
        </div>
      )}

      {/* 2. Hero: VaanixParallax */}
      <VaanixParallax />

      {/* 3. Hand-off divider (hero to Features, seamless) */}
      <div aria-hidden className="pointer-events-none -mt-px h-48 w-full bg-gradient-to-b from-[#0B1020] to-[#050810]" />

      {/* 4. Features: High-Performance Stack */}
      <section 
        ref={featuresRef} 
        id="features" 
        className="py-24 relative px-6 max-w-7xl mx-auto scroll-mt-20"
      >
        <span id="product" className="absolute -top-20" aria-hidden="true" />
        <div data-reveal-group data-stagger="0.12" className="text-center mb-20">
          <div 
            data-reveal
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/5 bg-slate-900/30 text-teal-400 text-xs font-semibold tracking-wide mb-4"
          >
            <Sparkles className="w-3.5 h-3.5" /> High-Performance Stack
          </div>
          <h2 data-reveal className="text-3xl md:text-5xl font-bold tracking-tight mb-4 font-sans text-white">
            Built for Cinematic Quality Voice AI
          </h2>
          <p data-reveal className="text-slate-400 max-w-2xl mx-auto text-base">
            No delays. No robot artifacts. Vaanix handles full duplex conversation logic, noise suppression, and prompt tuning out-of-the-box.
          </p>
        </div>

        {/* 3-column features layout: 6 rich cards */}
        <div data-reveal-group data-stagger="0.08" className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
          ].map((feat) => (
            <div
              key={feat.title}
              data-reveal
              className="group relative p-8 rounded-2xl border border-white/5 bg-[#0A0D16] hover:-translate-y-1 hover:border-[#22D3EE]/30 hover:shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] transition-all duration-300 overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-brand-gradient transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
              
              <div className="mb-5 p-3 w-fit rounded-xl bg-white/5 border border-white/5 relative z-10 group-hover:bg-white/10 transition-colors">
                <div className="transition-transform duration-300 group-hover:scale-110">
                  {feat.icon}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2 relative z-10">{feat.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed relative z-10">{feat.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. How It Works Flow */}
      <section 
        ref={howItWorksRef}
        id="how-it-works" 
        className="py-24 relative bg-[#070912]/50 border-y border-white/5 scroll-mt-20"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div data-reveal-group className="text-center mb-20">
            <h2 data-reveal className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">
              Deploy in Three Simple Steps
            </h2>
            <p data-reveal className="text-slate-400 max-w-xl mx-auto text-sm md:text-base">
              Vaanix bridges the gap between complex AI logic and telephone networks.
            </p>
          </div>

          <div className="relative mt-12">
            <div data-line className="absolute top-[35px] left-[15%] right-[15%] h-[1.5px] bg-brand-gradient opacity-20 hidden md:block" />

            <div data-reveal-group data-stagger="0.25" className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              {[
                {
                  step: "01",
                  title: "Build Agent Flow",
                  desc: "Design system prompts, upload documents, and choose standard voice characteristics in our console.",
                  delay: "0s"
                },
                {
                  step: "02",
                  title: "Connect Phone Number",
                  desc: "Provision virtual local or toll-free Twilio numbers or bridge into your existing SIP trunk.",
                  delay: "0.4s"
                },
                {
                  step: "03",
                  title: "Go Live Instantly",
                  desc: "Handle calls immediately. View automated logs, transcript lists, and common conversation stats.",
                  delay: "0.8s"
                }
              ].map((step) => (
                <div
                  key={step.step}
                  data-reveal
                  className="flex flex-col items-center md:items-start text-center md:text-left"
                >
                  <div 
                    className="h-18 w-18 flex items-center justify-center rounded-full bg-[#0A0D16] border border-white/10 mb-6 text-[#E8C77A] font-bold text-xl relative animate-pulse-step"
                    style={{ animationDelay: step.delay }}
                  >
                    <div className="absolute inset-0 bg-brand-gradient opacity-10 rounded-full blur-sm" />
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold text-slate-100 mb-3">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed max-w-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing Cards: Starter, Pro, Enterprise */}
      <section 
        ref={pricingRef}
        id="pricing" 
        className="py-24 px-6 max-w-7xl mx-auto scroll-mt-20"
      >
        <div data-reveal-group className="text-center mb-20">
          <div data-reveal className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/20 bg-teal-500/10 text-teal-400 text-xs font-semibold uppercase tracking-wider mb-4">
            Cost-Effective AI Telephony
          </div>
          <h2 data-reveal className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">
            Practical, Cost-Cutting Indian Rupee Pricing
          </h2>
          <p data-reveal className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base">
            Reduce calling overhead by up to 85% compared to traditional tele-calling staff. Transparent plans in ₹ INR with zero hidden setup fees.
          </p>
        </div>

        <div data-reveal-group data-stagger="0.15" className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          
          {/* Starter Plan */}
          <div 
            data-reveal
            className="rounded-2xl border border-white/5 bg-[#0A0D16] p-8 flex flex-col justify-between hover:border-slate-800 transition-colors duration-300"
          >
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-1">Starter</div>
              <div className="text-xs text-slate-500 mb-4">For single clinics, salons & local businesses</div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">
                  <span data-count="999" data-prefix="₹">₹999</span>
                </span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <div className="text-[11px] text-teal-400 font-medium mb-6">~₹1.99 / minute effective rate</div>
              <ul className="space-y-4 text-sm text-slate-300 mb-8">
                <li className="flex items-center gap-2">✓ 1 Active AI Voice Assistant</li>
                <li className="flex items-center gap-2">✓ 500 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ Hindi, Marathi & English voices</li>
                <li className="flex items-center gap-2">✓ Appointment scheduling & CRM sync</li>
                <li className="flex items-center gap-2">✓ Basic analytics & Call transcripts</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full border border-white/10 hover:bg-white/5 hover:brightness-110 hover:shadow-[0_0_30px_-6px_rgba(34,211,238,0.6)] transition-all duration-300 text-xs font-bold uppercase tracking-wider mt-auto text-slate-200"
            >
              Choose Starter — ₹999
            </Link>
          </div>

          {/* Pro Plan (Highlighted in Middle) */}
          <div 
            data-reveal
            className="rounded-2xl relative p-8 flex flex-col justify-between bg-[#0B0F1D] border-2 border-[#14B8A6] animate-pro-glow hover:-translate-y-1 transition-transform duration-300 group shadow-[0_0_30px_rgba(20,184,166,0.2)]"
          >
            <div className="absolute top-4 right-4 bg-brand-gradient text-[#05070D] font-bold text-[9px] uppercase tracking-wider px-2.5 py-1 rounded">
              Best ROI • Most Popular
            </div>

            <div>
              <div className="text-[#E8C77A] text-xs uppercase tracking-widest font-bold mb-1">Pro</div>
              <div className="text-xs text-slate-400 mb-4">For multi-chair salons, clinics & growing brands</div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">
                  <span data-count="2499" data-prefix="₹">₹2,499</span>
                </span>
                <span className="text-slate-400 text-sm">/ month</span>
              </div>
              <div className="text-[11px] text-[#E8C77A] font-medium mb-6">~₹0.99 / minute effective rate</div>
              <ul className="space-y-4 text-sm text-slate-200 mb-8">
                <li className="flex items-center gap-2">✓ 5 Active AI Voice Assistants</li>
                <li className="flex items-center gap-2">✓ 2,500 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ High-fidelity Neural voices (Edge & ElevenLabs)</li>
                <li className="flex items-center gap-2">✓ Live Calendar Booking & WhatsApp/SMS</li>
                <li className="flex items-center gap-2">✓ Smart barge-in & custom FAQ knowledge base</li>
                <li className="flex items-center gap-2">✓ Priority WhatsApp & phone support</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full bg-gold-gradient text-[#05070D] font-bold text-xs uppercase tracking-wider mt-auto shadow-md hover:brightness-110 hover:shadow-[0_0_30px_-6px_rgba(34,211,238,0.6)] transition-all duration-300"
            >
              Choose Pro — ₹2,499
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div 
            data-reveal
            className="rounded-2xl border border-white/5 bg-[#0A0D16] p-8 flex flex-col justify-between hover:border-slate-800 transition-colors duration-300"
          >
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-1">Enterprise</div>
              <div className="text-xs text-slate-500 mb-4">For salon chains, hospitals & high-volume teams</div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-white">
                  <span data-count="7999" data-prefix="₹">₹7,999</span>
                </span>
                <span className="text-slate-500 text-sm">/ month</span>
              </div>
              <div className="text-[11px] text-teal-400 font-medium mb-6">~₹0.79 / minute high-volume rate</div>
              <ul className="space-y-4 text-sm text-slate-300 mb-8">
                <li className="flex items-center gap-2">✓ Unlimited Voice Assistants</li>
                <li className="flex items-center gap-2">✓ 10,000 Call Minutes included</li>
                <li className="flex items-center gap-2">✓ Custom voice cloning & vocabulary tuning</li>
                <li className="flex items-center gap-2">✓ Dedicated SIP trunks & Twilio BYOT</li>
                <li className="flex items-center gap-2">✓ Custom ERP / Webhook automations</li>
                <li className="flex items-center gap-2">✓ Dedicated account manager & 99.9% SLA</li>
              </ul>
            </div>
            <Link 
              to="/auth" 
              className="w-full text-center py-3 rounded-full border border-white/10 hover:bg-white/5 hover:brightness-110 hover:shadow-[0_0_30px_-6px_rgba(34,211,238,0.6)] transition-all duration-300 text-xs font-bold uppercase tracking-wider mt-auto text-slate-200"
            >
              Choose Enterprise — ₹7,999
            </Link>
          </div>

        </div>
      </section>

      {/* 7. Final CTA Banner */}
      <section 
        ref={ctaRef}
        className="py-32 relative overflow-hidden border-t border-white/5 bg-[#050810]"
      >
        <div data-glow aria-hidden className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.25),rgba(34,211,238,0.10)_45%,transparent_70%)] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[140%] h-[320px] bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(232,199,122,0.05),transparent)] pointer-events-none z-0" />
        
        <div data-reveal-group data-stagger="0.15" className="relative z-10 max-w-4xl mx-auto text-center px-6">
          <h2 data-reveal className="text-3xl md:text-5xl font-bold tracking-tight mb-6 text-white">
            Ready to Build Your First Agent?
          </h2>
          <p data-reveal className="text-slate-400 max-w-lg mx-auto mb-10 text-base">
            No credit card required. Get 100 free minutes immediately upon sign up.
          </p>
          
          <div data-reveal>
            <Link 
              to="/auth"
              className="bg-gold-gradient text-[#05070D] font-bold text-sm uppercase tracking-wider px-12 py-4.5 rounded-full inline-block shadow-[0_0_30px_rgba(232,199,122,0.25)] hover:shadow-[0_0_40px_rgba(232,199,122,0.45)] hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 animate-cta-pulse"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer 
        ref={footerRef}
        className="bg-[#030408] border-t border-white/5 py-16 px-6 relative z-10"
      >
        <div data-reveal-group data-stagger="0.1" className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          
          <div data-reveal className="flex flex-col gap-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="Vaanix" className="h-6 w-auto object-contain" />
              <span className="text-lg font-bold tracking-wider text-slate-100">VAANIX</span>
            </Link>
            <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
              Voice AI Agents, Simplified. Premium, sub-second latency speech logic built for production pipelines.
            </p>
          </div>

          <div data-reveal>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Product</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#product" onClick={(e) => handleAnchorClick(e, "#product")} className="hover:text-slate-300 transition-colors">Features</a>
              <a href="#pricing" onClick={(e) => handleAnchorClick(e, "#pricing")} className="hover:text-slate-350 transition-colors">Pricing</a>
              <a href="https://docs.vaanix.ai" className="hover:text-slate-350 transition-colors">API Docs</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Status</a>
            </div>
          </div>

          <div data-reveal>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Company</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-350 transition-colors">About Us</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Blog</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Careers</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Contact</a>
            </div>
          </div>

          <div data-reveal>
            <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Legal</h4>
            <div className="flex flex-col gap-2.5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-350 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-slate-350 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-slate-350 transition-colors">GDPR Compliance</a>
            </div>
          </div>

        </div>

        <div data-reveal className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
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
