import type { Metadata } from "next";

/**
 * Page hors-ligne de marque, pré-cachée par le service worker (public/sw.js)
 * et servie en repli quand une navigation échoue faute de réseau.
 *
 * Contraintes :
 *  - page STATIQUE (aucune API dynamique) pour être pré-cachable ;
 *  - styles critiques INLINE : hors-ligne, les feuilles de style
 *    /_next/static ne sont pas garanties en cache — la page doit rester
 *    belle et lisible même sans CSS externe ;
 *  - aucun JavaScript requis : le bouton « Réessayer » est un simple lien.
 */

export const metadata: Metadata = {
  title: "Hors ligne | KASSALAFAM",
  robots: { index: false, follow: false },
};

const palette = {
  cream: "#fdf8ef",
  creamDeep: "#f0e3cc",
  choco: "#6b3f2a",
  chocoDeep: "#45291b",
  ink: "#2b1a12",
  champagne: "#d6a85a",
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        background: `radial-gradient(ellipse at top, ${palette.creamDeep} 0%, ${palette.cream} 55%)`,
        color: palette.ink,
        fontFamily:
          "var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "26rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- icône précachée, next/image inutile hors-ligne */}
        <img
          src="/icon-192.png"
          alt="KASSALAFAM"
          width={88}
          height={88}
          style={{
            borderRadius: "22px",
            margin: "0 auto 1.5rem",
            display: "block",
            boxShadow: "0 24px 60px -30px rgba(69, 41, 27, 0.5)",
          }}
        />
        <p
          style={{
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: palette.champagne,
            margin: "0 0 0.75rem",
          }}
        >
          Kassalafam
        </p>
        <h1
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: "1.9rem",
            lineHeight: 1.25,
            color: palette.chocoDeep,
            margin: "0 0 1rem",
          }}
        >
          Vous êtes hors ligne
        </h1>
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.65,
            color: palette.choco,
            margin: "0 0 2rem",
          }}
        >
          Votre connexion Internet semble interrompue. Vos conversations et
          votre profil vous attendent — reconnectez-vous, puis réessayez.
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète volontaire : hors-ligne, le routeur client de <Link /> échouerait ; un <a> plein déclenche une navigation interceptée par le SW */}
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "0.85rem 2.2rem",
            borderRadius: "999px",
            background: palette.choco,
            color: palette.cream,
            fontWeight: 600,
            fontSize: "0.95rem",
            textDecoration: "none",
            boxShadow: "0 0 80px -20px rgba(214, 168, 90, 0.45)",
          }}
        >
          Réessayer
        </a>
      </div>
    </main>
  );
}
