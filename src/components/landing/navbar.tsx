"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
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
            <a
              href="#"
              className="text-sm font-semibold text-choco-600 transition-colors hover:text-choco-800"
            >
              Se connecter
            </a>
            <a
              href="#"
              className="rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
            >
              Créer mon profil
            </a>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-champagne-500/30 bg-cream-100/60 text-choco-700 lg:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>

        {/* Menu mobile */}
        {open ? (
          <div className="mt-2 overflow-hidden rounded-2xl glass p-2 shadow-card lg:hidden">
            <ul className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-col gap-2 border-t border-champagne-500/20 p-2">
              <a
                href="#"
                className="rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-choco-600"
              >
                Se connecter
              </a>
              <a
                href="#"
                className="rounded-xl bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2.5 text-center text-sm font-semibold text-cream-50"
              >
                Créer mon profil
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
