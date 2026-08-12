#!/usr/bin/env bash
# =============================================================================
# KASSALAFAM — MARIAGE À TOUT PRIX
# Banc d'essai pgTAP sans Docker.
#
# Rejoue TOUTES les migrations du dépôt sur une base jetable, puis exécute les
# suites pgTAP de supabase/tests. Conçu pour un VPS Linux ordinaire.
#
# Prérequis (Debian / Ubuntu) :
#   sudo apt-get install -y postgresql-16 postgresql-16-pgtap
#
# Usage :
#   ./scripts/pgtap/run-pgtap.sh                  # toutes les suites
#   ./scripts/pgtap/run-pgtap.sh 20260812002000   # une seule (filtre sur le nom)
#
# Réglages par variables d'environnement (valeurs par défaut entre crochets) :
#   PGHOST [/var/run/postgresql] · PGPORT [5432] · PGUSER [postgres]
#   PGTAP_DB [kassalafam_pgtap] · le nom DOIT se terminer par _pgtap.
#
# ⚠️ La base désignée est DÉTRUITE puis recréée à chaque exécution. Deux
#    garde-fous refusent de partir sur autre chose qu'une base jetable : le
#    suffixe _pgtap obligatoire, et le rejet de tout hôte distant ressemblant à
#    une base Supabase gérée. Aucune donnée de production ne doit approcher ce
#    script.
# =============================================================================
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$RACINE/supabase/migrations"
SUITES="$RACINE/supabase/tests"
AMORCAGE="$RACINE/scripts/pgtap/bootstrap-supabase-shim.sql"

# Les NOTICE de re-création de rôles et de bases sont attendus : on ne garde
# que les WARNING et au-delà, pour que le compte rendu reste lisible.
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
PGTAP_DB="${PGTAP_DB:-kassalafam_pgtap}"
FILTRE="${1:-}"

# --- Garde-fous --------------------------------------------------------------
case "$PGTAP_DB" in
  *_pgtap) ;;
  *) echo "REFUS : PGTAP_DB doit se terminer par _pgtap (reçu : $PGTAP_DB)." >&2
     exit 2 ;;
esac

case "$PGHOST" in
  *supabase.co|*supabase.com|*pooler.supabase.com)
     echo "REFUS : ce script ne s'exécute jamais contre une base Supabase gérée." >&2
     exit 2 ;;
esac

for f in "$AMORCAGE" "$MIGRATIONS" "$SUITES"; do
  [ -e "$f" ] || { echo "REFUS : introuvable — $f" >&2; exit 2; }
done

command -v psql >/dev/null || { echo "REFUS : psql absent du PATH." >&2; exit 2; }

# --- Base jetable ------------------------------------------------------------
echo "== Base jetable : $PGTAP_DB (hôte $PGHOST:$PGPORT)"
psql -X -q -d postgres -c "drop database if exists $PGTAP_DB;" >/dev/null || exit 1
psql -X -q -d postgres -c "create database $PGTAP_DB;"         >/dev/null || exit 1

echo "== Amorçage de l'environnement Supabase de substitution"
if ! psql -X -q -v ON_ERROR_STOP=1 -d "$PGTAP_DB" -f "$AMORCAGE" >/dev/null; then
  echo "ECHEC : amorçage impossible. Vérifier que pgtap est installé." >&2
  exit 1
fi

# --- Migrations --------------------------------------------------------------
echo "== Application des migrations"
nb_migrations=0
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  if ! sortie=$(psql -X -q -v ON_ERROR_STOP=1 -d "$PGTAP_DB" -f "$f" 2>&1); then
    echo "ECHEC MIGRATION : $(basename "$f")" >&2
    echo "$sortie" | head -10 >&2
    exit 1
  fi
  nb_migrations=$((nb_migrations + 1))
done
echo "   $nb_migrations migrations appliquées, aucune erreur."

# --- Suites ------------------------------------------------------------------
echo "== Suites pgTAP"
verts=0
rouges=0
liste_rouges=""

for f in $(ls "$SUITES"/*.test.sql | sort); do
  nom="$(basename "$f")"
  if [ -n "$FILTRE" ] && [[ "$nom" != *"$FILTRE"* ]]; then
    continue
  fi

  sortie=$(psql -X -q -d "$PGTAP_DB" -f "$f" 2>&1)

  if echo "$sortie" | grep -q "not ok\|ERROR:"; then
    rouges=$((rouges + 1))
    liste_rouges="$liste_rouges
  $nom"
    echo "  ROUGE  $nom"
    echo "$sortie" | grep -E "not ok|ERROR:" | head -3 | sed 's/^/           /'
  else
    verts=$((verts + 1))
    echo "  vert   $nom"
  fi
done

echo
echo "== Bilan : $verts vertes, $rouges en échec."
if [ "$rouges" -gt 0 ]; then
  echo "Suites en échec :$liste_rouges"
  echo
  echo "Rappel : une suite qui compare un INVENTAIRE de policies ou de triggers"
  echo "peut échouer ici sans régression réelle — l'environnement de"
  echo "substitution n'a ni GoTrue ni le serveur de stockage. Les suites de"
  echo "COMPORTEMENT, elles, font foi."
  exit 1
fi

echo "Toutes les suites demandées sont vertes."
