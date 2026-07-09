export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={"flex items-center gap-3 " + (className ?? "")}>
      <img
        src="/CMDA LOGO.jpeg"
        alt="CMDA Nigeria"
        className="h-10 w-auto rounded-none"
      />
      {showText ? (
        <div className="leading-tight">
          <div className="font-display text-sm font-bold text-primary">CMDA Nigeria</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Students' National Election
          </div>
        </div>
      ) : null}
    </div>
  );
}
