#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$HOME/flappycube_auto"
KEY="${KEY:-$HOME/.ssh/id_ed25519}"     # change si besoin (id_rsa, etc.)
TAG="${1:-}"                            # ex: v1.1.0
MSG="${2:-}"                            # note courte optionnelle

# --- helpers ---
die(){ echo "❌ $*" >&2; exit 1; }
info(){ echo "==> $*"; }

[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Tag invalide. Utilise le format vX.Y.Z (ex: v1.1.0)."

# 0) Clé SSH prête
eval "$(ssh-agent -s)" >/dev/null 2>&1 || true
[[ -f "$KEY" ]] || die "Clé privée introuvable: $KEY"
ssh-add "$KEY" >/dev/null 2>&1 || true
mkdir -p "$HOME/.ssh"
ssh-keyscan -H github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
chmod 600 "$HOME/.ssh/known_hosts" || true

# 1) Aller dans le dépôt
cd "$REPO_DIR" || die "Dépôt introuvable: $REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Ici ce n'est pas un dépôt git."

# 2) Branche + statut
BRANCH="$(git branch --show-current)"
[[ -n "$BRANCH" ]] || die "Aucune branche active."
git fetch origin || true

# 3) Arbre propre ?
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Il y a des changements non commit. Commit d'abord puis relance."
fi

# 4) Pousser la branche courante (au cas où)
info "Push de la branche '$BRANCH'…"
GIT_SSH_COMMAND="ssh -o IdentitiesOnly=yes -i $KEY" git push -u origin "$BRANCH"

# 5) Créer le tag (annoté si un message est fourni)
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "Le tag $TAG existe déjà."
fi
if [[ -n "$MSG" ]]; then
  info "Création du tag annoté $TAG…"
  git tag -a "$TAG" -m "$MSG"
else
  info "Création du tag léger $TAG…"
  git tag "$TAG"
fi

# 6) Push du tag
info "Push du tag $TAG vers origin…"
GIT_SSH_COMMAND="ssh -o IdentitiesOnly=yes -i $KEY" git push origin "$TAG"

cat <<NOTE

✅ C'est parti !
- Le tag **$TAG** est poussé.
- GitHub Actions va construire l’APK et créer la Release automatiquement (workflow).
- Tu trouveras l'APK dans la Release associée au tag.

Astuce:
- Pour une note: ./release.sh $TAG "Ma courte note"
NOTE
