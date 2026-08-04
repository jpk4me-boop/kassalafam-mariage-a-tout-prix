import { Heart } from "lucide-react";

import { FavoritesView } from "@/components/member/favorites-view";
import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import { createClient } from "@/lib/supabase/server";
import type {
  FavoriteCandidate,
  FavoriteCandidateWithPhoto,
} from "@/lib/types/database";

/**
 * Favoris (Lot 2) — rendu serveur.
 *
 * Lecture via la RPC sécurisée `list_favorites` (champs sûrs uniquement,
 * cibles revalidées à chaque lecture) puis signature serveur des photos
 * (attachSignedPhotos, service_role côté serveur exclusivement).
 * Les états d'intérêt initiaux (`sent`/`matched`) reprennent la même lecture
 * RLS de `matches` que le flux de découverte — jamais un intérêt entrant en
 * attente.
 */
export default async function FavoritesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let favorites: FavoriteCandidateWithPhoto[] = [];
  const initialStates: Record<string, "sent" | "matched"> = {};
  let loadFailed = false;

  if (user) {
    const { data, error } = await supabase.rpc("list_favorites");

    if (error) {
      console.error("[favorites] lecture échouée:", error.message);
      loadFailed = true;
    } else {
      const rows = (data ?? []) as FavoriteCandidate[];
      favorites = await attachSignedPhotos(rows);

      if (favorites.length > 0) {
        const ids = favorites.map((f) => f.id);
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

        const { data: relationships, error: relationshipError } =
          await supabase
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
    </div>
  );
}
