#!/usr/bin/env bash
# Pass 2: convert remaining dark backgrounds and miscellaneous patterns.
set -euo pipefail

ROOT="${1:-c:/Allvision-Pulse/frontend/src}"

mapfile -t FILES < <(find "$ROOT" -type f -name '*.module.css' \
  ! -path '*/Lightbox/*' \
  ! -path '*/CallOverlay*' \
  ! -path '*/callUi*' \
  ! -name 'GameSessionPanel.module.css.bak')

for f in "${FILES[@]}"; do
  # Background dark rgbas → warm panel/surface
  sed -i -E \
    -e 's/background: *rgba\(10, *11, *14, *0\.[0-9]+\)/background: var(--surface-1)/g' \
    -e 's/background: *rgba\(12, *12, *14, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(12, *13, *17, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(14, *14, *16, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(14, *16, *20, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(15, *16, *18, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(15, *17, *21, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(16, *17, *20, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(16, *17, *21, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(18, *19, *23, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(18, *21, *26, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(20, *20, *20, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(22, *23, *27, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(22, *24, *28, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(24, *28, *34, *0\.[0-9]+\)/background: var(--panel)/g' \
    -e 's/background: *rgba\(30, *31, *35, *0\.[0-9]+\)/background: var(--panel)/g' \
    "$f"

  # Solid dark hex backgrounds
  sed -i -E \
    -e 's/background: *#0[0-9a-fA-F]{5}\b/background: var(--bg)/g' \
    -e 's/background: *#1[0-3][0-9a-fA-F]{4}\b/background: var(--bg)/g' \
    -e 's/background: *#1[4-9][0-9a-fA-F]{4}\b/background: var(--panel)/g' \
    -e 's/background: *#2[0-2][0-9a-fA-F]{4}\b/background: var(--panel-2)/g' \
    "$f"

  # Pure black shadows → warm brown shadows
  sed -i -E \
    -e 's/box-shadow: *([0-9-]+) *([0-9-]+px) *([0-9-]+px) *([0-9-]+px)? *rgba\(0, *0, *0, *([0-9.]+)\)/box-shadow: \1 \2 \3 \4 rgba(92, 54, 18, \5)/g' \
    "$f"

  # Stray remaining white-alpha patterns (incl exotic alphas)
  sed -i -E \
    -e 's/rgba\(255, *255, *255, *0\.012\)/var(--surface-0)/g' \
    -e 's/rgba\(255, *255, *255, *0\.015\)/var(--surface-0)/g' \
    -e 's/rgba\(255, *255, *255, *0\.026\)/var(--surface-1)/g' \
    -e 's/rgba\(255, *255, *255, *0\.028\)/var(--surface-1)/g' \
    -e 's/rgba\(255, *255, *255, *0\.034\)/var(--surface-1)/g' \
    -e 's/rgba\(255, *255, *255, *0\.038\)/var(--surface-1)/g' \
    -e 's/rgba\(255, *255, *255, *0\.044\)/var(--surface-1)/g' \
    -e 's/rgba\(255, *255, *255, *0\.058\)/var(--surface-2)/g' \
    -e 's/rgba\(255, *255, *255, *0\.072\)/var(--surface-2)/g' \
    -e 's/rgba\(255, *255, *255, *0\.085\)/var(--surface-2)/g' \
    -e 's/rgba\(255, *255, *255, *0\.095\)/var(--stroke)/g' \
    -e 's/rgba\(255, *255, *255, *0\.105\)/var(--stroke)/g' \
    -e 's/rgba\(255, *255, *255, *0\.115\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.125\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.135\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.145\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.155\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.165\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.175\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.185\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.195\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.205\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.215\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.225\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.235\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.245\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.26\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.28\)/var(--stroke-strong)/g' \
    -e 's/rgba\(255, *255, *255, *0\.32\)/var(--stroke-strong)/g' \
    "$f"
done

echo "Pass2 done: ${#FILES[@]} files processed"
