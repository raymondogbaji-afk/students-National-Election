import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, ShieldCheck, Vote, Lock, ChartBar } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("validate_voting_code", { p_code: cleaned });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.valid) {
        toast.error(reasonToMessage(row?.reason ?? "invalid_code"));
        return;
      }
      sessionStorage.setItem("cmda_voting_code", cleaned);
      navigate({ to: "/vote" });
    } catch (err) {
      console.error(err);
      toast.error("Could not verify your code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-soft/40 via-background to-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-6 py-10 md:grid-cols-2 md:gap-16 md:py-20">
        <section className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure One-Time Voting
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            National Election Portal
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted-foreground md:text-lg">
            Cast your vote for the Christian Medical and Dental Association of Nigeria
            &mdash; Students&rsquo; Arm. Your voting code determines your zone automatically.
          </p>

          <ul className="mt-8 grid gap-3 text-sm text-muted-foreground">
            <Feature icon={<Vote className="h-4 w-4" />} label="One vote per position, per code" />
            <Feature icon={<Lock className="h-4 w-4" />} label="Encrypted transmission, atomic submission" />
            <Feature icon={<ChartBar className="h-4 w-4" />} label="Results published after the election closes" />
          </ul>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
            <h2 className="font-display text-xl font-semibold">Enter your voting code</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the one-time code delivered to you by CMDA Nigeria.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 8A2F9C1E4B"
                className="h-14 text-center font-mono text-xl tracking-[0.4em]"
                maxLength={20}
                autoComplete="off"
                autoFocus
                inputMode="text"
                aria-label="Voting code"
              />
              <Button
                type="submit"
                variant="default"
                className="h-12 w-full text-base font-semibold"
                disabled={loading || code.trim().length < 4}
              >
                {loading ? "Verifying…" : "Continue"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </form>

            <p className="mt-6 text-xs text-muted-foreground">
              Your code is valid once. After you submit your vote, it cannot be reused.
              For any challenges or technical issues encountered during the election process, please
              contact the National Electoral Committee.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-border/60 px-6 py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} CMDA Nigeria &mdash; Students&rsquo; Arm. All rights reserved.
      </footer>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success">
        {icon}
      </span>
      {label}
    </li>
  );
}

export function reasonToMessage(reason: string): string {
  switch (reason) {
    case "invalid_code":
      return "This voting code is not recognised.";
    case "code_used":
      return "This voting code has already been used.";
    case "code_disabled":
      return "This voting code has been disabled.";
    case "election_not_open":
      return "The election is not currently open.";
    case "election_not_started":
      return "The election has not started yet.";
    case "election_ended":
      return "The election has ended.";
    case "wrong_zone_position":
      return "You are not eligible to vote for this position.";
    case "invalid_position":
      return "One of the selected positions is invalid.";
    case "invalid_candidate":
      return "One of the selected candidates is invalid.";
    default:
      return "Voting is currently unavailable. Please try again shortly.";
  }
}
