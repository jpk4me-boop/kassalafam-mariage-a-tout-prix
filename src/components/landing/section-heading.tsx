import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center mx-auto" : "items-start text-left",
        align === "center" && "max-w-2xl",
        className,
      )}
    >
      {eyebrow ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-champagne-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-choco-600">
          <span className="h-1.5 w-1.5 rounded-full bg-champagne-500" />
          {eyebrow}
        </span>
      ) : null}
      <h2 className="font-serif text-3xl leading-tight text-choco-700 sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-base leading-relaxed text-ink-700/80 sm:text-lg">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
