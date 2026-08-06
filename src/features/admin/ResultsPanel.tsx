import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZONE_LABELS, ZONES, type Zone } from "@/lib/zones";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { downloadExcel } from "@/lib/export";
import { Download, EyeOff, Loader2, Trophy } from "lucide-react";

type Election = { id: string; name: string; results_visible: boolean };
type Position = { id: string; title: string; kind: "national" | "zonal"; zone: Zone | null; order_index: number };
type Candidate = { id: string; name: string; position_id: string };
type VoteRow = { candidate_id: string; position_id: string; zone: Zone };

const CHART = ["var(--color-chart-1)","var(--color-chart-2)","var(--color-chart-3)","var(--color-chart-4)","var(--color-chart-5)"];

export function ResultsPanel() {
  const [electionId, setElectionId] = useState("");
  const [zoneFilter, setZoneFilter] = useState<"all" | Zone>("all");
  const [role, setRole] = useState<{ isAdmin: boolean } | null>(null);
  const [view, setView] = useState<"table" | "charts">("table");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) { setRole({ isAdmin: false }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userRes.user.id);
      setRole({ isAdmin: (data ?? []).some((r) => r.role === "super_admin" || r.role === "committee") });
    })();
  }, []);

  const electionsQ = useQuery({
    queryKey: ["elections-list-results"],
    queryFn: async () => {
      const { data, error } = await supabase.from("elections").select("id,name,results_visible").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Election[];
    },
  });

  const currentElection = (electionsQ.data ?? []).find((e) => e.id === (electionId || electionsQ.data?.[0]?.id)) ?? null;
  const currentId = currentElection?.id ?? "";

  const positionsQ = useQuery({
    enabled: !!currentId,
    queryKey: ["positions-results", currentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions")
        .select("id,title,kind,zone,order_index").eq("election_id", currentId)
        .order("kind").order("order_index");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const candidatesQ = useQuery({
    enabled: !!currentId && positionsQ.isSuccess,
    queryKey: ["candidates-results", currentId, (positionsQ.data ?? []).map((p) => p.id).join(",")],
    queryFn: async () => {
      const posIds = (positionsQ.data ?? []).map((p) => p.id);
      if (posIds.length === 0) return [] as Candidate[];
      const { data, error } = await supabase.from("candidates")
        .select("id,name,position_id").in("position_id", posIds);
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const votesQ = useQuery({
    enabled: !!currentId,
    queryKey: ["votes-results", currentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("votes")
        .select("candidate_id,position_id,zone").eq("election_id", currentId).limit(50000);
      if (error) throw error;
      return (data ?? []) as VoteRow[];
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!currentId) return;
    const ch = supabase.channel("results-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => votesQ.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const candMap = useMemo(() => {
    const m: Record<string, Candidate> = {};
    (candidatesQ.data ?? []).forEach((c) => (m[c.id] = c));
    return m;
  }, [candidatesQ.data]);

  const results = useMemo(() => {
    const byPos: Record<string, { candidateId: string; name: string; count: number }[]> = {};
    const votes = zoneFilter === "all" ? (votesQ.data ?? []) : (votesQ.data ?? []).filter((v) => v.zone === zoneFilter);
    (positionsQ.data ?? []).forEach((p) => (byPos[p.id] = []));
    const perPosCounts: Record<string, Record<string, number>> = {};
    votes.forEach((v) => {
      (perPosCounts[v.position_id] ??= {})[v.candidate_id] = (perPosCounts[v.position_id]?.[v.candidate_id] ?? 0) + 1;
    });
    Object.entries(perPosCounts).forEach(([pid, counts]) => {
      byPos[pid] = Object.entries(counts).map(([cid, count]) => ({
        candidateId: cid,
        name: candMap[cid]?.name ?? "Unknown",
        count,
      })).sort((a, b) => b.count - a.count);
    });
    return byPos;
  }, [votesQ.data, positionsQ.data, candMap, zoneFilter]);

  const isAdmin = role?.isAdmin ?? false;
  const canView = isAdmin || (currentElection?.results_visible ?? false);

  function exportPositions() {
    const sheets = (positionsQ.data ?? []).map((p) => ({
      name: p.title,
      rows: (results[p.id] ?? []).map((r, i) => ({ rank: i + 1, candidate: r.name, votes: r.count })),
    }));
    downloadExcel(`results-${new Date().toISOString().slice(0, 10)}.xlsx`, sheets);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Results</h2>
          <p className="text-sm text-muted-foreground">Live vote counts. Filter by zone or view overall totals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={currentId} onValueChange={setElectionId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Election" /></SelectTrigger>
            <SelectContent>
              {(electionsQ.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={zoneFilter} onValueChange={(v) => setZoneFilter(v as "all" | Zone)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Overall</SelectItem>
              {ZONES.map((z) => <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-border">
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setView("table")}
            >Table</button>
            <button
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "charts" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              onClick={() => setView("charts")}
            >Charts</button>
          </div>
          {isAdmin ? <Button variant="outline" onClick={exportPositions}><Download className="mr-1 h-4 w-4" /> Export</Button> : null}
        </div>
      </div>

      {!currentElection ? (
        <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">No elections yet.</Card>
      ) : !canView ? (
        <Card className="p-10 text-center">
          <EyeOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">Results hidden</h3>
          <p className="mt-1 text-sm text-muted-foreground">Results for this election have not been published yet.</p>
        </Card>
      ) : votesQ.isLoading || positionsQ.isLoading || candidatesQ.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : view === "table" ? (
        <ResultsTable positions={positionsQ.data ?? []} results={results} zoneFilter={zoneFilter} />
      ) : (
        <ResultsCharts positions={positionsQ.data ?? []} results={results} />
      )}
    </div>
  );
}

function ResultsTable({ positions, results, zoneFilter }: { positions: Position[]; results: Record<string, { candidateId: string; name: string; count: number }[]>; zoneFilter: "all" | Zone }) {
  const filtered = positions.filter((p) => p.kind === "national" || zoneFilter === "all" || p.zone === zoneFilter);

  return (
    <div className="grid gap-4">
      {filtered.map((p) => {
        const rows = results[p.id] ?? [];
        const total = rows.reduce((s, r) => s + r.count, 0);
        const maxVotes = rows[0]?.count ?? 0;
        const winner = rows.find((r) => r.count === maxVotes && maxVotes > 0);

        return (
          <Card key={p.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <h3 className="font-display text-base font-semibold">{p.title}</h3>
              <Badge variant="outline" className="capitalize text-[10px]">{p.kind}</Badge>
              {p.zone ? <Badge className="bg-primary-soft text-primary text-[10px]">{ZONE_LABELS[p.zone]}</Badge> : null}
              <span className="ml-auto text-xs text-muted-foreground">{total} total vote{total !== 1 ? "s" : ""}</span>
            </div>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No votes yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">#</th>
                      <th className="px-5 py-2 font-medium">Candidate</th>
                      <th className="px-5 py-2 font-medium text-right">Votes</th>
                      <th className="px-5 py-2 font-medium text-right">%</th>
                      <th className="px-5 py-2 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) : "0.0";
                      const isWinner = winner && r.count === winner.count && maxVotes > 0;
                      return (
                        <tr key={r.candidateId} className={`border-b border-border last:border-0 ${isWinner ? "bg-primary-soft/30" : ""}`}>
                          <td className="px-5 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-5 py-2.5 font-medium">{r.name}</td>
                          <td className="px-5 py-2.5 text-right font-semibold">{r.count}</td>
                          <td className="px-5 py-2.5 text-right text-muted-foreground">{pct}%</td>
                          <td className="px-5 py-2.5 text-center">
                            {isWinner && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                <Trophy className="mr-1 h-3 w-3" /> Winner
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ResultsCharts({ positions, results }: { positions: Position[]; results: Record<string, { candidateId: string; name: string; count: number }[]> }) {
  return (
    <div className="grid gap-6">
      {positions.map((p) => {
        const rows = results[p.id] ?? [];
        const total = rows.reduce((s, r) => s + r.count, 0);
        return (
          <Card key={p.id} className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">{p.title}</h3>
              <Badge variant="outline" className="capitalize">{p.kind}</Badge>
              {p.zone ? <Badge className="bg-primary-soft text-primary">{ZONE_LABELS[p.zone]}</Badge> : null}
              <span className="ml-auto text-xs text-muted-foreground">{total} votes</span>
            </div>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No votes yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={rows}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={rows} dataKey="count" nameKey="name" innerRadius={40} outerRadius={80}>
                        {rows.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
