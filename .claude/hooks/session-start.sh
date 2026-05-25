#!/bin/bash
set -euo pipefail

# SessionStart hook for Claude Code on the web.
#
# The container clones the repo fresh without node_modules, so install the
# web-app dependencies and generate the Prisma client up front. This makes
# `npm run typecheck`, `npm run lint`, and `npm test` work immediately
# (the unit tests are DB-free per CLAUDE.md, so no database is required).
#
# Synchronous + idempotent. npm output is sent to stderr so it does not get
# injected into the session context. Uses `npm install` (not `ci`) so the
# cached container layer is reused on subsequent runs.

# Only run inside Claude Code on the web (remote) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

npm --prefix apps/web install 1>&2
npm --prefix apps/web run prisma:generate 1>&2

echo "Web dependencies installed and Prisma client generated." 1>&2
