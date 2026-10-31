#!/usr/bin/env bash
# Create isolated local Git metadata for ONE private app after read-only deploy key approval.
# Does not clone to a working tree, build, migrate, deploy or change public services.
set -Eeuo pipefail
umask 077
[[ $# -eq 2 ]] || { echo 'Usage: bootstrap-direct-app-cache.sh --plan|--init APP'; exit 2; }
mode="$1"
slug="$2"
[[ "$mode" == --plan || "$mode" == --init ]] || exit 2
case "$slug" in
 education) repo=Education-and-intelligent-services ;;
 fleetguard) repo=Fleet-guard-and-intelligent-services ;;
 home-services) repo=Home-Services ;;
 mamacare) repo=Mama-care-and-intelligent-services ;;
 tontine) repo=Digital-tontine-and-intelligent-services ;;
 ventureworks) repo=Africa-Digital-Synergy-VentureWorks ;;
 *) echo "Unsupported app $slug" >&2; exit 2 ;;
esac
root=/var/lib/ads-demo/app-git-sources
dest="$root/$slug"
key="/etc/ads-demo/github-readonly/$slug"
remote="git@github.com:ksondo/$repo.git"
ssh_command="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o ConnectTimeout=8 -i $key"
if [[ "$mode" == --plan ]]; then
 echo "APP=$slug REPO=$repo GIT_CACHE=$dest KEY_PRESENT=$([[ -f "$key" ]] && echo yes || echo no)"
 echo 'PLAN_ONLY; no Git access or host changes'
 exit 0
fi
[[ "$(hostname -s)" == vmi3191089 && "$(id -u)" -eq 0 ]] || { echo 'Wrong host or user'; exit 2; }
[[ -d /var/lib/ads-demo && ! -L /var/lib/ads-demo && ! -L "$root" && ! -L "$dest" ]] || {
 echo 'Unsafe or missing protected ADS path'; exit 2;
}
[[ -f "$key" && ! -L "$key" && "$(stat -c '%u:%a' "$key")" == 0:600 ]] || {
 echo "Read-only GitHub key missing or unsafe: $slug"; exit 2;
}
GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="$ssh_command" \
 timeout 20 git ls-remote --exit-code "$remote" refs/heads/main >/dev/null || {
 echo "GitHub denies access to $slug; add its PUBLIC key to GitHub as read-only"; exit 2;
}
install -d -o root -g root -m 0700 "$root"
if [[ -e "$dest" && ! -d "$dest/.git" ]]; then
 echo "Refused unexpected existing path $dest"; exit 2
fi
if [[ ! -d "$dest/.git" ]]; then
  install -d -o root -g root -m 0700 "$dest"
  git -c init.defaultBranch=main init -q "$dest"
  git -C "$dest" remote add origin "$remote"
  git -C "$dest" config --local core.sshCommand "$ssh_command"
fi
[[ "$(git -c safe.directory="$dest" -C "$dest" remote get-url origin)" == "$remote" ]] || {
 echo 'Origin mismatch; refusing cached repository'; exit 2;
}
[[ "$(git -c safe.directory="$dest" -C "$dest" config --local --get core.sshCommand)" == "$ssh_command" ]] || {
 echo 'Cached SSH configuration mismatch'; exit 2;
}
GIT_TERMINAL_PROMPT=0 git -c safe.directory="$dest" -C "$dest" fetch --no-tags origin main
echo "ADS_PRIVATE_APP_CACHE=READY app=$slug path=$dest"
echo 'Next: stage-direct-apps.sh --check APP PATH APPROVED_SHA and --stage after approving SHA.'
