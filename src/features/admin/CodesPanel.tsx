import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Ban, Download, Search, Upload } from "lucide-react";
import { ZONE_LABELS, ZONES, type Zone } from "@/lib/zones";
import { downloadCsv, parseSpreadsheet } from "@/lib/export";

type Election = { id: string; name: string };
type Code = {
  id: string;
  code: string;
  zone: Zone;
  status: "unused" | "used" | "disabled";
  generated_at: string;
  used_at: string | null;
  device_fingerprint: string | null;
  ip_address: string | null;
  voter_name: string | null;
};

export function CodesPanel() {
  const qc = useQueryClient();
  const [electionId, setElectionId] = useState("");
  const [zoneFilter, setZoneFilter] = useState<"all" | Zone>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Code["status"]>("all");
  const [search, setSearch] = useState("");

  const electionsQ = useQuery({
    queryKey: ["elections-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("elections").select("id,name").order("created_at");
      if (error) throw error;
      return (data ?? []) as Election[];
    },
  });
  const currentId = electionId || electionsQ.data?.[0]?.id || "";

  const codesQ = useQuery({
    enabled: !!currentId,
    queryKey: ["codes", currentId, zoneFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("voting_codes")
        .select("id,code,zone,status,generated_at,used_at,device_fingerprint,ip_address,voter_name")
        .eq("election_id", currentId)
        .order("generated_at", { ascending: false })
        .limit(500);
      if (zoneFilter !== "all") q = q.eq("zone", zoneFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Code[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toUpperCase();
    if (!s) return codesQ.data ?? [];
    return (codesQ.data ?? []).filter((c) => c.code.includes(s));
  }, [codesQ.data, search]);

  async function disable(id: string) {
    const { error } = await supabase.from("voting_codes").update({ status: "disabled" }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["codes"] });
  }

  function exportCsv() {
    const rows = filtered.map((c) => ({
      code: c.code,
      zone: ZONE_LABELS[c.zone],
      status: c.status,
      voter: c.voter_name ?? "",
      generated_at: c.generated_at,
      used_at: c.used_at ?? "",
      device_fingerprint: c.device_fingerprint ?? "",
      ip_address: c.ip_address ?? "",
    }));
    downloadCsv(`voting-codes-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Voting Codes</h2>
          <p className="text-sm text-muted-foreground">One-time codes assigned permanently to a zone.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={currentId} onValueChange={setElectionId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Election" /></SelectTrigger>
            <SelectContent>
              {(electionsQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <GenerateCodesDialog electionId={currentId} onDone={() => qc.invalidateQueries({ queryKey: ["codes"] })} />
          <BulkUploadDialog electionId={currentId} onDone={() => qc.invalidateQueries({ queryKey: ["codes"] })} />
          <Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code…" className="pl-9" />
          </div>
          <Select value={zoneFilter} onValueChange={(v) => setZoneFilter(v as "all" | Zone)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {ZONES.map((z) => <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Code["status"])}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="unused">Unused</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {codesQ.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Voter</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Used</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No codes match.</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.code}</TableCell>
                  <TableCell className="text-sm">{c.voter_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{ZONE_LABELS[c.zone]}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "used" ? "secondary" : c.status === "disabled" ? "destructive" : "outline"} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(c.generated_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.used_at ? new Date(c.used_at).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    {c.status !== "used" ? (
                      <Button size="sm" variant="ghost" onClick={() => disable(c.id)}>
                        <Ban className="mr-1 h-3 w-3" /> Disable
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Showing up to 500 rows. Filter or export for more.</p>
    </div>
  );
}

function GenerateCodesDialog({ electionId, onDone }: { electionId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState<Zone>("northern");
  const [count, setCount] = useState(100);
  const [running, setRunning] = useState(false);

  async function gen() {
    if (!electionId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("generate_voting_codes", {
        p_election_id: electionId,
        p_zone: zone,
        p_count: count,
      });
      if (error) throw error;
      toast.success(`Generated ${data} codes for ${ZONE_LABELS[zone]}.`);
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!electionId}><Plus className="mr-1 h-4 w-4" /> Generate codes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate voting codes</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Zone</Label>
            <Select value={zone} onValueChange={(v) => setZone(v as Zone)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Count</Label>
            <Input type="number" min={1} max={10000} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={gen} disabled={running || count < 1}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeZone(raw: string): Zone | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "northern" || s === "north" || s === "northernzone") return "northern";
  if (s === "eastern" || s === "east" || s === "easternzone") return "eastern";
  if (s === "western" || s === "west" || s === "westernzone") return "western";
  return null;
}

function pickRowValue(row: Record<string, unknown>, aliases: string[]): string {
  const key = Object.keys(row).find((k) => aliases.includes(k.trim().toLowerCase()));
  return key ? String(row[key] ?? "").trim() : "";
}

type ParsedVoter = { name: string; zone: Zone | null; reason?: string };

function BulkUploadDialog({ electionId, onDone }: { electionId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [voters, setVoters] = useState<ParsedVoter[]>([]);
  const [running, setRunning] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseSpreadsheet(file);
      const rows: ParsedVoter[] = parsed.map((r) => {
        const name = pickRowValue(r, ["name", "full name", "voter", "voter name", "voter's name", "names"]);
        const zone = normalizeZone(pickRowValue(r, ["zone", "zonal", "zone name", "zonal zone"]));
        return { name, zone, reason: !name ? "Missing name" : !zone ? "Unknown zone" : undefined };
      });
      setVoters(rows);
    } catch (err) {
      console.error(err);
      toast.error("Could not read the file. Please upload an .xlsx, .xls, or .csv file.");
      setVoters([]);
    }
  }

  const valid = voters.filter((v) => v.name && v.zone);
  const invalid = voters.length - valid.length;

  async function upload() {
    if (!electionId || valid.length === 0) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("bulk_create_voting_codes", {
        p_election_id: electionId,
        p_voters: valid.map((v) => ({ name: v.name, zone: v.zone })),
      });
      if (error) throw error;
      const res = data as { created: number; skipped: string[] };
      toast.success(`Created ${res.created} code${res.created === 1 ? "" : "s"}.`);
      if (res.skipped?.length) toast.warning(`${res.skipped.length} row(s) could not be created.`);
      setOpen(false); setVoters([]); setFileName("");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!electionId}>
          <Upload className="mr-1 h-4 w-4" /> Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Bulk upload eligible voters</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload an Excel (.xlsx) or CSV file with a <strong>Name</strong> column and a{" "}
            <strong>Zone</strong> column (Northern, Eastern or Western). One voting code is created
            per row.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv("eligible-voters-template.csv", [{ name: "Example Voter", zone: "northern" }])}
            >
              <Download className="mr-1 h-4 w-4" /> Download template
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:border-primary">
            <Upload className="h-4 w-4" />
            {fileName || "Click to choose a file (.xlsx, .xls or .csv)"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {voters.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p>
                <strong>{valid.length}</strong> valid row{valid.length === 1 ? "" : "s"} ·{" "}
                <strong className={invalid ? "text-destructive" : ""}>{invalid}</strong> ignored
              </p>
              {invalid > 0 ? (
                <ul className="mt-2 max-h-24 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-muted-foreground">
                  {voters.filter((v) => v.reason).slice(0, 20).map((v, i) => (
                    <li key={i}>{v.name || "—"} — {v.reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={upload} disabled={running || valid.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : `Create ${valid.length || ""} codes`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
