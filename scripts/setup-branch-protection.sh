#!/bin/bash
# Setup branch protection for the main branch
# Requires: GitHub CLI (gh) authenticated with repo access

set -e

# Get repo info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Setting up branch protection for: $REPO"

# Configure branch protection
gh api "repos/$REPO/branches/main/protection" \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Lint","Type Check","Test","Build"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

echo "Branch protection configured successfully!"
echo ""
echo "Main branch now requires:"
echo "  - Pull request with 1 approval"
echo "  - All CI checks passing (lint, typecheck, test, build)"
echo "  - Branch up to date with main"
echo "  - No force pushes or deletions"
