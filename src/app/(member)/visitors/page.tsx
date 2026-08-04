import { Eye } from "lucide-react";

import { VisitorsView } from "@/components/member/visitors-view";
import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import { createClient } from "@/lib/supabase/server";
import type {
  ProfileVisitor,
  ProfileVisitorWithPhoto,
} from "@/lib/types/database";

/**
 * Visiteurs (Lot 3) — rendu serveur.
 *
 * Lecture via la RPC sécurisée `list_profile_visitors` (visiteurs en mode
 * discret exclus, visibilité revalidée, règle pseudo appliquée), puis
 * signature serveur des photos. Les états d'intérêt initiaux reprennent la
 * même lecture RLS de `matches` que la découverte et les favoris.
 */
export default async function VisitorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let visitors: ProfileVisitorWithPhoto[] = [];
  const initialStates: Record<string, "sent" | "matched"> = {};
  let loadFailed = false;

  if (user) {
    const { data, error } = await supabase.rpc("list_profile_visitors");

    if (error) {
      console.error("[visiteurs] lecture échouée:", error.message);
      loadFailed = true;
    } else {
      const rows = (data ?? []) as ProfileVisitor[];
      visitors = await attachSignedPhotos(rows);

      if (visitors.length > 0) {
        const ids = visitors.map((v) => v.id);
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
            "[visiteurs] lecture intérêts échouée:",
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
            <Eye size={22} />
          </span>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-300">
            Activité du profil
          </p>

          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            Visiteurs
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-cream-100/80">
            Les membres qui ont consulté le détail de votre profil, dans le
            respect de leurs paramètres de confidentialité.
          </p>
        </div>
      </section>

      {loadFailed ? (
        <p className="rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-800">
          Vos visiteurs sont momentanément indisponibles. Réessayez dans un
          instant.
        </p>
      ) : (
        <VisitorsView
          visitors={visitors}
          initialStates={initialStates}
        />
      )}
    </div>
  );
}
