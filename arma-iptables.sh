#!/bin/bash
# Rate-limit UDP to Arma game port — max 150 packets/sec per source IP
# Bursts up to 200 allowed; excess is silently dropped.
# Prevents simple UDP floods from saturating the connection.

ARMA_PORT=7777

# Flush old rules for this chain if it exists
iptables -D INPUT -p udp --dport $ARMA_PORT -j ARMA-RATELIMIT 2>/dev/null || true
iptables -F ARMA-RATELIMIT 2>/dev/null || true
iptables -X ARMA-RATELIMIT 2>/dev/null || true

# Create fresh chain
iptables -N ARMA-RATELIMIT
iptables -A ARMA-RATELIMIT -p udp -m hashlimit \
  --hashlimit-name arma-udp \
  --hashlimit-above 150/sec \
  --hashlimit-burst 200 \
  --hashlimit-mode srcip \
  --hashlimit-htable-expire 10000 \
  -j DROP
iptables -A ARMA-RATELIMIT -j ACCEPT

# Insert before UFW rules so it runs first
iptables -I INPUT 1 -p udp --dport $ARMA_PORT -j ARMA-RATELIMIT

echo "Arma UDP rate-limit applied on port $ARMA_PORT"
