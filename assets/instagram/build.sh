#!/bin/sh
# Builds assets/instagram/skillset-story.mp4 (1080x1920, Instagram story). Needs vhs, ffmpeg, Google Chrome, network.
set -eu
cd "$(dirname "$0")/../.."
pnpm build
vhs assets/instagram/demo.tape
frame=/tmp/skillset-story-frame.png
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --window-size=1080,1920 --screenshot="$frame" "file://$PWD/assets/instagram/frame.html"
term=assets/instagram/term.mp4
ffmpeg -y -loglevel error -loop 1 -framerate 30 -i "$frame" -i "$term" \
  -filter_complex "[0][1]overlay=61:669:shortest=1,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -r 30 -movflags +faststart assets/instagram/skillset-story.mp4
rm "$term"
echo assets/instagram/skillset-story.mp4
