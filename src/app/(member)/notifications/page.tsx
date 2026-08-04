import { Bell } from "lucide-react";

import { NotificationsList } from "@/components/member/notifications-list";
import { createClient } from "@/lib/supabase/server";
import type { MemberNotificationRow } from "@/lib/types/database";

/**
 * Page Notifications — rendu serveur : les 50 dernières notifications du
 * membre sont chargées via le client serveur (RLS : auth.uid() = user_id).
 * Le marquage lu/non lu est délégué au composant client NotificationsList.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: MemberNotificationRow[] = [];

  if (user) {
    const { data } = await supabase
      .from("member_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    items = (data as MemberNotificationRow[] | null) ?? [];
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4 sm:py-8">
      <section className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/80 shadow-card">
        <div className="bg-gradient-to-br from-choco-700 via-choco-800 to-choco-900 px-6 py-8 text-cream-50 sm:px-10 sm:py-10">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-300 ring-1 ring-inset ring-champagne-300/25">
            <Bell size={22} />
          </span>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-300">
            Votre activité
          </p>

          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">
            Notifications
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-cream-100/80">
            Vos informations importantes : vérification, demandes, mises en
            relation et activité Premium.
          </p>
        </div>
      </section>

      <NotificationsList initialItems={items} />
    </div>
  );
}
