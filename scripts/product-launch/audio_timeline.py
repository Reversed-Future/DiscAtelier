"""Build fixed scene timing and an original instrumental pad; never read voice files."""
import json
import wave
import numpy as np


def prepare(story, output, assets, duration=180.):
    rate=44100
    timeline=[]
    cursor=0.
    for scene in story:
        end=cursor+scene['durationSeconds']
        timeline.append({**scene,'start':cursor,'end':end,'duration':scene['durationSeconds']})
        cursor=end
    if abs(cursor-duration)>.002:
        raise ValueError('Scene timing must total 180 seconds.')
    t=np.arange(round(duration*rate),dtype=np.float32)/rate
    track=np.zeros_like(t)
    for index,frequency in enumerate([130.8128,164.8138,195.9977]):
        track+=np.sin(2*np.pi*frequency*t+index)*(.012*(.6+.4*np.sin(2*np.pi*t/24)**2))
    track*=np.minimum(t/3,1)*np.minimum((duration-t)/4,1)
    soundtrack=output/'background-only.wav'
    with wave.open(str(soundtrack),'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(rate)
        audio.writeframes((track*32767).astype(np.int16).tobytes())
    (output/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8')
    (assets/'chapters.json').write_text(json.dumps({s['id']:round(s['start'],3) for s in timeline},indent=2),encoding='utf8')
    (output/'audio-verification.json').write_text(json.dumps({'duration':duration,'voice':False,'captions':False,'source':'Original synthesized sine-pad only; no voice inputs','sampleRate':rate,'peak':float(np.max(np.abs(track))),'rms':float(np.sqrt(np.mean(track**2)))},indent=2),encoding='utf8')
    return timeline,soundtrack
