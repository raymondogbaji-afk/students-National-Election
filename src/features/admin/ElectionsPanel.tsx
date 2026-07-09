import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Play, Pause, Square, Loader2, Eye, EyeOff, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/audit";

type Election = {
  id: string;
  name: string;
  status: "draft" | "open" | "paused" | "closed";
  start_at: string | null;
  end_at: string | null;
  results_visible: boolean;
};

export function ElectionsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["elections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("elections")
        .select("id,name,status,start_at,end_at,results_visible")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Election[];
    },
  });

  async function updateStatus(id: string, status: Election["status"]) {
    const patch: Partial<Election> = { status };
    if (status === "open") patch.start_at = new Date().toISOString();
    const { error } = await supabase.from("elections").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({
      action: status === "open" ? "election_opened" : status === "closed" ? "election_closed" : `election_${status}`,
      entity_type: "election",
      entity_id: id,
    });
    toast.success(`Election ${status}.`);
    qc.invalidateQueries({ queryKey: ["elections"] });
  }

  async function toggleResults(id: string, current: boolean) {
    const { error } = await supabase
      .from("elections")
      .update({ results_visible: !current })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["elections"] });
  }

  async function deleteElection(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will also remove all positions, candidates, and votes for this election.`)) return;
    const { error } = await supabase.from("elections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit({ action: "election_deleted", entity_type: "election", entity_id: id });
    toast.success("Election deleted.");
    qc.invalidateQueries({ queryKey: ["elections"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Elections</h2>
          <p className="text-sm text-muted-foreground">Create and manage election events.</p>
        </div>
        <NewElectionDialog onCreated={() => qc.invalidateQueries({ queryKey: ["elections"] })} />
      </div>

      {q.isLoading ? (
        <Loader />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState label="No elections yet. Create the first one to get started." />
      ) : (
        <div className="grid gap-3">
          {q.data!.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold">{e.name}</h3>
                    <Badge variant="outline" className="capitalize">{e.status}</Badge>
                    {e.results_visible ? (
                      <Badge className="bg-success text-success-foreground">Results public</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.start_at ? new Date(e.start_at).toLocaleString() : "—"} &nbsp;→&nbsp;{" "}
                    {e.end_at ? new Date(e.end_at).toLocaleString() : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.status !== "open" ? (
                    <Button size="sm" onClick={() => updateStatus(e.id, "open")}>
                      <Play className="mr-1 h-3 w-3" /> Open
                    </Button>
                  ) : null}
                  {e.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(e.id, "paused")}>
                      <Pause className="mr-1 h-3 w-3" /> Pause
                    </Button>
                  ) : null}
                  {e.status !== "closed" ? (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(e.id, "closed")}>
                      <Square className="mr-1 h-3 w-3" /> Close
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleResults(e.id, e.results_visible)}
                  >
                    {e.results_visible ? (
                      <><EyeOff className="mr-1 h-3 w-3" /> Hide results</>
                    ) : (
                      <><Eye className="mr-1 h-3 w-3" /> Publish results</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteElection(e.id, e.name)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewElectionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("elections")
        .insert({ name: name.trim(), start_at: startAt || null, end_at: endAt || null })
        .select("id")
        .single();
      if (error) throw error;
      await logAudit({ action: "election_created", entity_type: "election", entity_id: data.id });
      toast.success("Election created.");
      setOpen(false);
      setName(""); setStartAt(""); setEndAt("");
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
        <Button><Plus className="mr-1 h-4 w-4" /> New election</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create election</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CMDA Nigeria Students' 2026 Election" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Loader() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
function EmptyState({ label }: { label: string }) {
  return (
    <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">{label}</Card>
  );
}
