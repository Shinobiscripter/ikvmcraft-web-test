#!/usr/bin/env bash
set -euo pipefail
# Optional test fixture only; the application build does not require a JDK.
repo_root=$(cd "$(dirname "$0")/.." && pwd)
output=$(mktemp -d "${TMPDIR:-/tmp}/ikvmcraft-smoke.XXXXXX")
curl -fL --retry 3 --connect-timeout 15 --max-time 120 \
  https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar \
  -o "$output/fabric-loader.jar"
mkdir -p "$output/classes"
javac --release 8 -cp "$output/fabric-loader.jar" -d "$output/classes" "$repo_root/tests/smoke-mod/SmokeClient.java"
cp "$repo_root/tests/smoke-mod/fabric.mod.json" "$output/classes/"
jar cf "$output/ikvmcraft-smoke.jar" -C "$output/classes" .
echo "Upload this test mod in the launcher: $output/ikvmcraft-smoke.jar"
