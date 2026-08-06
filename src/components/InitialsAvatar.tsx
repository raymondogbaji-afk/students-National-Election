export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className={`flex items-center justify-center bg-primary-soft font-display font-bold text-primary ${className ?? ""}`}
    >
      {initials}
    </div>
  );
}
