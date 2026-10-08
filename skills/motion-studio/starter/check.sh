#!/bin/sh
# bash check.sh out/silent.mp4 [t_fast=4.1]   -> contact.png, phone.png, strip.png next to the video
# Then mix:  ffmpeg -i out/silent.mp4 -i out/sfx.wav -af "loudnorm=I=-14,apad" -c:v copy -c:a aac -shortest out/final.mp4
set -e
v="$1"; d=$(dirname "$v"); t="${2:-4.1}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$v")
ffmpeg -y -loglevel error -i "$v" -vf "fps=30/$dur,scale=270:-1,tile=6x5" -frames:v 1 "$d/contact.png" # 30 frames, whole video
ffmpeg -y -loglevel error -i "$v" -vf "fps=1,scale=360:-1,tile=5x3" -frames:v 1 "$d/phone.png"     # reads at 360 px?
ffmpeg -y -loglevel error -ss "$t" -i "$v" -vf "scale=320:-1,tile=12x1" -frames:v 1 "$d/strip.png" # 12 frames: pops, overlaps
ffmpeg -y -loglevel error -i "$v" -frames:v 1 "$d/poster.png"
ffmpeg -y -loglevel error -stream_loop 1 -i "$v" -c copy "$d/loop_check.mp4"                       # watch the seam
echo "$d/contact.png $d/phone.png $d/strip.png $d/poster.png $d/loop_check.mp4"
# Determinism: render twice and compare  ffmpeg -loglevel error -i out/silent.mp4 -f md5 -
