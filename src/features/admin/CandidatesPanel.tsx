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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Upload, Download } from "lucide-react";
import { ZONE_LABELS, type Zone } from "@/lib/zones";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { logAudit } from "@/lib/audit";
import { downloadCsv, downloadExcel, parseSpreadsheetAllSheets } from "@/lib/export";

type Election = { id: string; name: string };
type Position = { id: string; title: string; kind: "national" | "zonal"; zone: Zone | null };
type Candidate = {
  id: string;
  position_id: string;
  name: string;
  institution: string | null;
  current_position: string | null;
  profile: string | null;
  zone: Zone | null;
  active: boolean;
};

export function CandidatesPanel() {
  const qc = useQueryClient();
  const [electionId, setElectionId] = useState<string>("");
  const [positionId, setPositionId] = useState<string>("");

  const electionsQ = useQuery({
    queryKey: ["elections-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("elections").select("id,name").order("created_at");
      if (error) throw error;
      return (data ?? []) as Election[];
    },
  });

  const currentElection = electionId || electionsQ.data?.[0]?.id || "";

  const positionsQ = useQuery({
    enabled: !!currentElection,
    queryKey: ["positions-of", currentElection],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id,title,kind,zone")
        .eq("election_id", currentElection)
        .order("kind")
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const candidatesQ = useQuery({
    enabled: !!currentElection,
    queryKey: ["candidates-of", currentElection, positionId],
    queryFn: async () => {
      let q = supabase
        .from("candidates")
        .select("id,position_id,name,institution,current_position,profile,zone,active")
        .order("order_index");
      if (positionId) q = q.eq("position_id", positionId);
      else {
        const posIds = (positionsQ.data ?? []).map((p) => p.id);
        if (posIds.length === 0) return [] as Candidate[];
        q = q.in("position_id", posIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const posMap = useMemo(() => {
    const m: Record<string, Position> = {};
    (positionsQ.data ?? []).forEach((p) => (m[p.id] = p));
    return m;
  }, [positionsQ.data]);

  async function del(id: string) {
    if (!confirm("Delete this candidate?")) return;
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["candidates-of"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Candidates</h2>
          <p className="text-sm text-muted-foreground">Zonal-position candidates must match the position's zone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={currentElection} onValueChange={(v) => { setElectionId(v); setPositionId(""); }}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Election" /></SelectTrigger>
            <SelectContent>
              {(electionsQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={positionId || "all"} onValueChange={(v) => setPositionId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Filter position" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {(positionsQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <NewCandidateDialog
            positions={positionsQ.data ?? []}
            onCreated={() => qc.invalidateQueries({ queryKey: ["candidates-of"] })}
          />
          <BulkUploadDialog
            electionId={currentElection}
            positions={positionsQ.data ?? []}
            onDone={() => qc.invalidateQueries({ queryKey: ["candidates-of"] })}
          />
        </div>
      </div>

      {candidatesQ.isLoading ? (
        <Loader />
      ) : (candidatesQ.data ?? []).length === 0 ? (
        <EmptyState label="No candidates yet." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {candidatesQ.data!.map((c) => {
            const p = posMap[c.position_id];
            return (
              <Card key={c.id} className="flex items-start gap-3 p-4">
                <InitialsAvatar name={c.name} className="h-16 w-16 shrink-0 rounded-lg text-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-base font-semibold">{c.name}</p>
                    {!c.active ? <Badge variant="outline">Inactive</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{p?.title}</p>
                  {c.institution ? <p className="text-xs text-muted-foreground">{c.institution}</p> : null}
                  {c.current_position ? <p className="text-xs text-muted-foreground">{c.current_position}</p> : null}
                  {c.zone ? <Badge className="mt-1 bg-primary-soft text-primary">{ZONE_LABELS[c.zone]}</Badge> : null}
                </div>
                <Button size="icon" variant="ghost" onClick={() => del(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewCandidateDialog({ positions, onCreated }: { positions: Position[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [positionId, setPositionId] = useState("");
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [currentPosition, setCurrentPosition] = useState("");
  const [saving, setSaving] = useState(false);

  const pos = positions.find((p) => p.id === positionId) ?? null;

  async function save() {
    if (!positionId || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("candidates").insert({
        position_id: positionId,
        name: name.trim(),
        institution: institution.trim() || null,
        current_position: currentPosition.trim() || null,
        zone: pos?.kind === "zonal" ? pos.zone : null,
      });
      if (error) throw error;
      await logAudit({ action: "candidate_created", entity_type: "candidate", metadata: { name } });
      toast.success("Candidate added.");
      setOpen(false); setName(""); setInstitution(""); setCurrentPosition(""); setPositionId("");
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> Add candidate</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}{p.zone ? ` — ${ZONE_LABELS[p.zone]}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Chapter</Label>
              <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Current Position</Label>
            <Input value={currentPosition} onChange={(e) => setCurrentPosition(e.target.value)} placeholder="e.g. Class President" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !name.trim() || !positionId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Loader() { return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>; }
function EmptyState({ label }: { label: string }) {
  return <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">{label}</Card>;
}

function pickRowValue(row: Record<string, unknown>, aliases: string[]): string {
  const key = Object.keys(row).find((k) => aliases.includes(k.trim().toLowerCase()));
  return key ? String(row[key] ?? "").trim() : "";
}

type ParsedCandidate = { name: string; position: string; institution: string; current_position: string; profile: string; reason?: string };

function BulkUploadDialog({
  electionId,
  positions,
  onDone,
}: {
  electionId: string;
  positions: Position[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedCandidate[]>([]);
  const [running, setRunning] = useState(false);

  const knownTitles = useMemo(() => new Set(positions.map((p) => p.title.trim().toLowerCase())), [positions]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    try {
      const allSheets = await parseSpreadsheetAllSheets(file);
      const parsedRows: ParsedCandidate[] = [];
      for (const sheet of allSheets) {
        const position = sheet.sheetName.trim();
        for (const r of sheet.rows) {
          const name = pickRowValue(r, ["name", "candidate", "candidate name", "full name", "names"]);
          const institution = pickRowValue(r, ["chapter", "institution", "school", "university", "college"]);
          const current_position = pickRowValue(r, ["current position", "current_position", "role"]);
          const profile = pickRowValue(r, ["profile", "bio", "manifesto", "about", "description"]);
          const reason = !name
            ? "Missing name"
            : !knownTitles.has(position.toLowerCase())
              ? "Unknown position"
              : undefined;
          parsedRows.push({ name, position, institution, current_position, profile, reason });
        }
      }
      setRows(parsedRows);
    } catch (err) {
      console.error(err);
      toast.error("Could not read the file. Please upload an .xlsx, .xls, or .csv file.");
      setRows([]);
    }
  }

  const valid = rows.filter((r) => r.name && r.position && !r.reason);
  const invalid = rows.length - valid.length;

  function downloadTemplate() {
    if (positions.length === 0) {
      downloadCsv("candidates-template.csv", [{ Name: "", Chapter: "", "Current Position": "" }]);
      return;
    }
    const sheets = positions.map((p) => ({
      name: p.title,
      rows: [{ Name: "", Chapter: "", "Current Position": "" }, { Name: "", Chapter: "", "Current Position": "" }],
    }));
    downloadExcel("candidates-template.xlsx", sheets);
  }

  async function upload() {
    if (!electionId || valid.length === 0) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("bulk_create_candidates", {
        p_election_id: electionId,
        p_candidates: valid.map((r) => ({
          position: r.position,
          name: r.name,
          institution: r.institution,
          current_position: r.current_position,
          profile: r.profile,
        })),
      });
      if (error) throw error;
      const res = data as { created: number; skipped: { name: string; reason: string }[] };
      toast.success(`Added ${res.created} candidate${res.created === 1 ? "" : "s"}.`);
      if (res.skipped?.length) toast.warning(`${res.skipped.length} row(s) could not be created.`);
      setOpen(false); setRows([]); setFileName("");
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
        <DialogHeader><DialogTitle>Bulk upload candidates</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload an Excel (.xlsx) file where each <strong>sheet/tab</strong> is named after a position
            title. Each sheet should have <strong>Name</strong>, <strong>Chapter</strong>, and{" "}
            <strong>Current Position</strong> columns. Zone is set automatically for zonal positions.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1 h-4 w-4" /> Download template
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:border-primary">
            <Upload className="h-4 w-4" />
            {fileName || "Click to choose a file (.xlsx)"}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          {rows.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p>
                <strong>{valid.length}</strong> valid row{valid.length === 1 ? "" : "s"} ·{" "}
                <strong className={invalid ? "text-destructive" : ""}>{invalid}</strong> ignored
              </p>
              {invalid > 0 ? (
                <ul className="mt-2 max-h-24 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-muted-foreground">
                  {rows.filter((r) => r.reason).slice(0, 20).map((r, i) => (
                    <li key={i}>{r.name || "—"} — {r.reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={upload} disabled={running || valid.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${valid.length || ""} candidate${valid.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
