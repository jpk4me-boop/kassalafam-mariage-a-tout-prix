import { ImageResponse } from "next/og";

/**
 * Visuel social de marque KASSALAFAM (Open Graph / Twitter) — 1200×630.
 *
 * Un seul rendu partagé par `opengraph-image.tsx` et `twitter-image.tsx` pour
 * garantir des aperçus identiques sur tous les réseaux. Palette reprise de la
 * charte (`globals.css`) : crème, chocolat, or champagne.
 *
 * Contraintes respectées :
 *  - aucun appel réseau (police par défaut embarquée par `next/og`) ;
 *  - aucun QR code, aucune photo de membre, aucune donnée utilisateur ;
 *  - lisibilité forte même en miniature (WhatsApp / Facebook).
 */

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };
export const SOCIAL_IMAGE_CONTENT_TYPE = "image/png";
export const SOCIAL_IMAGE_ALT =
  "KASSALAFAM — Rencontres sérieuses en vue du mariage";

// Palette charte (voir globals.css — valeurs volontairement dupliquées ici :
// l'image est rendue hors CSS Tailwind, sans accès aux variables du thème).
const CREAM_50 = "#fdf8ef";
const CREAM_100 = "#f8efdf";
const CHOCO_600 = "#6b3f2a";
const CHOCO_700 = "#573322";
const CHOCO_800 = "#45291b";
const CHAMPAGNE_400 = "#e1bf7b";
const CHAMPAGNE_500 = "#d6a85a";
const CHAMPAGNE_600 = "#bd8c41";
const INK_700 = "#3d2a1e";

const PILLARS = ["Rencontres sérieuses", "Profils vérifiés", "Un vrai projet de foyer"];

export function createSocialImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CREAM_50,
          backgroundImage: `radial-gradient(circle at 18% 22%, ${CREAM_100} 0%, ${CREAM_50} 55%), radial-gradient(circle at 85% 80%, rgba(214, 168, 90, 0.22) 0%, rgba(214, 168, 90, 0) 45%)`,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Liseré premium haut et bas */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 14,
            display: "flex",
            backgroundImage: `linear-gradient(90deg, ${CHAMPAGNE_600}, ${CHAMPAGNE_400}, ${CHAMPAGNE_600})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 14,
            display: "flex",
            backgroundImage: `linear-gradient(90deg, ${CHAMPAGNE_600}, ${CHAMPAGNE_400}, ${CHAMPAGNE_600})`,
          }}
        />

        {/* Élément abstrait : deux anneaux entrelacés (union), discrets */}
        <div
          style={{
            position: "absolute",
            top: 92,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 999,
              border: `6px solid ${CHAMPAGNE_500}`,
              display: "flex",
            }}
          />
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 999,
              border: `6px solid ${CHOCO_600}`,
              marginLeft: -26,
              display: "flex",
            }}
          />
        </div>

        {/* Marque */}
        <div
          style={{
            marginTop: 96,
            fontSize: 118,
            color: CHOCO_700,
            letterSpacing: 6,
            display: "flex",
          }}
        >
          KASSALAFAM
        </div>

        {/* Sous-titre */}
        <div
          style={{
            marginTop: 6,
            fontSize: 44,
            color: CHAMPAGNE_600,
            letterSpacing: 14,
            display: "flex",
          }}
        >
          MARIAGE À TOUT PRIX
        </div>

        {/* Séparateur */}
        <div
          style={{
            marginTop: 40,
            width: 620,
            height: 3,
            display: "flex",
            backgroundImage: `linear-gradient(90deg, rgba(189,140,65,0), ${CHAMPAGNE_500}, rgba(189,140,65,0))`,
          }}
        />

        {/* Piliers */}
        <div
          style={{
            marginTop: 42,
            display: "flex",
            alignItems: "center",
            gap: 26,
          }}
        >
          {PILLARS.map((pillar, index) => (
            <div
              key={pillar}
              style={{ display: "flex", alignItems: "center", gap: 26 }}
            >
              {index > 0 ? (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: CHAMPAGNE_500,
                    display: "flex",
                  }}
                />
              ) : null}
              <div
                style={{
                  fontSize: 34,
                  color: INK_700,
                  display: "flex",
                }}
              >
                {pillar}
              </div>
            </div>
          ))}
        </div>

        {/* Domaine — repère de marque, jamais une URL technique */}
        <div
          style={{
            marginTop: 54,
            fontSize: 30,
            color: CHOCO_800,
            letterSpacing: 3,
            display: "flex",
          }}
        >
          kassalafam.com
        </div>
      </div>
    ),
    { ...SOCIAL_IMAGE_SIZE },
  );
}
