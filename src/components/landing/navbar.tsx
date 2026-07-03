"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./logo";

const NAV_LINKS = [
  { label: "Le concept", href: "#concept" },
  { label: "Comment ça marche", href: "#comment" },
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  // Menu mobile ouvert : bloque le scroll de la page + fermeture au clavier
  // (Escape). Restaure proprement le scroll à la fermeture / au démontage.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled ? "py-2" : "py-4",
        )}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav
            className={cn(
              "flex items-center justify-between gap-4 rounded-2xl px-4 py-3 transition-all duration-300 sm:px-5",
              scrolled
                ? "glass shadow-[0_18px_40px_-28px_rgba(43,26,18,0.5)]"
                : "border border-transparent",
            )}
          >
            <a href="#" aria-label="Accueil KASSALAFAM">
              <Logo />
            </a>

            <ul className="hidden items-center gap-7 lg:flex">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm font-medium text-ink-700/80 transition-colors hover:text-choco-600"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="hidden items-center gap-3 lg:flex">
              {authed ? (
                <Link
                  href="/dashboard"
                  className="rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
                >
                  Espace membre
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-semibold text-choco-600 transition-colors hover:text-choco-800"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
                  >
                    Créer mon profil
                  </Link>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={open}
              className="relative z-[60] flex h-10 w-10 items-center justify-center rounded-xl border border-champagne-500/30 bg-cream-100/80 text-choco-700 lg:hidden"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Menu mobile — HORS du <header> pour un empilement fiable au niveau racine :
          overlay z-40 (sous le header z-50, donc le hamburger reste cliquable),
          panneau OPAQUE z-[60] (au-dessus). Rendu uniquement sous lg. */}
      {open ? (
        <div className="lg:hidden">
          {/* Overlay : assombrit le hero et bloque tout clic derrière. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          />

          {/* Panneau : aligné sur le conteneur navbar, fond beige OPAQUE. */}
          <div className="fixed inset-x-0 top-24 z-[60] px-4 sm:px-6">
            <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-[#ead8bc] bg-[#fffaf2] p-3 shadow-[0_24px_70px_rgba(74,42,23,0.22)]">
              <ul className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[48px] items-center rounded-2xl px-4 text-[15px] font-medium text-ink-800 transition-colors hover:bg-champagne-400/20 hover:text-choco-700"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-2 flex flex-col gap-2 border-t border-[#ead8bc] p-1 pt-3">
                {authed ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-choco-600 to-choco-800 px-4 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30"
                  >
                    Espace membre
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="flex min-h-[48px] w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/20"
                    >
                      Se connecter
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setOpen(false)}
                      className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-choco-600 to-choco-800 px-4 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30"
                    >
                      Créer mon profil
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
