#!/usr/bin/env bash
# Pull only application source code from GitHub into NEW staging directories.
# No database migrations, Docker actions, nginx edits, or portal publishing.
set -Eeuo pipefail
if [[ "$(hostname -s)" != "vmi3191089" ]]; then
  echo 'REFUSED: must run on vmi3191089' >&2; exit 2
fi
if [[ "$#" -ne 1 || ( "$1" != '--plan' && "$1" != '--stage' ) ]]; then
  echo 'Usage: bash stage-direct-apps.sh --plan|--stage' >&2; exit 2
fi
mode="$1"
base=/opt/ads/demo-rollout-sources
if [[ -L "$base" ]]; then echo "REFUSED symlink: $base" >&2; exit 2; fi
if [[ "$mode" == '--stage' ]]; then
  [[ "$(id -u)" == 0 ]] || { echo 'Root required for --stage' >&2; exit 2; }
  [[ -d /opt/ads ]] || { echo 'Missing /opt/ads; inspect server first' >&2; exit 2; }
  install -d -o root -g root -m 0750 "$base"
fi
for pair in \
  education:Education-and-intelligent-services \
  fleetguard:Fleet-guard-and-intelligent-services \
  home-services:Home-Services \
  mamacare:Mama-care-and-intelligent-services \
  morphoo:go-ahead-guesser \
  tontine:Digital-tontine-and-intelligent-services \
  ventureworks:Africa-Digital-Synergy-VentureWorks
do
  slug="$(printf '%s' "$pair" | cut -d: -f1)"
  repo="$(printf '%s' "$pair" | cut -d: -f2)"
  dir="$base/$slug"
  remote="git@github.com:ksondo/$repo.git"
  if [[ -L "$dir" ]]; then echo "REFUSED symlink: $dir" >&2; exit 2; fi
  if [[ "$mode" == '--plan' ]]; then
    if [[ -d "$dir/.git" ]]; then
      printf 'EXISTING %-16s %s\n' "$slug" "$dir"
    elif [[ -e "$dir" ]]; then
      printf 'CONFLICT %-16s %s\n' "$slug" "$dir"
    else
      printf 'WOULD_CLONE %-16s %s\n' "$slug" "$remote"
    fi
    continue
  fi
  if [[ -d "$dir/.git" ]]; then
    actual="$(git -C "$dir" remote get-url origin)"
    if [[ "$actual" != "$remote" ]]; then
      echo "REFUSED wrong origin for $slug" >&2; exit 2
    fi
    if [[ -n "$(git -C "$dir" status --porcelain)" ]]; then
      echo "REFUSED dirty source tree $slug" >&2; exit 2
    fi
    echo "EXISTING $slug COMMIT=$(git -C "$dir" rev-parse HEAD)"
    continue
  fi
  [[ ! -e "$dir" ]] || { echo "REFUSED non-git destination $dir" >&2; exit 2; }
  echo "STAGING $slug"
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=8" \
    git clone --depth 1 --branch main "$remote" "$dir"
  chmod 0750 "$dir"
  echo "STAGED $slug COMMIT=$(git -C "$dir" rev-parse HEAD)"
done
echo "ADS_DIRECT_APP_SOURCE_STAGE=COMPLETE; images, databases, HTTPS and public links UNCHANGED"
