import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getMyRelationships } from "@/lib/relationships/get-relationships";
import { ConversationView } from "@/components/member/conversation-view";
import type { MessageRow } from "@/lib/types/database";

/**
 * Page conversation « /matches/[matchId] » (L3E-PR2) — Server Component.
 *
 * Mêmes garanties de confidentialité que /matches :
 *   - garde viewer (authentifié + approuvé) AVANT tout chargement ;
 *   - le match doit être une relation ACCEPTÉE de l'appelant : on s'appuie sur
 *     `getMyRelationships()` (RPC `list_my_relationships`) qui ne renvoie un
 *     `matched` que pour un match `accepted` dont le viewer est participant et
 *     dont l'autre membre est `approved`. Introuvable => redirection douce vers
 *     /matches (empêche l'accès à un match non accepté / non participant / deviné) ;
 *   - le fil est lu via la RPC sécurisée `get_conversation_messages` (garde
 *     `can_message`). Aucune écriture ici.
 *
 * Accès déjà protégé par le middleware (préfixe « /matches »).
 */

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware redirige déjà un anonyme ; garde défensive.
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/matches/${matchId}`)}`);
  }

  // Viewer approuvé uniquement (même règle que /matches).
  const { data: viewer } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!viewer || viewer.verification_status !== "approved") {
    redirect("/matches");
  }

  // Garde d'accès : ce match doit être une relation ACCEPTÉE de l'appelant.
  const relationships = await getMyRelationships();
  const other = relationships?.matched.find((m) => m.match_id === matchId);

  if (!other) {
    redirect("/matches");
  }

  // Chargement du fil via la RPC sécurisée (dégrade proprement si erreur).
  const { data: messages, error } = await supabase.rpc(
    "get_conversation_messages",
    { p_match: matchId },
  );

  if (error) {
    console.error("[conversation] get_conversation_messages échoué:", error.message);
  }

  const initialMessages = (error ? [] : (messages ?? [])) as MessageRow[];

  return (
    <ConversationView
      matchId={matchId}
      currentUserId={user.id}
      other={other}
      initialMessages={initialMessages}
    />
  );
}
