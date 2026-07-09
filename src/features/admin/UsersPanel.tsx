import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Role = "super_admin" | "committee" | "observer";
type RoleRow = { id: string; user_id: string; role: Role; created_at: string };

const ROLES: Role[] = ["super_admin", "committee", "observer"];
const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  committee: "Election Committee",
  observer: "Observer",
};

export function UsersPanel() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("committee");
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id,user_id,role,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  async function grant() {
    if (!userId.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("user_roles").insert({
        user_id: userId.trim(),
        role,
      });
      if (error) throw error;
      toast.success("Role granted.");
      setUserId("");
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">Team &amp; Roles</h2>
        <p className="text-sm text-muted-foreground">
          Assign roles to registered accounts. The user must first sign up on the
          admin sign-in page. Then paste their <span className="font-mono">user_id</span> here
          (available from the Users section of your Cloud dashboard).
        </p>
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <div className="space-y-1.5">
            <Label>User ID (UUID)</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={grant} disabled={saving || !userId.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" /> Grant</>}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {q.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (q.data ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No roles assigned yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-muted-foreground">{r.user_id}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Granted {new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ROLE_LABEL[r.role]}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => revoke(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
