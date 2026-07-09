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
import { Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import { NATIONAL_POSITION_DEFAULTS, ZONAL_POSITION_DEFAULTS, ZONES, ZONE_LABELS, type Zone } from "@/lib/zones";
import { logAudit } from "@/lib/audit";

type Election = { id: string; name: string };
type Position = {
  id: string;
  election_id: string;
  title: string;
  slug: string;
  kind: "national" | "zonal";
  zone: Zone | null;
  order_index: number;
  active: boolean;
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function PositionsPanel() {
  const qc = useQueryClient();
  const [electionId, setElectionId] = useState<string>("");

  const electionsQ = useQuery({
    queryKey: ["elections-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("elections").select("id,name").order("created_at");
      if (error) throw error;
      return (data ?? []) as Election[];
    },
  });

  const currentId = electionId || electionsQ.data?.[0]?.id || "";

  const positionsQ = useQuery({
    enabled: !!currentId,
    queryKey: ["positions", currentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id,election_id,title,slug,kind,zone,order_index,active")
        .eq("election_id", currentId)
        .order("kind")
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  async function seedDefaults() {
    if (!currentId) return;
    const rows: Omit<Position, "id">[] = [
      ...NATIONAL_POSITION_DEFAULTS.map((title, i) => ({
        election_id: currentId,
        title,
        slug: slugify(title),
        kind: "national" as const,
        zone: null,
        order_index: i,
        active: true,
      })),
      ...ZONES.map((z, i) => ({
        election_id: currentId,
        title: ZONAL_POSITION_DEFAULTS[z],
        slug: slugify(ZONAL_POSITION_DEFAULTS[z]),
        kind: "zonal" as const,
        zone: z,
        order_index: i,
        active: true,
      })),
    ];
    const { error } = await supabase.from("positions").upsert(rows, { onConflict: "election_id,slug" });
    if (error) return toast.error(error.message);
    toast.success("Default positions added.");
    qc.invalidateQueries({ queryKey: ["positions", currentId] });
  }

  async function del(id: string) {
    if (!confirm("Delete this position and all its candidates?")) return;
    const { error } = await supabase.from("positions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["positions", currentId] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Positions</h2>
          <p className="text-sm text-muted-foreground">National positions are visible to all voters; zonal positions only to matching zones.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={currentId} onValueChange={setElectionId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select election" /></SelectTrigger>
            <SelectContent>
              {(electionsQ.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={seedDefaults} disabled={!currentId}>
            <Sparkles className="mr-1 h-4 w-4" /> Seed defaults
          </Button>
          <NewPositionDialog electionId={currentId} onCreated={() => qc.invalidateQueries({ queryKey: ["positions", currentId] })} />
        </div>
      </div>

      {!currentId ? (
        <EmptyState label="Create an election first." />
      ) : positionsQ.isLoading ? (
        <Loader />
      ) : (positionsQ.data ?? []).length === 0 ? (
        <EmptyState label="No positions yet. Add positions or click Seed defaults." />
      ) : (
        <div className="grid gap-3">
          {positionsQ.data!.map((p) => (
            <Card key={p.id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-semibold">{p.title}</span>
                  <Badge variant="outline" className="capitalize">{p.kind}</Badge>
                  {p.zone ? <Badge className="bg-primary-soft text-primary">{ZONE_LABELS[p.zone]}</Badge> : null}
                </div>
                <div className="text-xs text-muted-foreground">{p.slug}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewPositionDialog({ electionId, onCreated }: { electionId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"national" | "zonal">("national");
  const [zone, setZone] = useState<Zone>("northern");
  const [saving, setSaving] = useState(false);

  const slug = useMemo(() => slugify(title), [title]);

  async function save() {
    if (!electionId || !title.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("positions").insert({
        election_id: electionId,
        title: title.trim(),
        slug,
        kind,
        zone: kind === "zonal" ? zone : null,
      });
      if (error) throw error;
      await logAudit({ action: "position_created", entity_type: "position", metadata: { title, kind } });
      toast.success("Position added.");
      setOpen(false); setTitle("");
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
        <Button disabled={!electionId}><Plus className="mr-1 h-4 w-4" /> Add position</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add position</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "national" | "zonal")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="zonal">Zonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "zonal" ? (
              <div className="space-y-1.5">
                <Label>Zone</Label>
                <Select value={zone} onValueChange={(v) => setZone(v as Zone)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
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
