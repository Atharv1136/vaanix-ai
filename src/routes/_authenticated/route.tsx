import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  Wrench,
  PhoneCall,
  ListChecks,
  BarChart3,
  KeyRound,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  User
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
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
  { to: "/tools", label: "Tools Library", icon: Wrench },
  { to: "/call-logs", label: "Call Logs", icon: ListChecks },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

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
              to={item.to}
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
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <h2 className="text-sm font-semibold tracking-wide text-slate-350">
              {nav.find((n) => pathname.startsWith(n.to))?.label ?? "Dashboard"}
            </h2>
          </div>

          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold hidden sm:block">
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
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