"""Render the 1080p MG film with background audio, without voiceover or captions."""
from pathlib import Path
import argparse
import json
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw
import imageio_ffmpeg
from audio_timeline import prepare
from motion_graphics import Scene, font, PAPER, W, H

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/product-launch'
ASSETS=ROOT/'docs/site/assets'
STORY=json.loads((Path(__file__).parent/'storyboard.json').read_text(encoding='utf8'))
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
parser=argparse.ArgumentParser()
parser.add_argument('--stills-only',action='store_true')
args=parser.parse_args()

timeline,soundtrack=prepare(STORY,OUT,ASSETS)
scenes=[Scene(story,i+1) for i,story in enumerate(STORY)]


def frame_at(seconds):
    index=next((i for i,s in enumerate(timeline) if seconds<s['end']),len(scenes)-1)
    item=timeline[index]
    t=seconds-item['start']
    frame=scenes[index].render(t,item['duration'])
    # Symmetrical cross-dissolve connects chapters while preserving reading time.
    if index>0 and t<.45:
        previous=scenes[index-1].render(timeline[index-1]['duration'],timeline[index-1]['duration'])
        alpha=t/.45
        frame=cv2.addWeighted(previous,1-alpha,frame,alpha,0)
    if seconds<.5:
        frame=(frame*min(1,seconds/.5)).astype(np.uint8)
    if seconds>179.25:
        frame=(frame*max(0,(180-seconds)/.75)).astype(np.uint8)
    cv2.line(frame,(0,H-3),(int(W*seconds/180),H-3),(135,135,126),2)
    return frame


stills=[]
for i,scene in enumerate(timeline):
    frame=frame_at(scene['start']+min(4,scene['duration']*.45))
    file=OUT/f'scene-{i+1:02}-{scene["id"]}.jpg'
    Image.fromarray(frame).save(file,quality=90)
    thumb=Image.fromarray(frame);thumb.thumbnail((480,270));stills.append(thumb)
contact=Image.new('RGB',(1440,6*300),(24,24,22))
draw=ImageDraw.Draw(contact)
for i,image in enumerate(stills):
    x,y=(i%3)*480,(i//3)*300
    contact.paste(image,(x,y))
    draw.text((x+8,y+274),f'{i+1:02}  {STORY[i]["title"].replace(chr(10),"")}',font=font(15),fill=PAPER)
contact.save(OUT/'film-contact.jpg',quality=90)
poster_story={**STORY[0],'chapter':'DiscAtelier 功能介绍','title':'唱片与影碟的\n收藏管理与播放','labels':['版本资料','购入记录','光盘与本地播放']}
poster=Scene(poster_story,1).render(4,9)
Image.fromarray(poster).save(ASSETS/'film-poster.webp',quality=90)
if args.stills_only:
    print('Storyboard frames rendered',flush=True)
    raise SystemExit(0)

target=ASSETS/'discatelier-introduction.mp4'
log=open(OUT/'ffmpeg-render.log','w',encoding='utf8')
command=[FFMPEG,'-hide_banner','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','30','-i','pipe:0','-i',str(soundtrack),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','44100','-movflags','+faststart','-t','180',str(target)]
process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=log,stderr=log)
try:
    for i in range(180*30):
        process.stdin.write(frame_at(i/30).tobytes())
        if i%300==0:
            print(f'Rendered {i//30:3d} / 180 seconds',flush=True)
    process.stdin.close()
    if process.wait()!=0:
        raise RuntimeError('FFmpeg encoding failed; inspect ffmpeg-render.log')
finally:
    log.close()
print(target,flush=True)
