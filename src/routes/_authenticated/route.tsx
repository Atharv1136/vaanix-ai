import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  Wrench,
  PhoneCall,
  PhoneOutgoing,
  ListChecks,
  BarChart3,
  KeyRound,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  PhoneForwarded,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      return { user: null };
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.session.user };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err;
      return { user: null };
    }
  },
  component: Layout,
});

const nav = [
  { to: "/assistants", label: "Agents", icon: Bot },
  { to: "/phone-numbers", label: "Phone Numbers", icon: PhoneCall },
  { to: "/bulk-calls", label: "Bulk Calling", icon: PhoneOutgoing },
  { to: "/tools", label: "Tools Library", icon: Wrench },
  { to: "/call-logs", label: "Call Logs", icon: ListChecks },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

// ─── Live Call & Telephony Status Indicator ────────────────────────────────────
function NavbarCallStatus() {
  const qc = useQueryClient();

  // Query active live calls (only calls started within the last 5 minutes without ended_at)
  const { data: activeCalls = [] } = useQuery({
    queryKey: ["active-live-calls"],
    queryFn: async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from("calls")
        .select("id, student_or_caller_number, started_at, ended_at")
        .eq("outcome", "in_progress")
        .is("ended_at", null)
        .gte("started_at", fiveMinutesAgo)
        .order("started_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: 3000,
  });

  // Query active bulk campaigns (must be running with remaining contacts)
  const { data: activeCampaigns = [] } = useQuery({
    queryKey: ["active-running-campaigns"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bulk_call_campaigns")
        .select("id, name, called_count, total_contacts, status")
        .eq("status", "running")
        .limit(1);

      if (data && data.length > 0) {
        const camp = data[0];
        if (camp.total_contacts > 0 && camp.called_count >= camp.total_contacts) {
          return [];
        }
      }
      return data ?? [];
    },
    refetchInterval: 3000,
  });

  // Set up Supabase Realtime channel for instant state sync
  useEffect(() => {
    const channel = supabase
      .channel("navbar-telephony-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => {
          qc.invalidateQueries({ queryKey: ["active-live-calls"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bulk_call_campaigns" },
        () => {
          qc.invalidateQueries({ queryKey: ["active-running-campaigns"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const isCampaignRunning = activeCampaigns.length > 0;
  const isCallActive = activeCalls.length > 0;
  const isBusy = isCampaignRunning || isCallActive;

  if (isCampaignRunning) {
    const camp = activeCampaigns[0];
    return (
      <Link
        to="/bulk-calls"
        className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/15 transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)] group"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span className="font-semibold truncate max-w-[140px] sm:max-w-[200px]">
          Campaign Calling ({camp.called_count}/{camp.total_contacts})
        </span>
        <span className="text-[10px] text-amber-400/80 uppercase font-bold tracking-wider hidden sm:inline">Busy</span>
      </Link>
    );
  }

  if (isCallActive) {
    const call = activeCalls[0];
    const maskedNum = call.student_or_caller_number
      ? `***${call.student_or_caller_number.slice(-4)}`
      : "Active";

    return (
      <Link
        to="/call-logs"
        className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/15 transition-all shadow-[0_0_15px_rgba(244,63,94,0.25)] group"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
        </span>
        <span className="font-semibold">On Call ({maskedNum})</span>
        <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded text-rose-200 uppercase font-bold tracking-wider">
          Live
        </span>
      </Link>
    );
  }

  // Idle / Ready State
  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-400 select-none">
      <span className="relative flex h-2 w-2">
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
      </span>
      <span className="font-medium text-slate-300 hidden sm:inline">Line Status:</span>
      <span className="font-semibold text-emerald-400">Ready to Take Calls</span>
    </div>
  );
}

function Layout() {
  const context = Route.useRouteContext();
  const user = context?.user;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Client-side auth check fallback
  useEffect(() => {
    if (typeof window === "undefined") return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        navigate({ to: "/auth", replace: true });
      }
    });
  }, [navigate]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const userEmail = user?.email ?? "User";
  const userInitial = userEmail.charAt(0).toUpperCase();

  // Sidebar contents component for reuse in desktop and mobile drawer
  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex h-full flex-col bg-[#05070D] text-slate-100">
      {/* Brand Header */}
      <div className={`flex items-center gap-3 px-5 py-5 border-b border-white/5 relative justify-between`}>
        <Link to="/assistants" className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/2 border border-white/10 p-1.5 shadow-md">
            <div className="absolute inset-0 bg-brand-gradient opacity-15 rounded-lg blur-[2px]" />
            <img src="/logo.png" alt="Vaanix" className="h-full w-auto object-contain relative z-10" />
          </div>
          {(!collapsed || isMobile) && (
            <div className="leading-tight animate-fade-in">
              <div className="text-sm font-bold tracking-widest text-slate-100 font-sans">VAANIX</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Console</div>
            </div>
          )}
        </Link>

        {/* Desktop Collapse Button */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 border border-white/10 hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-100 absolute -right-2.5 top-6 z-20"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1.5 px-3 py-6 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as any}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 relative group ${
                active
                  ? "bg-white/5 text-slate-100 font-semibold shadow-inner border border-white/5"
                  : "text-slate-400 hover:bg-white/2 hover:text-slate-100"
              }`}
            >
              {/* Active glow dot */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-gold-gradient" />
              )}
              
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-[#E8C77A]" : "group-hover:text-slate-200"}`} />
              
              {(!collapsed || isMobile) && (
                <span className="truncate">{item.label}</span>
              )}

              {/* Tooltip for collapsed state */}
              {collapsed && !isMobile && (
                <div className="absolute left-14 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-slate-950 text-xs border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap z-55">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User info & Logout at bottom */}
      <div className="border-t border-white/5 p-4 bg-[#030408]">
        {(!collapsed || isMobile) ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-gradient text-[#05070D] font-bold text-sm">
                {userInitial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">{userEmail}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Developer</div>
              </div>
            </div>
            
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs uppercase tracking-wider font-semibold text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all duration-200"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div 
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-gradient text-[#05070D] font-bold text-sm cursor-help relative group"
            >
              {userInitial}
              <div className="absolute left-12 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-slate-950 text-xs border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap z-55">
                {userEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors relative group"
            >
              <LogOut className="h-4 w-4" />
              <div className="absolute left-12 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-slate-950 text-xs border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap z-55">
                Sign Out
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-[#05070D] text-slate-100 selection:bg-[#E8C77A]/30 selection:text-[#E8C77A]">
      
      {/* Desktop Sidebar */}
      <aside 
        className={`hidden md:flex shrink-0 flex-col border-r border-white/5 bg-[#05070D] transition-all duration-300 ease-in-out ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Top Navigation Header */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#05070D] px-6 md:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <h2 className="text-sm font-semibold tracking-wide text-slate-300">
              {nav.find((n) => pathname.startsWith(n.to))?.label ?? "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Call & Telephony Status Pill */}
            <NavbarCallStatus />

            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold hidden lg:block border-l border-white/5 pl-4">
              {new Date().toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
        </header>

        {/* Page Main Content Container */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 p-6 md:p-8 overflow-y-auto"
        >
          <Outlet />
        </motion.main>
      </div>

      {/* Mobile Drawer (Sidebar sliding overlay) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black md:hidden"
            />
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 top-0 left-0 z-55 w-64 md:hidden shadow-2xl border-r border-white/5"
            >
              <div className="absolute top-4 right-4 z-60">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent isMobile={true} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
    </div>
  );
}