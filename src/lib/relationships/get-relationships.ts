import { createClient } from "@/lib/supabase/server";
import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import type {
  DiscoverCandidate,
  RelationshipItem,
  RelationshipItemWithPhoto,
} from "@/lib/types/database";

/**
 * L3D-C — Chargement SERVEUR des relations du membre connecté.
 *
 * SERVER-ONLY (utilise indirectement `service_role` via `attachSignedPhotos`
 * pour signer les photos). Ne jamais importer depuis un composant "use client".
 *
 * Confidentialité :
 *   - lecture via la RPC `list_my_relationships` (SECURITY DEFINER, projection
 *     sûre : jamais birth_date, storage_path, verification_x, email, bio) ;
 *   - signature des photos avec exactement la même règle que la découverte
 *     (`attachSignedPhotos` : URL signée seulement si photo présente ET non
 *     floutée), sans jamais exposer `storage_path` ;
 *   - aucune écriture. Les paires rejetées ne sont pas renvoyées par la RPC.
 */

export type MyRelationships = {
  received: RelationshipItemWithPhoto[];
  sent: RelationshipItemWithPhoto[];
  matched: RelationshipItemWithPhoto[];
};

/**
 * Renvoie les relations du membre courant, réparties en reçus / envoyés /
 * matches, photos signées. Renvoie `null` en cas d'échec (la page affichera
 * un état d'erreur sobre) — jamais d'exception propagée à la page.
 */
export async function getMyRelationships(): Promise<MyRelationships | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_my_relationships");
  if (error) {
    console.error("[relationships] lecture échouée:", error.message);
    return null;
  }

  const items = (data ?? []) as RelationshipItem[];

  // Signature des photos : on réutilise le chemin validé de la découverte, en
  // projetant chaque relation vers la forme minimale attendue (l'autre membre).
  const forSigning: DiscoverCandidate[] = items.map((r) => ({
    id: r.other_id,
    first_name: r.first_name,
    age: r.age,
    city: r.city,
    country: r.country,
    marital_status: r.marital_status,
    intention: r.intention,
    discovery_universe: null,
    has_photo: r.has_photo,
    is_blurred: r.is_blurred,
  }));

  let urlById = new Map<string, string | null>();
  try {
    const signed = await attachSignedPhotos(forSigning);
    urlById = new Map(signed.map((s) => [s.id, s.signedUrl]));
  } catch (e) {
    // Échec de signature : on dégrade proprement (placeholders) sans casser.
    console.error(
      "[relationships] signature photos échouée:",
      e instanceof Error ? e.message : String(e),
    );
  }

  const withPhoto: RelationshipItemWithPhoto[] = items.map((r) => ({
    ...r,
    signedUrl: urlById.get(r.other_id) ?? null,
  }));

  return {
    received: withPhoto.filter((r) => r.kind === "received"),
    sent: withPhoto.filter((r) => r.kind === "sent"),
    matched: withPhoto.filter((r) => r.kind === "matched"),
  };
}
