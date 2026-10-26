"""Decode embedded images and check the documented DiscAtelier 0.2.0 budgets."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    args = parser.parse_args()
    try:
        from PIL import Image
    except ImportError:
        parser.error('Pillow is required for actual image decoding; install it before running this check.')
    if args.package.stat().st_size > 50 * 1024**2:
        raise ValueError('Package exceeds 50 MiB')
    raw = args.package.read_bytes()
    model = json.loads(raw.decode('utf-8'))
    if model['format'] != 'atelier-interactive-model' or model['version'] not in (2, 3):
        raise ValueError('Only DiscAtelier V2/V3 data packages are supported')
    rows = [('cover', model['cover'])]
    table = model['scene']['textures'] if model['version'] == 2 else model['images']
    rows.extend((row['id'], row['image']) for row in table)
    total = 0
    results = []
    for label, uri in rows:
        if not isinstance(uri, str) or len(uri) > 16 * 1024**2:
            raise ValueError(f'{label}: image URI exceeds budget')
        header, encoded = uri.split(',', 1)
        formats = {'data:image/png;base64': 'PNG', 'data:image/webp;base64': 'WEBP'}
        if header not in formats:
            raise ValueError(f'{label}: expected embedded PNG/WebP')
        data = base64.b64decode(encoded, validate=True)
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as im:
                if im.format != formats[header]:
                    raise ValueError(f'{label}: MIME does not match image bytes')
                w, h = im.size
                if not 0 < w <= 8192 or not 0 < h <= 8192:
                    raise ValueError(f'{label}: image dimensions exceed 8192')
                # Conservative authoring budget; Rust decoder allocations may differ.
                if w * h * 4 > 128 * 1024**2:
                    raise ValueError(f'{label}: conservative RGBA decode budget exceeds 128 MiB')
                total += w * h
                if total > 192 * 1024**2:
                    raise ValueError('Combined image pixels exceed 192 Mi pixels')
                im.load()
                results.append({'id': label, 'width': w, 'height': h})
    print(json.dumps({'file': str(args.package.resolve()), 'sha256': hashlib.sha256(raw).hexdigest(),
                      'images': results, 'totalPixels': total, 'imagesDecoded': True,
                      'nativeImportVerified': False, 'note': 'Pillow preflight, not Rust import validation'},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
