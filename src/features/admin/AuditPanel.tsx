import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/export";

type Log = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_label: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function AuditPanel() {
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,actor_label,ip_address,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Log[];
    },
  });

  const actions = useMemo(() => {
    const s = new Set<string>();
    (q.data ?? []).forEach((l) => s.add(l.action));
    return Array.from(s).sort();
  }, [q.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((l) => {
      if (action !== "all" && l.action !== action) return false;
      if (!s) return true;
      return (
        l.action.toLowerCase().includes(s) ||
        (l.actor_label ?? "").toLowerCase().includes(s) ||
        (l.entity_type ?? "").toLowerCase().includes(s) ||
        (l.entity_id ?? "").toLowerCase().includes(s)
      );
    });
  }, [q.data, action, search]);

  function exportCsv() {
    downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((l) => ({
        time: l.created_at,
        action: l.action,
        actor: l.actor_label ?? "",
        entity_type: l.entity_type ?? "",
        entity_id: l.entity_id ?? "",
        ip: l.ip_address ?? "",
        metadata: JSON.stringify(l.metadata ?? {}),
      })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">Immutable record of important actions.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Export</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search action, actor, entity…" className="pl-9" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No matching entries.</TableCell></TableRow>
              ) : filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{l.action}</TableCell>
                  <TableCell className="text-xs">{l.actor_label ?? <span className="text-muted-foreground">system</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.entity_type ? `${l.entity_type}${l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.ip_address ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
