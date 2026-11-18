#!/bin/sh
# Build the bundled macOS notification helper.
#
# macOS ties a notification's icon and its notification-permission entry to the
# sending app bundle, so the dsh icon + system notification sound need this
# helper app rather than osascript or terminal-notifier. It needs the Xcode
# command line tools (clang, sips, iconutil, codesign); packaging does not.
#
# Rebuild after editing main.m or Info.plist and commit the resulting
# resources/dshui-notifier.app.
#
# Usage: sh native/notifier/build.sh   (or: make notifier)
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
icon_png="$root/media/icon.png"
app="$root/resources/dshui-notifier.app"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Build into a staging bundle first: a failure must not leave the committed
# artifact half-written.
staged="$work/dshui-notifier.app"

# Universal (Apple silicon + Intel), ad-hoc signed: the minimum that lets the
# bundle register with Notification Center without a Developer ID.
mkdir -p "$staged/Contents/MacOS" "$staged/Contents/Resources"
clang -fobjc-arc -O2 -Wall -Wextra -Wno-unused-parameter \
  -mmacosx-version-min=11.0 -arch arm64 -arch x86_64 \
  -framework Cocoa -framework UserNotifications \
  -o "$staged/Contents/MacOS/dshui-notifier" "$here/main.m"
cp "$here/Info.plist" "$staged/Contents/Info.plist"

# The SVG source is vector and sips renders it on recent macOS; the 256px PNG
# is the fallback when it does not.
master="$work/master.png"
if ! sips -s format png -z 1024 1024 "$root/media/deepseek-icon.svg" --out "$master" >/dev/null 2>&1; then
  sips -z 1024 1024 "$icon_png" --out "$master" >/dev/null
fi

iconset="$work/dshui.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  doubled=$((size * 2))
  sips -z "$size" "$size" "$master" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  sips -z "$doubled" "$doubled" "$master" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
# iconutil writes its output atomically, so build the icns in the temp
# directory and copy the finished file in.
iconutil -c icns "$iconset" -o "$work/dshui.icns"
cp "$work/dshui.icns" "$staged/Contents/Resources/dshui.icns"

codesign --force --sign - --timestamp=none "$staged"
file "$staged/Contents/MacOS/dshui-notifier"
codesign --verify --verbose=1 "$staged"

# Replace the committed artifact only once everything verified.
rm -rf "$app"
mkdir -p "$root/resources"
cp -R "$staged" "$app"
echo "built $app"
