import { NextResponse } from "next/server";

import { loadDiscoveryCandidates } from "@/lib/discovery/load-candidates";

export const dynamic = "force-dynamic";

const DASHBOARD_SELECTION_LIMIT = 4;

function privateJson(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET() {
  const result = await loadDiscoveryCandidates({
    limit: DASHBOARD_SELECTION_LIMIT,
  });

  if (result.status === "unauthenticated") {
    return privateJson(
      {
        status: "unauthenticated",
      },
      401,
    );
  }

  if (result.status === "needs_verification") {
    return privateJson({
      status: "needs_verification",
    });
  }

  if (result.status === "needs_gender") {
    return privateJson({
      status: "needs_profile",
    });
  }

  if (result.status === "needs_universe") {
    return privateJson({
      status: "needs_universe",
    });
  }

  if (result.status === "unavailable") {
    return privateJson({
      status: "unavailable",
    });
  }

  return privateJson({
    status: "ready",
    universe: result.universe,
    candidates: result.candidates,
  });
}
