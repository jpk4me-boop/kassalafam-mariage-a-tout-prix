import type { DiscoveryUniverse } from "@/lib/types/database";

/**
 * L3D-B PR2 — Correspondance segment d'URL ↔ valeur canonique d'univers.
 *
 * Les pages /discover/<slug> exposent des segments lisibles ; la base et la RPC
 * `discover_candidates` raisonnent sur les valeurs canoniques. Ce module est
 * l'unique source de vérité du mapping pour éviter toute confusion route↔enum.
 */

export type UniverseSlug = "chretien" | "islamique" | "pour-tous";

export const UNIVERSE_BY_SLUG: Record<UniverseSlug, DiscoveryUniverse> = {
  chretien: "christian_marriage",
  islamique: "islamic_marriage",
  "pour-tous": "open_marriage",
};

/** Libellé court d'univers (badge de carte, etc.). */
export const UNIVERSE_LABEL: Record<DiscoveryUniverse, string> = {
  christian_marriage: "Mariage chrétien",
  islamic_marriage: "Mariage islamique",
  open_marriage: "Mariage pour tous",
};
