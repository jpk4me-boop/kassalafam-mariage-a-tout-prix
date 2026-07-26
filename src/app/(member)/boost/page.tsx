import { Rocket } from "lucide-react";

import { MemberFeaturePlaceholder } from "@/components/member/member-feature-placeholder";

export default function BoostPage() {
  return (
    <MemberFeaturePlaceholder
      icon={Rocket}
      eyebrow="Visibilité"
      title="Boost"
      description="Le Boost permettra de mettre temporairement votre profil en avant auprès de membres compatibles."
      note="Aucun boost n’est encore consommé ou facturé. Le système de crédits et d’expiration sera livré séparément."
    />
  );
}
