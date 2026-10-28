"""Local product preview with byte-range support for video chapter seeking."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import re

ROOT=Path(__file__).resolve().parents[2]/'docs/site'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)

    def send_head(self):
        path=Path(self.translate_path(self.path))
        self.byte_range=None
        header=self.headers.get('Range')
        if not header or not path.is_file():
            return super().send_head()
        match=re.fullmatch(r'bytes=(\d*)-(\d*)',header.strip())
        size=path.stat().st_size
        if not match or not any(match.groups()):
            self.send_error(416)
            return None
        first,last=match.groups()
        start=int(first) if first else max(0,size-int(last))
        end=min(int(last),size-1) if first and last else size-1
        if start>end or start>=size:
            self.send_response(416)
            self.send_header('Content-Range',f'bytes */{size}')
            self.end_headers()
            return None
        file=path.open('rb')
        file.seek(start)
        self.send_response(206)
        self.send_header('Content-Type',self.guess_type(str(path)))
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length',str(end-start+1))
        self.end_headers()
        self.byte_range=(start,end)
        return file

    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()

    def copyfile(self,source,output):
        try:
            if self.byte_range is None:
                return super().copyfile(source,output)
            remaining=self.byte_range[1]-self.byte_range[0]+1
            while remaining>0:
                block=source.read(min(65536,remaining))
                if not block:
                    break
                output.write(block)
                remaining-=len(block)
        except (ConnectionResetError,BrokenPipeError,ConnectionAbortedError):
            pass


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=7645)
    args=parser.parse_args()
    print(f'Product preview: http://127.0.0.1:{args.port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
