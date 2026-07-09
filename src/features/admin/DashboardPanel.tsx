import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, Ticket, Vote, Percent, Activity, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ZONE_LABELS, ZONES } from "@/lib/zones";

type Stat = {
  activeElection: { id: string; name: string; status: string } | null;
  codesTotal: number;
  codesUsed: number;
  votesTotal: number;
  byZone: Record<string, { codes: number; used: number }>;
};

export function DashboardPanel() {
  const q = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchStats,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "voting_codes" }, () => q.refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = q.data;
  const turnout = s && s.codesTotal > 0 ? (s.codesUsed / s.codesTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Live Overview</h2>
        <p className="text-sm text-muted-foreground">
          {s?.activeElection ? (
            <>
              <span className="font-medium">{s.activeElection.name}</span> &middot;{" "}
              <Badge variant="outline" className="ml-1 capitalize">
                {s.activeElection.status}
              </Badge>
            </>
          ) : (
            "No active election configured yet."
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Ticket />} label="Codes generated" value={s?.codesTotal ?? 0} />
        <StatCard icon={<Vote />} label="Votes cast (codes used)" value={s?.codesUsed ?? 0} />
        <StatCard
          icon={<TimerReset />}
          label="Remaining voters"
          value={s ? Math.max(0, s.codesTotal - s.codesUsed) : 0}
        />
        <StatCard
          icon={<Percent />}
          label="Turnout"
          value={`${turnout.toFixed(1)}%`}
          sub={`${s?.votesTotal ?? 0} individual votes recorded`}
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-display text-base font-semibold">Turnout by zone</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ZONES.map((z) => {
            const row = s?.byZone[z] ?? { codes: 0, used: 0 };
            const pct = row.codes > 0 ? (row.used / row.codes) * 100 : 0;
            return (
              <div key={z} className="rounded-lg border border-border p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ZONE_LABELS[z]}
                </div>
                <div className="mt-2 font-display text-xl font-bold">{pct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">
                  {row.used} of {row.codes} codes used
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3 w-3" /> Live &mdash; refreshes automatically as votes come in.
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</div>
      </div>
      <div className="mt-2 font-display text-3xl font-bold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </Card>
  );
}

async function fetchStats(): Promise<Stat> {
  const activeElectionRes = await supabase
    .from("elections")
    .select("id,name,status")
    .in("status", ["open", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const electionId = activeElectionRes.data?.id ?? null;

  const codesQ = supabase.from("voting_codes").select("zone,status", { count: "exact" });
  if (electionId) codesQ.eq("election_id", electionId);
  const codesRes = await codesQ;

  const byZone: Record<string, { codes: number; used: number }> = {
    northern: { codes: 0, used: 0 },
    eastern: { codes: 0, used: 0 },
    western: { codes: 0, used: 0 },
  };
  let used = 0;
  (codesRes.data ?? []).forEach((r) => {
    byZone[r.zone].codes += 1;
    if (r.status === "used") {
      byZone[r.zone].used += 1;
      used += 1;
    }
  });

  const votesQ = supabase.from("votes").select("id", { count: "exact", head: true });
  if (electionId) votesQ.eq("election_id", electionId);
  const votesRes = await votesQ;

  return {
    activeElection: activeElectionRes.data ?? null,
    codesTotal: codesRes.data?.length ?? 0,
    codesUsed: used,
    votesTotal: votesRes.count ?? 0,
    byZone,
  };
}
