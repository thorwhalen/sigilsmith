#!/usr/bin/env bash
# Install the packed sigilsmith into fresh apps beside the latest published optional
# peers, the way a host app would. npm refuses a present optional peer outside its range
# (ERESOLVE), which no unit test can see, so a range that excludes a current release
# fails here. Peers install in families (bare; non-zodal; zodal storage; zodal dials),
# since an app adopts each family on its own. Run after `npm run build`.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tarball="$work/$(cd "$root" && npm pack --silent --ignore-scripts --pack-destination "$work" | tail -n1)"
families="$(node -e "
  const peers = Object.keys(require('$root/package.json').peerDependencies);
  const fam = { bare: [], other: [], 'zodal-store': [], 'zodal-dials': [] };
  for (const n of peers) fam[n.startsWith('@zodal/dials') ? 'zodal-dials' : n.startsWith('@zodal/') ? 'zodal-store' : 'other'].push(n + '@latest');
  for (const [k, v] of Object.entries(fam)) console.log(k + ':' + v.join(' '));
")"
while IFS=: read -r name pkgs; do
  app="$work/$name"
  mkdir -p "$app" && (cd "$app" && npm init -y >/dev/null)
  # shellcheck disable=SC2086
  (cd "$app" && npm i --no-audit --no-fund --loglevel=error $pkgs "$tarball" >/dev/null && npx --no-install sigilsmith catalog --implemented --json >/dev/null)
  echo "install smoke: $name ok${pkgs:+ ($pkgs)}"
done <<< "$families"
