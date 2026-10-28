"""Prepare website media from existing product captures, without reading user databases."""
from pathlib import Path
from PIL import Image
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/site/assets'
OUT.mkdir(parents=True, exist_ok=True)
sources = {
    'home': 'docs/assets/home.png',
    'detail': 'docs/assets/detail.png',
    'tracks': 'docs/assets/track-actions.png',
    'video': 'artifacts/video-chapters.png',
    'optical': 'docs/assets/optical.png',
    'editor': 'artifacts/product-launch/editor-demo.png',
    'player': 'artifacts/audio-layout-netease-tracks.png',
}
manifest = []
for name, source in sources.items():
    image = Image.open(ROOT / source).convert('RGB')
    image.thumbnail((1920, 1200), Image.Resampling.LANCZOS)
    image.save(OUT / f'{name}.webp', quality=88, method=6)
    manifest.append({'asset': name, 'source': source, 'processing': 'resize and WebP encoding', 'kind': 'application component with sample data' if name in ('player', 'editor') else 'application screenshot'})

# Show the photographed model only; omit its diagnostic collection title and controls.
source = ROOT / 'artifacts/artbook-v4-native-1793184967394/native-inspect.png'
image = Image.open(source).convert('RGB').crop((300, 320, 820, 920))
image.save(OUT / 'model.webp', quality=90, method=6)
manifest.append({'asset': 'model', 'source': str(source.relative_to(ROOT)), 'processing': 'model-only crop (300,320,820,920)', 'kind': 'application screenshot crop'})
for name in ['MiSans-Regular.otf', 'LICENSE.pdf']:
    shutil.copyfile(ROOT / 'apps/desktop/src/assets/fonts' / name, OUT / name)
(ROOT / 'artifacts/product-launch/media-provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
print(f'Prepared {len(manifest)} product images in {OUT}')
