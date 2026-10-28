"""Export the independently downloadable manuscript from the authored scene copy."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
story = json.loads((Path(__file__).parent / 'storyboard.json').read_text(encoding='utf8'))


def clock(seconds):
    value = round(seconds)
    return f'{value//60:02}:{value%60:02}'


parts = ['# DiscAtelier 功能介绍稿',
         '对应视频：3 分钟，18 个章节。此稿供自行录音或后续配音，未嵌入当前视频。时间码用于对照画面，录制时可根据语速调整停顿。']
cursor = 0.
for scene in story:
    end = cursor + scene['durationSeconds']
    title = scene['title'].replace('\n和', '和').replace('\n并', '并').replace('\n', '，')
    parts.extend([f'## {clock(cursor)}—{clock(end)}　{title}', ''.join(scene['voice'])])
    cursor = end
target = ROOT / 'docs/site/assets/introduction-script.md'
target.write_text('\n\n'.join(parts) + '\n', encoding='utf8')
print(target)
