import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  BookOpen,
  PhoneCall,
  ListChecks,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { to: "/call-lines", label: "Call Lines", icon: PhoneCall },
  { to: "/call-logs", label: "Call Logs", icon: ListChecks },
  { to: "/analytics", label: "Student Queries", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Layout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">CampusConnect</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Admission Console</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 px-2 text-xs">
            <div className="font-medium text-foreground truncate">{user.email}</div>
            <div className="text-muted-foreground">Signed in</div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-8">
          <div className="text-sm text-muted-foreground">
            {nav.find((n) => pathname.startsWith(n.to))?.label ?? "Dashboard"}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </header>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 p-4 md:p-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}