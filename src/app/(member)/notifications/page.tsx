import { Bell } from "lucide-react";

import { MemberFeaturePlaceholder } from "@/components/member/member-feature-placeholder";

export default function NotificationsPage() {
  return (
    <MemberFeaturePlaceholder
      icon={Bell}
      eyebrow="Votre activité"
      title="Notifications"
      description="Cette page regroupera vos informations importantes : vérification, demandes, mises en relation, messages et activité Premium."
      note="Le panneau de notifications actuel reste disponible sur le tableau de bord pendant la construction de cette vue."
    />
  );
}
