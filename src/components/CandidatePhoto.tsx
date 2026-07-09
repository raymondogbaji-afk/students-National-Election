import { useEffect, useState } from "react";
import { resolvePhotoUrl } from "@/lib/photos";
import { UserRound } from "lucide-react";

export function CandidatePhoto({
  path,
  name,
  className = "",
}: {
  path: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    resolvePhotoUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!url) {
    return (
      <div
        className={
          "flex items-center justify-center bg-primary-soft text-primary " + className
        }
        aria-label={name}
      >
        <UserRound className="h-8 w-8 opacity-60" />
      </div>
    );
  }
  return <img src={url} alt={name} className={"object-cover " + className} />;
}
