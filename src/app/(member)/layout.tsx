import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";
import { isAdminUserId } from "@/lib/auth/admin";

// La visibilité du lien « Administration » est décidée CÔTÉ SERVEUR : seul le
// booléen résultant est transmis au header client. Aucun UUID admin n'est jamais
// exposé au navigateur.
export const dynamic = "force-dynamic";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminUserId(user?.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <MemberHeader isAdmin={isAdmin} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
