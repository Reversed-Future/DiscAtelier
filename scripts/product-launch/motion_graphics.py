"""Reusable 1080p graphic layers for the DiscAtelier product film."""
from pathlib import Path
import math
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'docs/site/assets'
W, H = 1920, 1080
PAPER = (242, 240, 233)
INK = (17, 17, 16)
MUTED = (151, 151, 141)
FONT = ROOT / 'apps/desktop/src/assets/fonts/MiSans-Regular.otf'


def font(size):
    return ImageFont.truetype(str(FONT), size)


def lines(text, size, width):
    result, current = [], ''
    face = font(size)
    for char in text:
        if char == '\n' or (current and face.getlength(current + char) > width):
            result.append(current)
            current = '' if char == '\n' else char
        else:
            current += char
    if current:
        result.append(current)
    return result


def text_image(text, size=32, color=PAPER, width=1600, spacing=1.35):
    rows = lines(text, size, width)
    image = Image.new('RGBA', (width, int(len(rows) * size * spacing + 15)), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(rows):
        draw.text((0, index * size * spacing), line, font=font(size), fill=(*color, 255))
    return np.asarray(image).copy()


def card(title, body, width=380, height=185, light=False, small=False):
    bg, fg, dim = (PAPER, INK, (91, 91, 82)) if light else ((25, 25, 23), PAPER, MUTED)
    image = Image.new('RGBA', (width, height), (*bg, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width-1, height-1), outline=(*dim, 255), width=1)
    draw.text((28, 24), title, font=font(25 if small else 30), fill=(*fg, 255))
    draw.line((28, 79, width-28, 79), fill=(*dim, 255), width=1)
    for i, line in enumerate(lines(body, 20, width-56)):
        draw.text((28, 99 + i * 31), line, font=font(20), fill=(*dim, 255))
    return np.asarray(image).copy()


def image_layer(name, width, height):
    source = Image.open(ASSETS / f'{name}.webp').convert('RGBA')
    if name == 'optical':
        source = source.crop((420, 150, 1380, 820))
    source.thumbnail((width, height), Image.Resampling.LANCZOS)
    image = Image.new('RGBA', (width, height), (10, 10, 9, 255))
    image.alpha_composite(source, ((width-source.width)//2, (height-source.height)//2))
    ImageDraw.Draw(image).rectangle((0, 0, width-1, height-1), outline=(60, 60, 54, 255))
    return np.asarray(image).copy()


def paste(frame, layer, x, y, opacity=1):
    x, y = int(x), int(y)
    h, w = layer.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x+w), min(H, y+h)
    if x1 <= x0 or y1 <= y0 or opacity <= 0:
        return
    crop = layer[y0-y:y1-y, x0-x:x1-x]
    if opacity >= .999 and np.all(crop[:, :, 3] == 255):
        frame[y0:y1, x0:x1] = crop[:, :, :3]
        return
    alpha = crop[:, :, 3:4].astype(np.float32) * (opacity / 255)
    roi = frame[y0:y1, x0:x1]
    roi[:] = crop[:, :, :3] * alpha + roi * (1-alpha)


def ease(t):
    # Exact cubic-bezier(.23,1,.32,1), shared with the website/app entrance curve.
    x = max(0, min(1, t))
    lo, hi = 0., 1.
    for _ in range(12):
        u = (lo+hi)/2
        bx = 3*(1-u)**2*u*.23 + 3*(1-u)*u*u*.32 + u**3
        if bx < x:
            lo = u
        else:
            hi = u
    return 1 - (1-(lo+hi)/2)**3


class Scene:
    def __init__(self, story, number):
        self.story, self.number = story, number
        self.layers = []
        self.kind = story['kind']
        self.light = self.kind in ('editions', 'discs', 'phone', 'backup')
        self.bg, self.fg, self.dim = (PAPER, INK, (100, 100, 91)) if self.light else (INK, PAPER, MUTED)
        self.base = np.full((H, W, 3), self.bg, np.uint8)
        cv2.line(self.base, (80, 116), (1840, 116), self.dim, 1)
        paste(self.base, text_image(story['chapter'], 20, self.dim), 80, 58)
        paste(self.base, text_image(f'{number:02d} / 18', 17, self.dim, 150), 1720, 62)
        paste(self.base, text_image('DiscAtelier.', 20, self.dim, 260), 80, 1020)
        self.label = '软件实机画面' if self.kind == 'screen' and story['image'] not in ('editor','player') else '应用界面 · 示例资料' if self.kind == 'screen' else '功能流程示意'
        if self.kind == 'model':
            self.label = '模型实机画面局部 / 动作以模型定义为准'
        if self.kind in ('intro', 'outro'):
            self.label = 'Windows x64 / 开源影音收藏应用'
        paste(self.base, text_image(self.label, 16, self.dim, 640), 1220, 1020)
        if self.kind == 'screen':
            self.add(text_image(story['title'], 58, self.fg, 530), 80, 238, .08)
            self.add(image_layer(story['image'], 1140, 740), 700, 170, .2)
            for i, label in enumerate(story['labels']):
                self.add(text_image(f'0{i+1}   {label}', 24, self.dim, 520), 80, 620+i*62, .45+i*.15)
        elif self.kind in ('intro','outro'):
            self.add(text_image(story['title'], 88, self.fg, 1120), 100, 278, .15)
            self.add(text_image('DiscAtelier.', 35, self.fg, 550), 105, 680, .55)
            self.add(text_image(' / '.join(story['labels']), 22, self.dim, 1100), 105, 752, .7)
            if self.kind == 'outro':
                self.add(text_image('github.com/Reversed-Future/DiscAtelier', 23, self.dim, 1100), 105, 830, 1)
        else:
            self.add(text_image(story['title'], 64, self.fg, 1750), 80, 157, .08)
            self.add(text_image('   /   '.join(story['labels']), 24, self.dim, 1700), 80, 263, .22)
            self.diagram()

    def add(self, image, x, y, delay=0):
        self.layers.append((image, x, y, delay))

    def c(self, title, body, x, y, width=420, height=200, delay=0, light=None):
        self.add(card(title, body, width, height, self.light if light is None else light), x, y, delay)

    def diagram(self):
        k = self.kind
        if k == 'editions':
            self.c('发行版本', '条码 / 品番 / 载体 / 发行资料', 100, 435, 510, 210, .3)
            self.c('实体 01', '购入日期 · 价格 · 卖家', 920, 370, 700, 180, .65)
            self.c('实体 02', '状态 · 存放位置 · 备注', 920, 640, 700, 180, .95)
        elif k == 'sources':
            self.c('输入查询信息，或上传包装图片辅助识别', '作品名 / 条码 / 品番 / 分享链接 / 包装图片', 80, 380, 1760, 175, .3)
            for i,(title,body) in enumerate([('Discogs','具体发行与曲目'),('网易云','专辑 / 歌曲 / 封面'),('TMDB','电影 / 电视 / 图库'),('Bangumi','动画 / 章节 / 角色')]):
                self.c(title,body,80+i*450,650,410,185,.65+i*.1)
        elif k == 'discs':
            self.c('同一套实体', '按实体中的分盘顺序连续播放', 80, 450, 450, 220, .3)
            self.c('Disc 1', '独立曲目与盘内小标题', 700, 365, 410, 190, .55)
            self.c('Disc 2', '分别记录曲目与制作人员', 700, 655, 410, 190, .75)
            self.c('网易云专辑 A', '简介 A / 歌曲关联', 1350, 365, 490, 190, .9)
            self.c('网易云专辑 B', '简介 B / 歌曲关联', 1350, 655, 490, 190, 1.1)
        elif k == 'model':
            self.add(image_layer('model', 610, 570), 170, 345, .3)
            self.c('操作盒盖、光盘与书册', '.ateliermodel 支持制作时定义的取放、拆装与翻页', 990, 390, 720, 190, .65)
            self.c('直接导入三维文件', 'GLB / OBJ / FBX · 材质与已有动画', 990, 660, 720, 190, .9)
        elif k == 'queue':
            self.add(image_layer('player', 900, 580), 80, 340, .3)
            for i, title in enumerate(['正在播放的专辑', '上一张专辑', '再上一张专辑']):
                self.c(title, '曲目队列' if i else '音量  /  上一首  /  下一首', 1140+15*i, 350+170*i, 650-30*i, 145, .4+i*.25)
            self.add(text_image('列表循环    ⇄    单曲循环', 29, self.fg, 720), 1140, 890, 1.2)
        elif k == 'lyrics':
            # Text is illustrative UI copy, never represented as licensed song lyrics.
            for i,(line,size) in enumerate([('浏览上一段歌词',27),('当前歌词，随播放进度高亮',42),('有译文时，在下一行一起显示',27),('点击有时间轴的歌词，跳转到这一句',27)]):
                self.add(text_image(line,size,self.fg if i==1 else self.dim,1200),260,400+i*105,.4+i*.16)
            self.add(text_image('系统媒体控制   /   播放 · 暂停 · 切歌 · 进度',24,self.dim,1400),260,870,1)
        elif k == 'parts':
            self.c('后编', '独立作品资料 / 章节 / 图片', 1020, 400, 670, 390, .35)
            self.c('前编', '同一套实体，首页只保留一个收藏', 480, 470, 670, 390, .6, True)
        elif k == 'assistant':
            self.c('对话查询收藏与控制播放', '回复逐步显示，可以继续追问', 90, 390, 570, 205, .35)
            self.c('修改收藏前，展示具体变更', '添加收藏 / 补全资料 / 切换封面', 730, 390, 1090, 205, .6)
            self.c('在界面确认后保存修改', '可以核对哪些字段会改变，再决定是否执行。', 730, 680, 1090, 190, 1, True)
        elif k == 'phone':
            self.c('手机', '扫描条码\n拍照或选择多张截图', 150, 370, 380, 455, .3)
            self.c('电脑 · 与手机连接同一 Wi-Fi', '查找条码对应的版本，或用 AI 识别图片中的资料', 890, 395, 850, 190, .6)
            self.c('选择需要的字段，核对后保存', '可提取购入价格、日期和卖家等信息。', 890, 660, 850, 165, .9)
        elif k == 'purchase':
            for i,(title,body) in enumerate([('想购入','保存计划购买的版本'),('在途','记录已下单、尚未收到的收藏'),('已购入','保存购入价格、日期、卖家和位置')]):
                self.c(title,body,80+i*600,400,560,220,.3+i*.25)
            self.c('原币价格 → 参考换算', '每日汇率 / 分类汇总 / 保留原始购入金额', 80, 720, 1760, 150, 1, True)
        elif k == 'backup':
            for i,(title,body) in enumerate([('本地收藏库','保存收藏资料、封面与模型'),('创建与恢复备份','更新前备份 / 恢复前预览'),('查看备份占用并选择删除','备份不会因发布新版本而自动清理')]):
                self.c(title,body,80+i*600,430,560,250,.3+i*.3)
            self.add(text_image('Windows 凭据管理器     /     启动检查更新，可忽略',29,self.dim,1700),80,790,1.2)

    def connectors(self, frame, t):
        paths=[]
        if self.kind=='editions': paths=[[(610,540),(760,540),(760,460),(920,460)],[(760,540),(760,730),(920,730)]]
        elif self.kind=='discs': paths=[[(530,560),(615,560),(615,460),(700,460)],[(615,560),(615,750),(700,750)],[(1110,460),(1350,460)],[(1110,750),(1350,750)]]
        elif self.kind=='phone': paths=[[(530,590),(890,590)]]
        elif self.kind=='assistant': paths=[[(660,495),(730,495)],[(1275,595),(1275,680)]]
        for i,path in enumerate(paths):
            progress=ease((t-.4-i*.12)/1.1)
            total=sum(math.dist(a,b) for a,b in zip(path,path[1:]))
            remaining=total*progress
            for a,b in zip(path,path[1:]):
                length=math.dist(a,b)
                ratio=min(1,remaining/length)
                if ratio<=0: break
                end=(int(a[0]+(b[0]-a[0])*ratio),int(a[1]+(b[1]-a[1])*ratio))
                cv2.line(frame,a,end,self.dim,2,cv2.LINE_AA)
                remaining-=length
            if t>1.7:
                a,b=path[0],path[-1]
                if len(path)==2:
                    p=((t*.22+i*.2)%1)
                    cv2.circle(frame,(int(a[0]+(b[0]-a[0])*p),int(a[1]+(b[1]-a[1])*p)),5,self.fg,-1,cv2.LINE_AA)

    def render(self,t,duration):
        frame=self.base.copy()
        if self.kind in ('intro','outro'):
            center=(1500,535)
            for radius in range(110,495,17):
                cv2.circle(frame,center,radius,(44,44,39),1,cv2.LINE_AA)
            angle=(t*10)%360
            cv2.ellipse(frame,center,(455,455),angle,0,110,(151,151,139),2,cv2.LINE_AA)
            cv2.circle(frame,center,80,self.dim,1,cv2.LINE_AA)
            cv2.circle(frame,center,12,self.fg,1,cv2.LINE_AA)
        self.connectors(frame,t)
        for layer,x,y,delay in self.layers:
            alpha=ease((t-delay)/.85)
            dx=0
            if self.kind=='parts' and y==470:
                dx=-80*ease(max(0,t-duration*.55)/1.1)
            paste(frame,layer,x+dx,y+30*(1-alpha),alpha)
        return frame
