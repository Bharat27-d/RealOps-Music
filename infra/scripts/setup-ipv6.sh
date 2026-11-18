#!/usr/bin/env bash
# ==============================================================================
# Hetzner Host IPv6 Route-Planner Configuration Script
# ==============================================================================
# Purpose:
# Configures the Linux kernel on the Hetzner host so that Lavalink's
# RotatingNanoSwitch route planner can bind to any random IPv6 address
# within the assigned /64 subnet for outgoing YouTube HTTP requests.
#
# Prerequisites:
# 1. Run as root or with sudo on the Hetzner primary server host.
# 2. You must know your assigned Hetzner IPv6 /64 prefix
#    (Found in Robot / Cloud Console, e.g. 2a01:4f8:123:456::/64).
#
# Usage:
#   sudo ./setup-ipv6.sh 2a01:4f8:123:456::/64
# ==============================================================================

set -euo pipefail

SUBNET="${1:-}"

if [ -z "$SUBNET" ]; then
  echo "Error: Missing IPv6 subnet CIDR."
  echo "Usage: sudo $0 <assigned-ipv6-subnet-cidr>"
  echo "Example: sudo $0 2a01:4f8:123:456::/64"
  exit 1
fi

echo "==> [1/3] Enabling Linux kernel non-local IPv6 address binding..."
# Allows sockets to bind to IP addresses within the /64 that are not
# explicitly assigned to a network interface.
sysctl -w net.ipv6.ip_nonlocal_bind=1

# Persist across reboots
CONF_PATH="/etc/sysctl.d/99-lavalink-ipv6.conf"
echo "net.ipv6.ip_nonlocal_bind=1" | tee "$CONF_PATH" > /dev/null
echo "  ✓ Saved sysctl configuration to $CONF_PATH"

echo "==> [2/3] Adding local route for entire /64 subnet to loopback (lo)..."
# Directs the kernel to treat all incoming/outgoing packets in this subnet as local
if ip -6 route show | grep -q "$SUBNET dev lo"; then
  echo "  ✓ Route for $SUBNET already exists on dev lo"
else
  ip -6 route add local "$SUBNET" dev lo
  echo "  ✓ Added: ip -6 route add local $SUBNET dev lo"
fi

echo "==> [3/3] Verifying outgoing requests with distinct IPv6 addresses..."
# Generate 3 test addresses within the subnet
PREFIX="${SUBNET%%::*}"
TEST_IPS=(
  "${PREFIX}::10"
  "${PREFIX}::beef"
  "${PREFIX}::cafe"
)

ALL_SUCCESS=true
for TEST_IP in "${TEST_IPS[@]}"; do
  echo -n "  Testing egress via $TEST_IP... "
  OUT_IP=$(curl -6 --interface "$TEST_IP" -s --max-time 5 https://api64.ipify.org 2>/dev/null || echo "FAILED")
  if [ "$OUT_IP" = "$TEST_IP" ]; then
    echo "SUCCESS (Egress confirmed as $OUT_IP)"
  else
    echo "FAILED (Result: $OUT_IP)"
    ALL_SUCCESS=false
  fi
done

echo ""
if [ "$ALL_SUCCESS" = true ]; then
  echo "=========================================================================="
  echo "  SUCCESS: Hetzner host IPv6 route-planner configuration is complete!"
  echo "  Set HETZNER_IPV6_BLOCK=$SUBNET in your .env file."
  echo "=========================================================================="
else
  echo "=========================================================================="
  echo "  WARNING: Direct binding test failed. Please verify that your gateway/ISP"
  echo "  routes the whole $SUBNET to your main network interface (e.g., eth0)."
  echo "=========================================================================="
fi

echo ""
echo "DOCKER NETWORKING NOTE:"
echo "By default, Docker bridge networks do not automatically inherit host IPv6 routes."
echo "To ensure Lavalink can rotate addresses from inside Docker:"
echo "Option A (Recommended for Hetzner): Run the Lavalink container with 'network_mode: host'"
echo "Option B: Configure Docker daemon (/etc/docker/daemon.json) with 'ipv6: true' and 'fixed-cidr-v6'."
echo ""
echo "LIMITATION WARNING:"
echo "IPv6 rotation is a mitigation, NOT an indefinite guarantee. YouTube tracks ASN"
echo "reputation. Datacenter /64 subnets (Hetzner AS24940) can and do get blocked as an"
echo "entire block under heavy load. The residential node (Option 2) is the true permanent fix."

