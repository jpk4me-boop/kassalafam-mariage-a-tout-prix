import { DiscoveryStateCard } from "@/components/member/discovery-state-card";
import { ExplorerDeck } from "@/components/member/explorer-deck";
import { loadDiscoveryCandidates } from "@/lib/discovery/load-candidates";
import { createClient } from "@/lib/supabase/server";

/**
 * Explorer (Lot F) — chargement serveur.
 *
 * Aucun paramètre d'univers : l'Explorer suit la préférence enregistrée du
 * membre (`profiles.discovery_universe`), que le chargeur applique déjà quand
 * on ne lui impose rien. Un membre qui n'a pas encore choisi son univers est
 * renvoyé vers le hub — même garde que le flux en grille, même message.
 */
export async function ExplorerFeed() {
  const result = await loadDiscoveryCandidates({
    includeRelationshipStates: true,
    includeFavoriteStates: true,
  });

  if (
    result.status === "unauthenticated" ||
    result.status === "needs_verification"
  ) {
    return (
      <DiscoveryStateCard
        title="Votre profil doit être vérifié avant la découverte."
        text="Notre équipe vérifie chaque profil pour garantir des rencontres sérieuses et sûres. Vous serez prévenu(e) dès validation."
        cta={{ href: "/profile", label: "Voir mon profil" }}
      />
    );
  }

  if (result.status === "needs_gender") {
    return (
      <DiscoveryStateCard
        title="Complétez votre profil pour découvrir des profils."
        text="Indiquez votre genre dans votre profil : il nous aide à proposer des personnes réellement compatibles."
        cta={{ href: "/profile", label: "Compléter mon profil" }}
      />
    );
  }

  if (result.status === "needs_universe") {
    return (
      <DiscoveryStateCard
        title="Choisissez votre univers matrimonial."
        text="L'Explorer parcourt les profils de votre univers. Choisissez-le une fois, vous pourrez en changer quand vous voudrez."
        cta={{ href: "/discover", label: "Choisir mon univers" }}
      />
    );
  }

  if (result.status === "unavailable") {
    return (
      <DiscoveryStateCard
        title="La découverte est momentanément indisponible."
        text="Réessayez dans un instant."
      />
    );
  }

  // Visite guidée (migration 65) : même témoin que le flux en grille. Un membre
  // ne voit la visite qu'UNE fois, sur le premier des deux écrans qu'il ouvre.
  // Toute lecture en échec vaut « déjà vue » : mieux vaut rater une visite que
  // la rejouer à quelqu'un qui l'a terminée.
  let tourCompleted = true;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("tour_completed_at")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[explorer] témoin de visite illisible:", error.message);
      } else {
        tourCompleted = Boolean(data?.tour_completed_at);
      }
    }
  } catch (e) {
    console.error("[explorer] témoin de visite illisible:", e);
  }

  return (
    <ExplorerDeck
      candidates={result.candidates}
      universe={result.universe}
      initialStates={result.initialStates}
      favoriteIds={result.favoriteIds}
      tourCompleted={tourCompleted}
    />
  );
}
