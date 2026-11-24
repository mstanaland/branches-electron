#!/bin/sh
# Renders build/Branches.icon (Icon Composer) to resources/icon.png, the Dock icon `pnpm dev`
# uses. Packaged builds don't need this: electron-builder compiles the .icon itself.
# Needs Xcode 26 or later for actool. Rerun after changing the icon.
set -eu
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cp -R build/Branches.icon "$tmp/Icon.icon"
mkdir "$tmp/out"
xcrun actool "$tmp/Icon.icon" \
  --compile "$tmp/out" \
  --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$tmp/out/info.plist" \
  --app-icon Icon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx >/dev/null

# actool's icns doesn't always carry every size, so take the largest one it has.
iconutil -c iconset "$tmp/out/Icon.icns" -o "$tmp/Icon.iconset"
for name in 512x512@2x 512x512 256x256@2x 256x256 128x128@2x 128x128; do
  if [ -f "$tmp/Icon.iconset/icon_$name.png" ]; then
    cp "$tmp/Icon.iconset/icon_$name.png" resources/icon.png
    echo "Wrote resources/icon.png (from icon_$name)"
    exit 0
  fi
done

echo "No usable size in the compiled icns. It contained:" >&2
ls "$tmp/Icon.iconset" >&2
exit 1
