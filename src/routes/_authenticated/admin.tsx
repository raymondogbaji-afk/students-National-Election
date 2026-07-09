import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Vote as VoteIcon,
  Users,
  Ticket,
  ChartBar,
  Scroll,
  ShieldCheck,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";

// Panels
import { DashboardPanel } from "@/features/admin/DashboardPanel";
import { ElectionsPanel } from "@/features/admin/ElectionsPanel";
import { PositionsPanel } from "@/features/admin/PositionsPanel";
import { CandidatesPanel } from "@/features/admin/CandidatesPanel";
import { CodesPanel } from "@/features/admin/CodesPanel";
import { ResultsPanel } from "@/features/admin/ResultsPanel";
import { AuditPanel } from "@/features/admin/AuditPanel";
import { UsersPanel } from "@/features/admin/UsersPanel";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type Role = "super_admin" | "committee" | "observer";

function AdminPage() {
  const [session, setSession] = useState<"loading" | "none" | "ok">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? "ok" : "none");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ? "ok" : "none");
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (session === "none") {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-soft/30 via-background to-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 md:p-8">
          <h1 className="font-display text-xl font-bold">Administrator Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to manage the election. This portal is for authorised CMDA staff only.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </Card>
        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-muted-foreground hover:text-primary">&larr; Back to voting portal</a>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const rolesQuery = useQuery({
    queryKey: ["my-roles"],
    queryFn: async (): Promise<Role[]> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });

  const roles = rolesQuery.data ?? [];
  const isSuper = roles.includes("super_admin");
  const canManage = isSuper || roles.includes("committee");
  const hasAnyRole = roles.length > 0;

  const nav = useMemo(
    () =>
      [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
        { id: "elections", label: "Elections", icon: VoteIcon, show: canManage },
        { id: "positions", label: "Positions", icon: ShieldCheck, show: canManage },
        { id: "candidates", label: "Candidates", icon: Users, show: canManage },
        { id: "codes", label: "Voting Codes", icon: Ticket, show: canManage },
        { id: "results", label: "Results", icon: ChartBar, show: true },
        { id: "audit", label: "Audit Log", icon: Scroll, show: true },
        { id: "users", label: "Team & Roles", icon: Users, show: isSuper },
      ].filter((t) => t.show),
    [canManage, isSuper],
  );

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin", replace: true });
  }

  if (rolesQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAnyRole) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Logo className="mx-auto justify-center" />
        <Card className="mt-8 p-8">
          <h1 className="font-display text-xl font-bold">Waiting for role assignment</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account has been created but no role has been assigned yet. A Super
            Administrator must grant you access before you can use the admin portal.
          </p>
          <Button variant="outline" className="mt-6" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </Card>
      </div>
    );
  }

  const panels: Record<string, React.ReactNode> = {
    dashboard: <DashboardPanel />,
    elections: <ElectionsPanel />,
    positions: <PositionsPanel />,
    candidates: <CandidatesPanel />,
    codes: <CodesPanel />,
    results: <ResultsPanel />,
    audit: <AuditPanel />,
    users: <UsersPanel />,
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:static md:translate-x-0`}
      >
        {/* Sidebar background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary/90 to-primary/80" />

        <div className="relative flex flex-col h-full">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Logo showText={false} />
            <div className="leading-tight">
              <div className="font-display text-sm font-bold text-white">CMDA Nigeria</div>
              <div className="text-[10px] uppercase tracking-wider text-white/70">
                Admin Portal
              </div>
            </div>
            <button className="ml-auto text-white/70 hover:text-white md:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActive(item.id); setSidebarOpen(false); }}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active === item.id
                    ? "bg-white text-primary shadow-sm"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="border-t border-white/10 px-3 py-3 space-y-2">
            <div className="px-3">
              <div className="truncate text-xs font-medium text-white">{email}</div>
              <div className="truncate text-[10px] text-white/60">{roles.join(" · ")}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-white/80 hover:bg-white/10 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="font-display text-sm font-semibold capitalize">{active}</h2>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 md:py-8">
          {panels[active] ?? <DashboardPanel />}
        </main>
      </div>
    </div>
  );
}

// Suppress unused var lint if any
void toast;
