#!/bin/sh
# Kizlo dev — Linux file-ownership fix.
#
# On native Linux, files the container writes into the bind-mounted install would
# be owned by www-data (uid 33), not you, leaving "permission denied" when you edit
# them from your file manager. This wrapper runs first (as root), retags www-data to
# the host user's uid/gid, then hands off to the normal WordPress entrypoint — so
# everything WordPress creates is owned by you. Injected only on Linux; Mac/Windows
# never see this file.
set -e

if [ -n "$KIZLO_PUID" ] && [ "$KIZLO_PUID" != "0" ]; then
	usermod -o -u "$KIZLO_PUID" www-data 2>/dev/null || true
	groupmod -o -g "$KIZLO_PGID" www-data 2>/dev/null || true
fi

exec docker-entrypoint.sh "$@"
