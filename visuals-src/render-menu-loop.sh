#!/bin/sh
# Original Buzzer loop, rendered solely from the project's existing generated illustration.
# Eight-second periodic path: starts and ends at the same camera position, without a cut.
set -eu
ffmpeg -hide_banner -loglevel error -y -loop 1 -i public/assets/quiz-night-generated.jpg -t 8 -vf "scale=1600:-1,crop=1280:720:x='160+70*sin(2*PI*t/8)':y='500+25*cos(2*PI*t/8)',eq=saturation=0.55:brightness=-0.12:contrast=1.04,fps=24,format=yuv420p" -an -c:v libvpx-vp9 -crf 40 -b:v 0 public/assets/menu-loop.webm
ffmpeg -hide_banner -loglevel error -y -i public/assets/menu-loop.webm -frames:v 1 -q:v 3 public/assets/menu-loop-poster.jpg
