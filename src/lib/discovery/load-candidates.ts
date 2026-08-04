import "server-only";

import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import { createClient } from "@/lib/supabase/server";
import type {
  DiscoverCandidate,
  DiscoverCandidateWithPhoto,
  DiscoveryUniverse,
} from "@/lib/types/database";

export type DiscoveryRelationshipState =
  | "sent"
  | "matched";

type DiscoveryGuardStatus =
  | "unauthenticated"
  | "needs_verification"
  | "needs_gender"
  | "needs_universe"
  | "unavailable";

type DiscoveryGuardResult = {
  [Status in DiscoveryGuardStatus]: Readonly<{
    status: Status;
  }>;
}[DiscoveryGuardStatus];

export type DiscoveryLoadResult =
  | Readonly<{
      status: "ready";
      universe: DiscoveryUniverse;
      candidates: DiscoverCandidateWithPhoto[];
      initialStates: Record<
        string,
        DiscoveryRelationshipState
      >;
      favoriteIds: string[];
    }>
  | DiscoveryGuardResult;

type LoadDiscoveryCandidatesOptions = Readonly<{
  universe?: DiscoveryUniverse | null;
  limit?: number;
  includeRelationshipStates?: boolean;
  includeFavoriteStates?: boolean;
}>;

function normalizeLimit(
  limit: number | undefined,
): number | null {
  if (limit == null) return null;
  if (!Number.isFinite(limit)) return 0;

  return Math.max(0, Math.floor(limit));
}

export async function loadDiscoveryCandidates({
  universe,
  limit,
  includeRelationshipStates = false,
  includeFavoriteStates = false,
}: LoadDiscoveryCandidatesOptions = {}): Promise<DiscoveryLoadResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "unauthenticated",
    };
  }

  const { data: viewer, error: viewerError } =
    await supabase
      .from("profiles")
      .select(
        "gender, verification_status, discovery_universe",
      )
      .eq("id", user.id)
      .maybeSingle();

  if (viewerError) {
    console.error(
      "[discovery-loader] lecture viewer échouée:",
      viewerError.message,
    );

    return {
      status: "unavailable",
    };
  }

  if (
    !viewer ||
    viewer.verification_status !== "approved"
  ) {
    return {
      status: "needs_verification",
    };
  }

  if (!viewer.gender) {
    return {
      status: "needs_gender",
    };
  }

  const selectedUniverse =
    universe ?? viewer.discovery_universe;

  if (!selectedUniverse) {
    return {
      status: "needs_universe",
    };
  }

  try {
    const { data, error } = await supabase.rpc(
      "discover_candidates",
      {
        p_universe: selectedUniverse,
      },
    );

    if (error) throw error;

    const allCandidates =
      (data ?? []) as DiscoverCandidate[];

    const normalizedLimit = normalizeLimit(limit);

    const selectedCandidates =
      normalizedLimit == null
        ? allCandidates
        : allCandidates.slice(0, normalizedLimit);

    const candidates = await attachSignedPhotos(
      selectedCandidates,
    );

    const initialStates: Record<
      string,
      DiscoveryRelationshipState
    > = {};

    if (
      includeRelationshipStates &&
      candidates.length > 0
    ) {
      const ids = candidates.map(
        (candidate) => candidate.id,
      );

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

      const {
        data: relationships,
        error: relationshipError,
      } = await supabase
        .from("matches")
        .select("user_a, user_b, status")
        .or(relationshipFilter);

      if (relationshipError) {
        console.error(
          "[discovery-loader] lecture intérêts échouée:",
          relationshipError.message,
        );
      }
      else {
        for (
          const relationship of relationships ?? []
        ) {
          const otherId =
            relationship.user_a === user.id
              ? relationship.user_b
              : relationship.user_a;

          if (relationship.status === "accepted") {
            initialStates[otherId] = "matched";
          }
          else if (
            relationship.status === "pending" &&
            relationship.user_a === user.id
          ) {
            initialStates[otherId] = "sent";
          }
        }
      }
    }

    const favoriteIds: string[] = [];

    if (includeFavoriteStates && candidates.length > 0) {
      // Lecture RLS : le membre ne voit que ses propres favoris.
      const { data: favorites, error: favoritesError } =
        await supabase
          .from("member_favorites")
          .select("target_profile_id")
          .eq("user_id", user.id)
          .in(
            "target_profile_id",
            candidates.map((candidate) => candidate.id),
          );

      if (favoritesError) {
        console.error(
          "[discovery-loader] lecture favoris échouée:",
          favoritesError.message,
        );
      }
      else {
        for (const favorite of favorites ?? []) {
          favoriteIds.push(favorite.target_profile_id);
        }
      }
    }

    return {
      status: "ready",
      universe: selectedUniverse,
      candidates,
      initialStates,
      favoriteIds,
    };
  }
  catch (error) {
    console.error(
      "[discovery-loader] échec découverte:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return {
      status: "unavailable",
    };
  }
}
