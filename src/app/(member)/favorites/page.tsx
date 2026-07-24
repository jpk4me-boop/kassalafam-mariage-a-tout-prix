import { Heart } from "lucide-react";

import { MemberFeaturePlaceholder } from "@/components/member/member-feature-placeholder";

export default function FavoritesPage() {
  return (
    <MemberFeaturePlaceholder
      icon={Heart}
      eyebrow="Profils enregistrés"
      title="Favoris"
      description="Vous pourrez conserver ici les profils que vous souhaitez relire ou retrouver facilement."
      note="L’ajout aux favoris sera idempotent et protégé par les règles RLS avant son activation."
    />
  );
}
