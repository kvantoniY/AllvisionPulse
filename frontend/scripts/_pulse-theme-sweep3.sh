#!/usr/bin/env bash
# Pass 3: Convert remaining "color: rgba(255,255,255,X)" white text patterns
# (left over from dark theme) to warm brown-tone text tokens.
# Skip files where dark surfaces are intentional (lightbox, call ui, pulse game scene).
set -euo pipefail

ROOT="${1:-c:/Allvision-Pulse/frontend/src}"

mapfile -t FILES < <(find "$ROOT" -type f -name '*.module.css' \
  ! -path '*/Lightbox/*' \
  ! -path '*/CallOverlay*' \
  ! -path '*/callUi*' \
  ! -path '*/PulseShareCard/*' \
  ! -path '*/PulseProBadge/*' \
  ! -path '*/pulseGame/*' \
  ! -path '*/games/ui/GameFrame*' \
  ! -name 'GameSessionPanel.module.css.bak')

for f in "${FILES[@]}"; do
  sed -i -E \
    -e 's/color: *rgba\(255, *255, *255, *0\.4[0-9]?\)/color: var(--muted-2)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.5[0-9]?\)/color: var(--muted)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.6[0-9]?\)/color: var(--muted)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.7[0-9]?\)/color: var(--text-soft)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.8[0-9]?\)/color: var(--text-soft)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.9[0-9]?\)/color: var(--text)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.3[0-9]?\)/color: var(--muted-2)/g' \
    -e 's/color: *rgba\(255, *255, *255, *0\.2[0-9]?\)/color: var(--muted-2)/g' \
    "$f"
done

echo "Pass3 done: ${#FILES[@]} files processed"
