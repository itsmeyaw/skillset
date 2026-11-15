#!/bin/sh
# Builds assets/linkedin/skillset-linkedin.mp4 (1920x1080). Needs vhs, ffmpeg, Google Chrome, network.
set -eu
cd "$(dirname "$0")/../.."
pnpm build
vhs assets/linkedin/demo.tape
frame=/tmp/skillset-linkedin-frame.png
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --window-size=1920,1080 --screenshot="$frame" "file://$PWD/assets/linkedin/frame.svg"
term=assets/linkedin/term.mp4
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$term")
ffmpeg -y -loglevel error -loop 1 -framerate 30 -i "$frame" -i "$term" \
  -filter_complex "[0][1]overlay=790:178:shortest=1,fade=in:d=0.5,fade=out:st=$(echo "$dur - 0.6" | bc):d=0.6,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow -r 30 -movflags +faststart assets/linkedin/skillset-linkedin.mp4
rm "$term"
echo assets/linkedin/skillset-linkedin.mp4
