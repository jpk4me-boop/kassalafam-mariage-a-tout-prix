"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

export function PublicCandidatePhoto({
  src,
  alt,
  className = "h-full w-full object-cover",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-cream-100/60 text-ink-700/40">
        <UserRound size={64} strokeWidth={1.25} aria-hidden />
        <span className="text-xs font-medium">Photo indisponible</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
