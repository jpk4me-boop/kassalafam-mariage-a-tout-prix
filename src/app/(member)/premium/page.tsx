import { Crown } from "lucide-react";

import { MemberFeaturePlaceholder } from "@/components/member/member-feature-placeholder";

export default function PremiumPage() {
  return (
    <MemberFeaturePlaceholder
      icon={Crown}
      eyebrow="KASSALAFAM Premium"
      title="Préparation de votre espace Premium"
      description="Cette page accueillera les avantages Premium, le choix de la durée, MTN Mobile Money, Orange Money et le suivi sécurisé du paiement."
      note="Les paiements restent désactivés. Aucune collecte SebPay ne peut être lancée depuis cette page."
    />
  );
}
