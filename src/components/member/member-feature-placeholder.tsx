import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Sparkles } from "lucide-react";

type MemberFeaturePlaceholderProps = Readonly<{
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  note: string;
}>;

export function MemberFeaturePlaceholder({
  icon: Icon,
  eyebrow,
  title,
  description,
  note,
}: MemberFeaturePlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-4 sm:py-8">
      <section className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/80 shadow-card">
        <div className="bg-gradient-to-br from-choco-700 via-choco-800 to-choco-900 px-6 py-8 text-cream-50 sm:px-10 sm:py-12">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-300 ring-1 ring-inset ring-champagne-300/25">
            <Icon size={26} />
          </span>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-300">
            {eyebrow}
          </p>

          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            {title}
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-cream-100/80 sm:text-base">
            {description}
          </p>
        </div>

        <div className="p-6 sm:p-10">
          <div className="flex items-start gap-3 rounded-2xl border border-champagne-500/25 bg-champagne-400/10 p-4">
            <Sparkles
              size={19}
              className="mt-0.5 shrink-0 text-choco-600"
            />
            <p className="text-sm leading-6 text-ink-700/75">
              {note}
            </p>
          </div>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
          >
            <ArrowLeft size={16} />
            Retour à l’accueil
          </Link>
        </div>
      </section>
    </div>
  );
}
