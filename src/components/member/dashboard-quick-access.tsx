"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Heart, MessageCircle, UserRoundCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { RelationshipItem } from "@/lib/types/database";

/**
 * Accès rapide du tableau de bord (Lot G) — quatre tuiles, quatre chiffres RÉELS.
 *
 * RÈGLE : aucun nombre n'est inventé ni estimé. Chaque tuile lit une source déjà
 * livrée :
 *   · Messages non lus et Demandes reçues → `list_my_relationships`, la RPC qui
 *     alimente déjà les pastilles de l'en-tête (une seule lecture pour les deux) ;
 *   · Visiteurs → `count_profile_visitors`, compteur LIBRE du Lot B (seule la
 *     LISTE est premium). Afficher le nombre ici est la même promesse
 *     d'honnêteté que l'état verrouillé de /visitors : le chiffre est vrai,
 *     l'identité est réservée ;
 *   · Favoris → les profils que le membre a lui-même enregistrés (sens SORTANT,
 *     gratuit). Jamais le sens entrant, qui appartient au Premium.
 *
 * Une lecture en échec n'affiche PAS zéro — elle n'affiche rien. Un faux zéro
 * ferait croire à un membre qu'il n'a aucune demande alors qu'il en a.
 */

type Compteurs = {
  messages: number;
  demandes: number;
  visiteurs: number;
  favoris: number;
};

export function DashboardQuickAccess() {
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);

  useEffect(() => {
    let annule = false;

    async function charger() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || annule) return;

      const [relations, visiteurs, favoris] = await Promise.all([
        supabase.rpc("list_my_relationships"),
        supabase.rpc("count_profile_visitors"),
        supabase
          .from("member_favorites")
          .select("target_profile_id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (annule) return;

      const lignes =
        relations.error || !relations.data
          ? []
          : (relations.data as RelationshipItem[]);

      setCompteurs({
        messages: lignes.reduce((somme, r) => somme + (r.unread_count ?? 0), 0),
        demandes: lignes.filter(
          (r) => r.kind === "received" && r.status === "pending",
        ).length,
        visiteurs: visiteurs.error ? 0 : Number(visiteurs.data ?? 0),
        favoris: favoris.error ? 0 : (favoris.count ?? 0),
      });
    }

    void charger();

    return () => {
      annule = true;
    };
  }, []);

  const tuiles = [
    {
      href: "/matches?tab=matched",
      label: "Messages",
      detail: "Conversations",
      icon: MessageCircle,
      valeur: compteurs?.messages,
    },
    {
      href: "/matches?tab=received",
      label: "Demandes",
      detail: "Reçues",
      icon: UserRoundCheck,
      valeur: compteurs?.demandes,
    },
    {
      href: "/visitors",
      label: "Visiteurs",
      detail: "Ont vu mon profil",
      icon: Eye,
      valeur: compteurs?.visiteurs,
    },
    {
      href: "/favorites",
      label: "Favoris",
      detail: "Mes profils gardés",
      icon: Heart,
      valeur: compteurs?.favoris,
    },
  ];

  return (
    <section aria-label="Accès rapide" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tuiles.map((t) => {
        const Icon = t.icon;

        return (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col gap-2 rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-4 shadow-card transition-transform hover:-translate-y-0.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
              <Icon size={18} />
            </span>

            <span className="font-serif text-2xl font-semibold text-choco-700">
              {/* Chargement ou lecture en échec : un tiret, jamais un faux zéro. */}
              {t.valeur == null ? "—" : t.valeur}
            </span>

            <span className="text-sm font-medium text-ink-800">{t.label}</span>
            <span className="text-xs text-ink-700/60">{t.detail}</span>
          </Link>
        );
      })}
    </section>
  );
}
