import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PhoneCall } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
      else navigate({ to: "/auth", replace: true });
      setChecked(true);
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <PhoneCall className="h-5 w-5 animate-pulse text-primary" />
        <span className="text-sm">{checked ? "Redirecting…" : "Loading CampusConnect AI…"}</span>
      </div>
    </div>
  );
}
