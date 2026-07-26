import type { Gender, Religion } from "@/lib/types/database";

export type PremiumHeroCopy = {
  headline: string;
  opportunity: string;
  reassurance: string;
};

export function getPremiumHeroCopy(input: {
  firstName?: string | null;
  gender?: Gender | null;
  religion?: Religion | null;
}): PremiumHeroCopy {
  const name = input.firstName?.trim() || null;
  const gender = input.gender ?? null;
  const religion = input.religion ?? null;

  const headline = buildHeadline(name, gender);
  const opportunity = buildOpportunity(religion);
  const reassurance = buildReassurance(religion);

  return { headline, opportunity, reassurance };
}

function buildHeadline(name: string | null, gender: Gender | null): string {
  const partner =
    gender === "homme"
      ? "ta future femme"
      : gender === "femme"
        ? "ton futur époux"
        : "la personne qui te correspond";

  const subject = `${partner} t'attend.`;

  if (name) {
    return `${name}, ${subject}`;
  }

  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

function buildOpportunity(religion: Religion | null): string {
  if (religion === "christianisme" || religion === "islam") {
    return "Ne rate pas cette occasion divine.";
  }

  if (religion === "sans_religion") {
    return "Ne rate pas cette occasion unique.";
  }

  return "Ne rate pas cette belle occasion.";
}

function buildReassurance(religion: Religion | null): string {
  if (religion === "christianisme") {
    return "Dieu est au contrôle.";
  }

  if (religion === "islam") {
    return "Allah est au contrôle.";
  }

  if (religion === "sans_religion") {
    return "Tes ancêtres veillent sur toi.";
  }

  return "Ton avenir est entre tes mains.";
}
