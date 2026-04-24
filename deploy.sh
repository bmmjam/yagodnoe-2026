#!/usr/bin/env bash
# Quick deploy: push to origin/main. GitHub Pages auto-publishes.
set -e

BRANCH="${1:-main}"

echo "→ Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo ""
echo "✓ Pushed. Now check:"
echo "  1. Settings → Pages → Source: Deploy from a branch"
echo "  2. Branch: $BRANCH · Folder: / (root)"
echo "  3. Wait 1–2 min, then open:"
echo "     https://YOUR_USERNAME.github.io/yagodnoe-2026/"
echo ""
echo "  (Replace YOUR_USERNAME with your GitHub username)"
