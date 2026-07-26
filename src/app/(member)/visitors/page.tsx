import { Eye } from "lucide-react";

import { MemberFeaturePlaceholder } from "@/components/member/member-feature-placeholder";

export default function VisitorsPage() {
  return (
    <MemberFeaturePlaceholder
      icon={Eye}
      eyebrow="Activité du profil"
      title="Visiteurs"
      description="Vous retrouverez ici les membres qui ont consulté votre profil, dans le respect de leurs paramètres de confidentialité."
      note="Le backend sécurisé des visites sera livré dans un lot dédié. Aucun visiteur fictif n’est affiché."
    />
  );
}
