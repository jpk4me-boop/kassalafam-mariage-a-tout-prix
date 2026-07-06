import type { ReactNode } from "react";

import type {
  Distribution,
  FunnelStep,
  TrendPoint,
} from "@/lib/admin/analytics";

/**
 * Composants de présentation des analyses — PURS (Server Components).
 * Aucune donnée personnelle : uniquement des agrégats déjà calculés.
 * Graphiques 100 % CSS (barres) : aucune dépendance graphique lourde.
 */

const numberFmt = new Intl.NumberFormat("fr-FR");

export function fmt(n: number): string {
  return numberFmt.format(n);
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-choco-700 sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-700/70">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-champagne-600"
        : tone === "danger"
          ? "text-red-700"
          : "text-choco-700";

  return (
    <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/50 p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/60">
        {label}
      </p>
      <p className={`mt-1 font-serif text-2xl font-semibold tabular-nums ${toneClass}`}>
        {typeof value === "number" ? fmt(value) : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-700/55">{hint}</p> : null}
    </div>
  );
}

/** Liste de barres horizontales pour une répartition (pays, ville, âge…). */
export function BarList({
  items,
  emptyLabel = "Donnée non disponible",
}: {
  items: Distribution;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-champagne-500/30 bg-cream-100/40 px-4 py-6 text-center text-sm text-ink-700/55">
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-ink-700/80" title={item.label}>
            {item.label}
          </span>
          <span className="relative h-6 flex-1 overflow-hidden rounded-full bg-champagne-400/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-champagne-400 to-champagne-600"
              style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-choco-700">
            {fmt(item.count)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Entonnoir de conversion : chaque étape avec son % de l'inscription. */
export function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const base = steps[0]?.count ?? 0;
  if (base === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-champagne-500/30 bg-cream-100/40 px-4 py-6 text-center text-sm text-ink-700/55">
        Aucune inscription sur la période sélectionnée.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {steps.map((step, index) => {
        const pct = base > 0 ? (step.count / base) * 100 : 0;
        const prev = index > 0 ? steps[index - 1].count : step.count;
        const dropLabel =
          index > 0 && prev > 0
            ? `${Math.round((step.count / prev) * 100)} % de l’étape précédente`
            : "Base 100 %";
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm text-ink-700/80">
              {step.label}
            </span>
            <span className="relative h-7 flex-1 overflow-hidden rounded-lg bg-champagne-400/10">
              <span
                className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-choco-500 to-choco-700"
                style={{ width: `${Math.max(pct, 3)}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-cream-50 mix-blend-luminosity">
                {Math.round(pct)} %
              </span>
            </span>
            <span
              className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-choco-700"
              title={dropLabel}
            >
              {fmt(step.count)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Mini histogramme vertical de tendance (inscriptions par jour/semaine). */
export function TrendBars({
  points,
  granularity,
}: {
  points: TrendPoint[];
  granularity: "day" | "week";
}) {
  if (points.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-champagne-500/30 bg-cream-100/40 px-4 py-6 text-center text-sm text-ink-700/55">
        Aucune inscription sur la période sélectionnée.
      </p>
    );
  }
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-1 overflow-x-auto">
        {points.map((p) => (
          <div
            key={p.iso}
            className="flex min-w-[10px] flex-1 flex-col items-center justify-end gap-1"
            title={`${p.iso} — ${p.count} inscription(s)`}
          >
            <span className="text-[10px] font-semibold tabular-nums text-choco-700">
              {p.count > 0 ? p.count : ""}
            </span>
            <span
              className="w-full rounded-t bg-gradient-to-t from-champagne-500 to-champagne-300"
              style={{ height: `${Math.max((p.count / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-700/55">
        {granularity === "day" ? "Par jour" : "Par semaine"} — {points.length}{" "}
        intervalle(s) affiché(s).
      </p>
    </div>
  );
}
