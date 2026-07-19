"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { clearContinueLaterCookie } from "@/lib/onboarding/continue-later";
import { createClient } from "@/lib/supabase/client";

export function SuspendedAccountSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    clearContinueLaterCookie();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-champagne-500/35 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 disabled:opacity-60"
    >
      <LogOut size={17} />
      {signingOut ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
