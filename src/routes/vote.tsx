import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, X } from "lucide-react";
import { ZONE_LABELS, type Zone } from "@/lib/zones";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { reasonToMessage } from "./index";

export const Route = createFileRoute("/vote")({
  component: VotePage,
});

type Position = {
  id: string;
  title: string;
  kind: "national" | "zonal";
  zone: Zone | null;
  order_index: number;
};
type Candidate = {
  id: string;
  position_id: string;
  name: string;
  institution: string | null;
  current_position: string | null;
  profile: string | null;
  order_index: number;
};

function VotePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [session, setSession] = useState<{
    codeId: string;
    electionId: string;
    zone: Zone;
  } | null>(null);
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Verify code on mount
  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem("cmda_voting_code") : null;
    if (!stored) {
      navigate({ to: "/" });
      return;
    }
    setCode(stored);
    (async () => {
      const { data, error } = await supabase.rpc("validate_voting_code", { p_code: stored });
      if (error) {
        toast.error("Could not verify code.");
        navigate({ to: "/" });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.valid) {
        toast.error(reasonToMessage(row?.reason ?? "invalid_code"));
        sessionStorage.removeItem("cmda_voting_code");
        navigate({ to: "/" });
        return;
      }
      setSession({
        codeId: row.code_id as string,
        electionId: row.election_id as string,
        zone: row.voter_zone as Zone,
      });
    })();
  }, [navigate]);

  const ballotQuery = useQuery({
    enabled: !!session,
    queryKey: ["ballot", session?.electionId, session?.zone],
    queryFn: async (): Promise<{ positions: Position[]; candidates: Candidate[] }> => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, title, kind, zone, order_index, candidates!inner(id, position_id, name, institution, current_position, profile, order_index)")
        .eq("election_id", session!.electionId)
        .eq("active", true)
        .order("order_index", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const positions: Position[] = rows
        .filter((p) => p.kind === "national" || p.zone === session!.zone)
        .map((p) => ({ id: p.id, title: p.title, kind: p.kind, zone: p.zone, order_index: p.order_index }));
      const posIds = new Set(positions.map((p) => p.id));
      const candidates: Candidate[] = [];
      for (const row of rows) {
        if (!posIds.has(row.id)) continue;
        for (const c of row.candidates ?? []) {
          candidates.push(c as Candidate);
        }
      }
      return { positions, candidates };
    },
  });

  const positions = ballotQuery.data?.positions ?? [];
  const candidatesByPos = useMemo(() => {
    const m: Record<string, Candidate[]> = {};
    (ballotQuery.data?.candidates ?? []).forEach((c) => {
      (m[c.position_id] ??= []).push(c);
    });
    return m;
  }, [ballotQuery.data]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const totalSteps = positions.length + 1; // + review
  const currentPos = step < positions.length ? positions[step] : null;
  const progress = totalSteps > 0 ? ((step + (done ? 1 : 0)) / totalSteps) * 100 : 0;

  async function handleSubmit() {
    if (!code || !session) return;
    setSubmitting(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const payload = Object.entries(selections).map(([position_id, candidate_id]) => ({
        position_id,
        candidate_id,
      }));
      const { data, error } = await supabase.rpc("cast_votes", {
        p_code: code,
        p_selections: payload,
        p_fingerprint: fingerprint,
        p_ip: "",
      });
      if (error) throw error;
      const result = data as { ok: boolean; reason?: string; votes_cast?: number };
      if (!result?.ok) {
        toast.error(reasonToMessage(result?.reason ?? "invalid_code"));
        return;
      }
      sessionStorage.removeItem("cmda_voting_code");
      setDone(true);
    } catch (err) {
      console.error(err);
      toast.error("Vote submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <ConfirmationScreen />;

  if (!session || ballotQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!positions.length) {
    return (
      <ShellLayout zone={session.zone}>
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No ballot is available for your zone. Please contact your zonal coordinator.
          </p>
        </Card>
      </ShellLayout>
    );
  }

  return (
    <ShellLayout zone={session.zone}>
      <div className="sticky top-[73px] z-40 -mx-4 mb-6 bg-muted/30 px-4 pb-2 pt-2 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {Math.min(step + 1, totalSteps)} of {totalSteps}
          </span>
          <span>{currentPos ? "Choose a candidate (optional)" : "Review your ballot"}</span>
        </div>
        <Progress value={progress} className="mt-2 h-1.5" />
      </div>

      {currentPos ? (
        <PositionStep
          position={currentPos}
          candidates={candidatesByPos[currentPos.id] ?? []}
          selected={selections[currentPos.id]}
          onSelect={(cid) =>
            setSelections((s) => ({ ...s, [currentPos.id]: cid }))
          }
          onBack={step > 0 ? () => setStep(step - 1) : undefined}
          onNext={() => setStep(step + 1)}
        />
      ) : (
        <ReviewStep
          positions={positions}
          candidatesByPos={candidatesByPos}
          selections={selections}
          onEdit={(i) => setStep(i)}
          onSubmit={handleSubmit}
          submitting={submitting}
          onBack={() => setStep(step - 1)}
        />
      )}
    </ShellLayout>
  );
}

function ShellLayout({ zone, children }: { zone: Zone; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo />
          <Badge variant="secondary" className="bg-primary-soft text-primary">
            {ZONE_LABELS[zone]}
          </Badge>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8">
        <p className="text-center text-xs text-muted-foreground">
          For any challenges or technical issues encountered during the election process, please
          contact the National Electoral Committee.
        </p>
      </footer>
    </div>
  );
}

function PositionStep({
  position,
  candidates,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  position: Position;
  candidates: Candidate[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <div className="sticky top-[73px] z-40 -mx-4 bg-muted/30 px-4 pb-3 pt-1 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">{position.title}</h2>
          </div>
          {selected ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onNext}
              >
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelect("")}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="mr-1 h-4 w-4" /> Clear Selection
              </Button>
            </div>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Voting for this position is optional. You may skip it.
        </p>
      </div>

      <div className="grid gap-3">
        {candidates.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No candidates listed for this position.
          </Card>
        ) : (
          candidates.map((c) => {
            const isSelected = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(isSelected ? "" : c.id)}
                className={
                  "flex w-full items-center gap-4 rounded-xl border-2 bg-card p-4 text-left transition-all " +
                  (isSelected
                    ? "border-primary shadow-md ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:bg-primary-soft/30")
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-semibold uppercase">{c.name}</p>
                  {c.institution ? (
                    <p className="text-xs text-muted-foreground">{c.institution}</p>
                  ) : null}
                  {c.current_position ? (
                    <p className="text-xs text-muted-foreground">{c.current_position}</p>
                  ) : null}
                </div>
                <div
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 " +
                    (isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border")
                  }
                >
                  {isSelected ? <CheckCircle2 className="h-4 w-4" /> : null}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="mt-8 flex justify-between gap-3">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onNext}>
          Next <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReviewStep({
  positions,
  candidatesByPos,
  selections,
  onEdit,
  onSubmit,
  submitting,
  onBack,
}: {
  positions: Position[];
  candidatesByPos: Record<string, Candidate[]>;
  selections: Record<string, string>;
  onEdit: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Review your ballot</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Please confirm your selections. Voting is optional for each position. You will not be
        able to change your ballot after submission.
      </p>

      <div className="mt-6 grid gap-2">
        {positions.map((p, i) => {
          const cand = (candidatesByPos[p.id] ?? []).find((c) => c.id === selections[p.id]);
          return (
            <Card
              key={p.id}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {p.title}
                </p>
                <p className="mt-0.5 truncate font-display text-base font-semibold">
                  {cand?.name ?? <span className="text-muted-foreground">Not selected</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onEdit(i)}>
                Change
              </Button>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 flex justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            "Submit ballot"
          )}
        </Button>
      </div>
    </div>
  );
}

function ConfirmationScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-success-soft/50 via-background to-background px-4">
      <Card className="max-w-md p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold">Thank you for voting</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your ballot has been securely recorded. Your voting code is now retired
          and cannot be used again.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to home
        </Link>
      </Card>
    </div>
  );
}
