export function candidateUniverseLabel(value: string): string {
  switch (value) {
    case "christian_marriage":
      return "Mariage chrétien";
    case "islamic_marriage":
      return "Mariage islamique";
    case "open_marriage":
      return "Ouvert à tous";
    default:
      return "Projet matrimonial";
  }
}

export function candidateMaritalStatusLabel(value: string): string {
  switch (value) {
    case "celibataire":
      return "Célibataire";
    case "divorce":
      return "Divorcé(e)";
    case "veuf":
      return "Veuf / veuve";
    case "separe":
      return "Séparé(e)";
    default:
      return "Situation précisée";
  }
}

export function candidateIntentionLabel(value: string): string {
  if (value === "mariage_serieux") return "Mariage sérieux";
  return "Projet de mariage sérieux";
}
