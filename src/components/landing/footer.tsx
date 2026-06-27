import { Logo } from "./logo";

const FOOTER_COLUMNS = [
  {
    title: "Plateforme",
    links: [
      { label: "Le concept", href: "#concept" },
      { label: "Comment ça marche", href: "#comment" },
      { label: "Fonctionnalités", href: "#fonctionnalites" },
      { label: "Tarifs", href: "#tarifs" },
    ],
  },
  {
    title: "Confiance",
    links: [
      { label: "Profils vérifiés", href: "#concept" },
      { label: "Confidentialité", href: "#concept" },
      { label: "Modération", href: "#concept" },
      { label: "Signaler un profil", href: "#" },
    ],
  },
  {
    title: "Aide",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Nous contacter", href: "#" },
      { label: "Conseils de sécurité", href: "#" },
      { label: "Centre d'aide", href: "#" },
    ],
  },
  {
    title: "Légal",
    links: [
      { label: "Conditions d'utilisation", href: "#" },
      { label: "Politique de confidentialité", href: "#" },
      { label: "Mentions légales", href: "#" },
      { label: "Cookies", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-auto bg-ink-900 text-cream-100">
      <div className="gold-hairline h-px w-full" />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo variant="light" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-cream-200/65">
              La plateforme de mariage vérifiée, confidentielle et orientée
              foyer pour les Africains. Des rencontres sincères, dans un cadre
              respectueux.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne-400">
                  {col.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-cream-200/70 transition-colors hover:text-champagne-300"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-cream-200/10 pt-8 sm:flex-row">
          <p className="text-xs text-cream-200/55">
            © {new Date().getFullYear()} KASSALAFAM — Mariage à Tout Prix. Tous
            droits réservés.
          </p>
          <p className="text-xs text-cream-200/55">
            Conçu avec soin pour des rencontres sérieuses.
          </p>
        </div>
      </div>
    </footer>
  );
}
