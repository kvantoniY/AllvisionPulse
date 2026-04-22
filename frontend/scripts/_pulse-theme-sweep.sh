#!/usr/bin/env bash
# One-off sweep: convert white-on-dark CSS patterns to warm-brown-on-light.
# Skips media viewers where dark backdrop is intentional.
set -euo pipefail

ROOT="${1:-c:/Allvision-Pulse/frontend/src}"

mapfile -t FILES < <(find "$ROOT" -type f -name '*.module.css' \
  ! -path '*/Lightbox/*' \
  ! -path '*/CallOverlay*' \
  ! -path '*/callUi*' \
  ! -path '*/PulseScene*' \
  ! -name 'GameSessionPanel.module.css.bak')

for f in "${FILES[@]}"; do
  # Backgrounds / borders (subtle to strong) — convert white-alpha to var tokens
  sed -i \
    -e 's/rgba(255, *255, *255, *0\.018)/var(--surface-0)/g' \
    -e 's/rgba(255, *255, *255, *0\.02)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.025)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.03)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.032)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.035)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.04)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.045)/var(--surface-1)/g' \
    -e 's/rgba(255, *255, *255, *0\.05)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.052)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.055)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.06)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.065)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.07)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.075)/var(--surface-2)/g' \
    -e 's/rgba(255, *255, *255, *0\.08)/var(--stroke)/g' \
    -e 's/rgba(255, *255, *255, *0\.09)/var(--stroke)/g' \
    -e 's/rgba(255, *255, *255, *0\.10)/var(--stroke)/g' \
    -e 's/rgba(255, *255, *255, *0\.1)/var(--stroke)/g' \
    -e 's/rgba(255, *255, *255, *0\.11)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.12)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.13)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.14)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.16)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.18)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.20)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.22)/var(--stroke-strong)/g' \
    -e 's/rgba(255, *255, *255, *0\.24)/var(--stroke-strong)/g' \
    "$f"

  # Text colors that were white-alpha → brown ink tokens
  sed -i \
    -e 's/color: *rgba(255, *255, *255, *0\.34)/color: var(--muted-2)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.38)/color: var(--muted-2)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.42)/color: var(--muted-2)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.46)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.48)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.5)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.52)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.56)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.6)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.62)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.64)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.66)/color: var(--muted)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.7)/color: var(--text-soft)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.72)/color: var(--text-soft)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.78)/color: var(--text-soft)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.8)/color: var(--text-soft)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.82)/color: var(--text-soft)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.86)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.88)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.9)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.92)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.94)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.96)/color: var(--text)/g' \
    -e 's/color: *rgba(255, *255, *255, *0\.98)/color: var(--text)/g' \
    "$f"

  # Old global #141414 surfaces
  sed -i \
    -e 's/#141414/var(--bg)/g' \
    -e 's/#0e0e10/var(--bg)/g' \
    -e 's/#1d1d1e/var(--panel)/g' \
    -e 's/#1a1a1a/var(--panel)/g' \
    -e 's/#0e1014/var(--bg)/g' \
    -e 's/#0a0c10/var(--bg)/g' \
    "$f"

  # Common dark gradient overlay tints → soft warm panel
  sed -i \
    -e 's/rgba(20, *20, *20, *0\.86)/rgba(54, 39, 23, 0.42)/g' \
    -e 's/rgba(20, *20, *20, *0\.88)/rgba(54, 39, 23, 0.42)/g' \
    -e 's/rgba(20, *20, *20, *0\.92)/var(--panel)/g' \
    "$f"
done

echo "Done: ${#FILES[@]} files processed"
