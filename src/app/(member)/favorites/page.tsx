import { Heart } from "lucide-react";

import { FavoritedByView } from "@/components/member/favorited-by-view";
import { FavoritesView } from "@/components/member/favorites-view";
import { PremiumLockedSignal } from "@/components/member/premium-locked-signal";
import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import { createClient } from "@/lib/supabase/server";
import type {
  FavoriteCandidate,
  FavoriteCandidateWithPhoto,
  FavoritedByCandidate,
  FavoritedByCandidateWithPhoto,
} from "@/lib/types/database";

/**
 * Favoris (Lot 2, favoris entrants Lot B) — rendu serveur.
 *
 * DEUX sens, deux règles :
 *   · SORTANT — `list_favorites` : les profils que le membre a lui-même
 *     enregistrés. C'est SA liste, elle reste GRATUITE. On ne reprend jamais
 *     au membre le contenu qu'il a créé.
 *   · ENTRANT — `list_favorited_by` : les membres qui l'ont ajouté. C'est
 *     l'avantage Premium « Vois qui t'ajoute en favori ». Fermée sans
 *     abonnement actif ; le compteur libre `count_favorited_by` porte alors
 *     l'état verrouillé, avec le nombre RÉEL.
 *
 * Les favoris discrets sont exclus des deux côtés entrants (liste ET compteur).
 * Signature des photos par attachSignedPhotos (service_role, serveur seul).
 */
export default async function FavoritesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let favorites: FavoriteCandidateWithPhoto[] = [];
  let admirers: FavoritedByCandidateWithPhoto[] = [];
  const initialStates: Record<string, "sent" | "matched"> = {};
  let loadFailed = false;
  let admirerCount = 0;
  let admirersFailed = false;

  if (user) {
    const { data, error } = await supabase.rpc("list_favorites");

    if (error) {
      console.error("[favorites] lecture échouée:", error.message);
      loadFailed = true;
    } else {
      const rows = (data ?? []) as FavoriteCandidate[];
      favorites = await attachSignedPhotos(rows);
    }

    // Sens ENTRANT — indépendant du sortant : un échec ici ne doit pas priver
    // le membre de sa propre liste.
    const { data: admirerData, error: admirerError } =
      await supabase.rpc("list_favorited_by");

    if (admirerError) {
      console.error("[favoris entrants] lecture échouée:", admirerError.message);
      admirersFailed = true;
    } else {
      const rows = (admirerData ?? []) as FavoritedByCandidate[];
      admirers = await attachSignedPhotos(rows);
    }

    const { data: countData, error: countError } = await supabase.rpc(
      "count_favorited_by",
    );

    if (countError) {
      // Non bloquant : sans compteur, on retombe sur l'état vide habituel.
      console.error("[favoris entrants] compteur échoué:", countError.message);
    } else {
      admirerCount = Number(countData ?? 0);
    }

    // Un seul aller-retour sur `matches` pour les deux listes.
    const ids = Array.from(
      new Set([
        ...favorites.map((f) => f.id),
        ...admirers.map((a) => a.id),
      ]),
    );

    if (ids.length > 0) {
      const list = ids.join(",");

      const relationshipFilter =
        "and(user_a.eq." +
        user.id +
        ",user_b.in.(" +
        list +
        ")),and(user_b.eq." +
        user.id +
        ",user_a.in.(" +
        list +
        "))";

      const { data: relationships, error: relationshipError } = await supabase
        .from("matches")
        .select("user_a, user_b, status")
        .or(relationshipFilter);

      if (relationshipError) {
        console.error(
          "[favorites] lecture intérêts échouée:",
          relationshipError.message,
        );
      } else {
        for (const relationship of relationships ?? []) {
          const otherId =
            relationship.user_a === user.id
              ? relationship.user_b
              : relationship.user_a;

          if (relationship.status === "accepted") {
            initialStates[otherId] = "matched";
          } else if (
            relationship.status === "pending" &&
            relationship.user_a === user.id
          ) {
            initialStates[otherId] = "sent";
          }
        }
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-4 sm:py-8">
      <section className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/80 shadow-card">
        <div className="bg-gradient-to-br from-choco-700 via-choco-800 to-choco-900 px-6 py-8 text-cream-50 sm:px-10 sm:py-10">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-300 ring-1 ring-inset ring-champagne-300/25">
            <Heart size={22} />
          </span>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-300">
            Profils enregistrés
          </p>

          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            Favoris
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-cream-100/80">
            Retrouvez ici les profils que vous avez choisi de conserver. Seuls
            les profils encore actifs et vérifiés restent visibles.
          </p>
        </div>
      </section>

      {loadFailed ? (
        <p className="rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-800">
          Vos favoris sont momentanément indisponibles. Réessayez dans un
          instant.
        </p>
      ) : (
        <FavoritesView
          favorites={favorites}
          initialStates={initialStates}
        />
      )}

      {/* Sens ENTRANT — avantage Premium. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-2xl font-semibold text-choco-700">
            Ils vous ont ajouté
          </h2>
          <p className="text-sm leading-6 text-ink-700/70">
            Les membres qui vous ont enregistré dans leurs favoris. Ceux qui ont
            activé les favoris discrets n’apparaissent pas ici.
          </p>
        </div>

        {admirersFailed ? (
          <p className="rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-800">
            Cette liste est momentanément indisponible. Réessayez dans un
            instant.
          </p>
        ) : admirers.length === 0 && admirerCount > 0 ? (
          <PremiumLockedSignal
            count={admirerCount}
            title="vous ont ajouté en favori"
            description="Savoir qui vous a enregistré est réservé aux membres Premium. Le nombre affiché est réel : ces personnes existent. Les membres en favoris discrets n’y figurent pas."
            ctaLabel="Voir qui m’a ajouté"
          />
        ) : (
          <FavoritedByView
            admirers={admirers}
            initialStates={initialStates}
          />
        )}
      </section>
    </div>
  );
}
