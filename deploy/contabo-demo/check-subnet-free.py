#!/usr/bin/env python3
"""Is a subnet free on this Docker host? READ-ONLY; reads lines on stdin, prints FREE or the overlapping lines.

RUNBOOK.md §E3.2 step 5c (Tourism's fixed edge subnet, TOU-1). Feed it every Docker network and every IPv4 route:

  TOUR_EDGE_BR="br-$(docker network inspect -f '{{printf "%.12s" .Id}}' ads-tourism-demo_edge 2>/dev/null)"
  { docker network ls -q | xargs docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'; \
    ip -4 route | awk '{d="-"; for(i=2;i<NF;i++) if($i=="dev") d=$(i+1); print "route:" d, $1}'; } \
    | python3 -I deploy/contabo-demo/check-subnet-free.py 172.30.130.0/24 "$TOUR_EDGE_BR"

Line formats: "<network name> <subnet> [<subnet> ...]" and "route:<device> <destination>". A destination without
"/" is a host route (/32). "default" and non-addresses are ignored, and IPv6 subnets never clash with an IPv4 target.
On a re-run, Tourism's own network (ads-tourism-demo_edge) and its own bridge route (route:<own bridge>) are expected
and skipped. Exit status 0 when FREE, 1 when something overlaps, 2 on a usage error.
"""
import ipaddress
import sys

OWN_NETWORK = "ads-tourism-demo_edge"


def overlaps(lines, target, own_bridge=""):
    hits = []
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        name, words = parts[0], parts[1:]
        if name == OWN_NETWORK or (own_bridge and own_bridge != "br-" and name == "route:" + own_bridge):
            continue
        for w in words:
            try:
                net = ipaddress.ip_network(w if "/" in w else w + "/32", strict=False)
            except ValueError:
                continue
            if net.version == target.version and net.overlaps(target):
                hits.append(line.strip())
                break
    return hits


def main(argv):
    if len(argv) not in (2, 3):
        print("usage: check-subnet-free.py <subnet> [<own bridge device>]", file=sys.stderr)
        return 2
    try:
        target = ipaddress.ip_network(argv[1], strict=True)
    except ValueError:
        print("invalid subnet: " + argv[1], file=sys.stderr)
        return 2
    hits = overlaps(sys.stdin, target, argv[2] if len(argv) == 3 else "")
    print("\n".join(hits) or "FREE")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
