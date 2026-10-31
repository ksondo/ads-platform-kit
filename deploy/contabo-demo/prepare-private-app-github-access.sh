#!/usr/bin/env bash
# Generate unique per-repository deploy keys. Prints PUBLIC keys only.
set -Eeuo pipefail
umask 077
[[ $# -eq 1 ]] || { echo 'Usage: prepare-private-app-github-access.sh --plan|--generate|--verify'; exit 2; }
mode="$1"
case "$mode" in --plan|--generate|--verify) ;; *) exit 2;; esac
dir=/etc/ads-demo/github-readonly
if [[ "$mode" != --plan ]]; then
  [[ "$(id -u)" == 0 && "$(hostname -s)" == vmi3191089 ]] || { echo 'Wrong host/user'; exit 2; }
  [[ -d /etc/ads-demo && ! -L /etc/ads-demo && ! -L "$dir" ]] || { echo 'Unsafe/missing config directory'; exit 2; }
fi
if [[ "$mode" == --generate ]]; then install -d -o root -g root -m 0700 "$dir"; fi
failed=0
for pair in \
 education:Education-and-intelligent-services \
 fleetguard:Fleet-guard-and-intelligent-services \
 home-services:Home-Services \
 mamacare:Mama-care-and-intelligent-services \
 tontine:Digital-tontine-and-intelligent-services \
 ventureworks:Africa-Digital-Synergy-VentureWorks
do
  slug="$(printf '%s' "$pair" | cut -d: -f1)"
  repo="$(printf '%s' "$pair" | cut -d: -f2)"
  key="$dir/$slug"
  if [[ "$mode" == --plan ]]; then
    [[ -f "$key" ]] && echo "KEY_EXISTS $slug" || echo "KEY_REQUIRED $slug for ksondo/$repo"
    continue
  fi
  [[ ! -L "$key" && ! -L "$key.pub" ]] || { echo "REFUSED_SYMLINK $slug"; exit 2; }
  if [[ "$mode" == --generate ]]; then
    if [[ ! -e "$key" && ! -e "$key.pub" ]]; then
      ssh-keygen -q -t ed25519 -a 64 -N '' -f "$key" -C "ads-$slug-vmi3191089-readonly"
      chmod 0600 "$key"
      chmod 0644 "$key.pub"
    fi
    [[ -f "$key" && -f "$key.pub" && "$(stat -c '%u:%a' "$key")" == 0:600 ]] || {
      echo "REFUSED_INCOMPLETE_OR_UNSAFE_KEY $slug"; exit 2;
    }
    echo "=== ksondo/$repo : Settings > Deploy keys > Add deploy key ==="
    echo "Title: ads-$slug-vmi3191089-readonly"
    echo 'Allow write access: UNCHECKED'
    cat "$key.pub"
    continue
  fi
  if [[ ! -f "$key" || "$(stat -c '%u:%a' "$key")" != 0:600 ]]; then
    echo "ACCESS_NOT_CONFIGURED $slug"
    failed=1
    continue
  fi
  ssh_command="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 -i $key"
  if GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="$ssh_command" \
    timeout 20 git ls-remote --exit-code \
    "git@github.com:ksondo/$repo.git" refs/heads/main >/dev/null 2>&1; then
    echo "READ_ONLY_GITHUB_ACCESS_OK $slug"
  else
    echo "READ_ONLY_GITHUB_ACCESS_FAILED $slug"
    failed=1
  fi
done
if [[ "$mode" == --generate ]]; then
  echo 'Register each public key in its private GitHub repository; never share private keys.'
else
  [[ "$failed" -eq 0 ]] || { echo 'ADS_PRIVATE_GITHUB_ACCESS=INCOMPLETE'; exit 1; }
  echo 'ADS_PRIVATE_GITHUB_ACCESS=VERIFIED'
fi
