/**
 * Conteneur commun d'une étape du wizard : titre + description optionnelle, puis
 * le contenu de l'étape. Uniformise la typographie mobile-first de KASSALAFAM.
 */
export function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-choco-700 sm:text-[1.7rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-sm text-ink-700/70">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
