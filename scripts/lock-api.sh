#!/bin/sh
# Locks the API (api.elevn.fun) so it answers only the website's own server, not the public.
# Makes one random key and stores it in three places, never printing it:
#   .env            read by the Python API on this Mac
#   web/.env.local  read by the website when it runs on this Mac
#   Vercel          production, read by the live website (every elevn deployment is a production one)
# Run it once from the repo folder: sh scripts/lock-api.sh
# Afterwards, restart the public API (the "api-public" Terminal tab) so it picks the key up.
set -e
cd "$(dirname "$0")/.."
if grep -q '^API_GATE_SECRET=' .env 2>/dev/null; then
  echo "A key is already in .env, nothing to do."; exit 0
fi
umask 077
KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(40))")
printf '\n# private until launch: the API answers only the website server carrying this key (never commit)\nAPI_GATE_SECRET=%s\n' "$KEY" >> .env
printf 'API_GATE_SECRET=%s\n' "$KEY" >> web/.env.local
printf '%s' "$KEY" | npx --prefix web vercel env add API_GATE_SECRET --environment production --sensitive
unset KEY
git check-ignore -q .env && git check-ignore -q web/.env.local && echo "Saved. Both local files are ignored by git."
echo "Done. Next: redeploy on Vercel, then restart the api-public tab."
