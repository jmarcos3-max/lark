#!/usr/bin/env bash
# Push to the main lark GitHub repo (optional helper — you can also push manually).
set -euo pipefail

REPO_URL="${1:-https://github.com/jmarcos3-max/lark.git}"
REMOTE_NAME="${2:-origin}"

cd "$(dirname "$0")/.."

if ! git remote get-url "$REMOTE_NAME" &>/dev/null; then
  git remote add "$REMOTE_NAME" "$REPO_URL"
fi

echo "Checking $REPO_URL exists..."
if ! git ls-remote "$REMOTE_NAME" &>/dev/null; then
  echo ""
  echo "Create the repo first (or fix the remote URL):"
  echo "  https://github.com/jmarcos3-max/lark"
  echo ""
  echo "Manual push:"
  echo "  git push -u origin main"
  exit 1
fi

echo "Pushing main..."
git push -u "$REMOTE_NAME" main

if git show-ref --verify --quiet refs/heads/johns-branch; then
  echo "Pushing johns-branch..."
  git push -u "$REMOTE_NAME" johns-branch
fi

echo ""
echo "Done. After push, GitHub Actions deploys Pages automatically."
echo "  1. Settings → Secrets → VITE_AUDIOTOOL_CLIENT_ID (and optional VITE_ELEVENLABS_API_KEY, VITE_REPLICATE_API_TOKEN)"
echo "  2. Settings → Pages → source: GitHub Actions"
echo "  3. Audiotool portal → redirect: https://jmarcos3-max.github.io/lark/"
echo "  4. Live site: https://jmarcos3-max.github.io/lark/"
