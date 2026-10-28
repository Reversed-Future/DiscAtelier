"""Validate the encoded film, background audio and caption-free frames."""
from pathlib import Path
import json
import hashlib
import subprocess
import wave
import cv2
import imageio_ffmpeg
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/product-launch'
video=ROOT/'docs/site/assets/discatelier-introduction.mp4'
reader=cv2.VideoCapture(str(video))
assert reader.isOpened()
width,height,fps,count=[reader.get(key) for key in [cv2.CAP_PROP_FRAME_WIDTH,cv2.CAP_PROP_FRAME_HEIGHT,cv2.CAP_PROP_FPS,cv2.CAP_PROP_FRAME_COUNT]]
assert (width,height,fps,count)==(1920.,1080.,30.,5400.)
timeline=json.loads((OUT/'timeline.json').read_text(encoding='utf8'))
assert len(timeline)==18
assert abs(timeline[-1]['end']-180)<.002
checks=[]
for scene in timeline:
    means=[]
    frames=[]
    for seconds in [scene['start']+.2,scene['start']+1.9,scene['start']+scene['duration']*.7]:
        reader.set(cv2.CAP_PROP_POS_MSEC,seconds*1000)
        ok,frame=reader.read()
        assert ok
        means.append(float(frame.mean()))
        frames.append(frame)
    difference=float(np.mean(np.abs(frames[0].astype(float)-frames[1].astype(float))))
    assert difference>.5,scene['id']
    assert means[2]>9,scene['id']
    checks.append({'scene':scene['id'],'readableFrameMean':means[2],'entranceFrameDifference':difference})
reader.release()
probe=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-i',str(video),'-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace')
assert probe.returncode==0,probe.stderr
assert 'Audio: aac' in probe.stderr
assert 'Video: h264' in probe.stderr
assert 'Subtitle:' not in probe.stderr
audio_report=json.loads((OUT/'audio-verification.json').read_text(encoding='utf8'))
assert audio_report['voice'] is False and audio_report['captions'] is False
decoded=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(video),'-vn','-ac','1','-ar','44100','-f','f32le','pipe:1'],capture_output=True,check=True)
encoded_audio=np.frombuffer(decoded.stdout,np.float32)
with wave.open(str(OUT/'background-only.wav'),'rb') as source:
    expected_audio=np.frombuffer(source.readframes(source.getnframes()),np.int16).astype(np.float32)/32768
length=min(len(encoded_audio),len(expected_audio))
correlation=float(np.corrcoef(encoded_audio[:length:10],expected_audio[:length:10])[0,1])
assert correlation>.99,correlation
report={'file':str(video.relative_to(ROOT)),'width':width,'height':height,'fps':fps,'frames':count,'seconds':count/fps,'bytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'audio':'AAC, original background pad only; no voiceover','backgroundAudioCorrelation':correlation,'captions':False,'decodeAllFrames':True,'chapters':checks}
(OUT/'film-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='chapters'},ensure_ascii=False))
