import { MemberHeader } from "@/components/member/member-header";
import { isAdminUserId } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

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
  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const [{ data: profile }, { data: primaryPhoto }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("first_name")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("photos")
          .select("storage_path")
          .eq("profile_id", user.id)
          .eq("is_primary", true)
          .limit(1)
          .maybeSingle(),
      ]);

    displayName = profile?.first_name ?? null;

    if (primaryPhoto?.storage_path) {
      const { data: signedPhoto } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(primaryPhoto.storage_path, 10 * 60);

      avatarUrl = signedPhoto?.signedUrl ?? null;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <MemberHeader
        isAdmin={isAdmin}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
