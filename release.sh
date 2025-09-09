#!/usr/bin/env bash
# release.sh — Générique pour n’importe quel projet Capacitor déjà câblé avec GitHub Actions
# Usage:
#   ./release.sh "mon-label-de-release"
# Comportement:
#   - npx cap copy/sync (pas de build local)
#   - commit + push sur la branche courante
#   - création d’un tag vX.Y.Z auto-incrémenté + push du tag
#   - déclenche ton workflow GitHub (release.yml)

set -euo pipefail

LABEL="${1:-release}"   # Sert à décrire la release (message de commit & tag)
DATE_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# --- garde-fous utiles ---
require() { command -v "$1" >/dev/null 2>&1 || { echo "❌ '$1' introuvable. Installe-le et réessaie."; exit 1; }; }
require git
require node
require npx

# Vérif repo git
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ Pas dans un dépôt Git."; exit 1; }
BRANCH="$(git rev-parse --abbrev-ref HEAD || echo main)"
echo "🔧 Branche courante: $BRANCH"

# Vérif répertoires utiles
[ -d "www" ] || { echo "❌ Dossier 'www' manquant (index.html, game.js, style.css...)."; exit 1; }

# --- Capacitor: copy & sync (léger, pas de build local) ---
echo "⚙️  Capacitor copy & sync (pas de build local)..."
npx cap copy android
npx cap sync android
echo "✅ Capacitor OK"

# --- Stage & commit s'il y a des changements ---
echo "📦 Préparation du commit..."
git add -A

if ! git diff --cached --quiet; then
  git commit -m "release: ${LABEL} (${DATE_UTC})"
  echo "✅ Commit créé."
else
  echo "ℹ️  Aucun changement à committer (on continue)."
fi

# --- Push branche ---
echo "🚀 Push branche '$BRANCH' vers origin..."
git push -u origin "$BRANCH"
echo "✅ Push OK."

# --- Calcul du prochain tag sémantique vX.Y.Z ---
next_patch() {
  local tag="$1"
  if [[ "$tag" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    local major="${BASH_REMATCH[1]}"
    local minor="${BASH_REMATCH[2]}"
    local patch="${BASH_REMATCH[3]}"
    echo "v${major}.${minor}.$((patch+1))"
  else
    # Tag non sémantique → on repart propre
    echo "v1.0.0"
  fi
}

# Dernier tag sémver vX.Y.Z (ou par défaut v1.0.0)
LAST_V_TAG="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1 || true)"
if [[ -z "$LAST_V_TAG" ]]; then
  CANDIDATE="v1.0.0"
else
  CANDIDATE="$(next_patch "$LAST_V_TAG")"
fi

# Si le tag candidat existe déjà, on incrémente jusqu’à trouver un libre
while git rev-parse -q --verify "refs/tags/${CANDIDATE}" >/dev/null 2>&1; do
  CANDIDATE="$(next_patch "$CANDIDATE")"
done
NEW_TAG="$CANDIDATE"

# --- Création + push du tag ---
echo "🏷️  Création du tag ${NEW_TAG}..."
git tag -a "${NEW_TAG}" -m "release: ${LABEL} (${DATE_UTC})"
git push origin "${NEW_TAG}"
echo "✅ Tag poussé: ${NEW_TAG}"

cat <<EOF

🎉 Fini.
- Branche       : ${BRANCH} (poussée)
- Tag créé      : ${NEW_TAG} (poussé)
- Label release : ${LABEL}

🔔 Ton workflow GitHub (release.yml) doit maintenant se déclencher automatiquement
   et produire l'APK signé dans la page de la Release / ou en Artifact.

Astuce:
- Pour relancer: ./release.sh "ton-label-suivant"
- Le script incrémente automatiquement la version sémantique (vX.Y.Z).
EOF
