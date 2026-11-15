#!/usr/bin/env python3
"""生成应用图标(PNG 各尺寸 + Windows .ico + SVG)。用法: python3 tools/make_icons.py"""
import math, os
from PIL import Image, ImageDraw, ImageFilter
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); out = os.path.join(root, 'icons'); os.makedirs(out, exist_ok=True)
S = 2048  # 超采样画布

import numpy as np
def render(maskable=False):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32); u = xx / S; v = yy / S
    # 深色午夜底:对角渐变 + 左上冷光 + 右下暖光
    t = np.clip(u * .4 + v * .6, 0, 1)[..., None]
    c0 = np.array([8, 12, 30], np.float32); c1 = np.array([27, 33, 86], np.float32)
    bg = c0 + (c1 - c0) * t
    def glow(cx, cy, r, col, k):
        d = np.sqrt((u - cx) ** 2 + (v - cy) ** 2) / r; w = np.clip(1 - d, 0, 1) ** 2 * k
        return w[..., None] * np.array(col, np.float32)
    bg = bg + glow(.18, .12, .75, [70, 105, 255], .55) + glow(.92, .95, .7, [255, 170, 90], .22)
    img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('RGBA')
    k = .74 if maskable else 1.0
    cx = cy = S / 2; R = S * .295 * k; w = int(S * .105 * k); box = [cx - R, cy - R, cx + R, cy + R]
    # 环的遮罩:底环(暗)与进度弧(亮,圆头)
    track = Image.new('L', (S, S), 0); ImageDraw.Draw(track).ellipse(box, outline=255, width=w)
    arcm = Image.new('L', (S, S), 0); da = ImageDraw.Draw(arcm); a0, a1 = -90, 200
    da.arc(box, a0, a1, fill=255, width=w); rr = R - w / 2
    for a in (a0, a1):
        x = cx + rr * math.cos(math.radians(a)); y = cy + rr * math.sin(math.radians(a)); da.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    # 角度渐变:冷蓝 → 紫 → 香槟金(沿时间方向)
    dg = (np.degrees(np.arctan2(yy - cy, xx - cx)) + 90) % 360; dg = np.where(dg > 330, dg - 360, dg)      # 从弧的起点连续计角,起点圆头为负值
    ang = np.clip(dg / 290.0, 0, 1)[..., None]
    stops = [(0, (96, 150, 255)), (.5, (176, 132, 255)), (1, (255, 214, 150))]
    col = np.zeros((S, S, 3), np.float32)
    for (p0, c_a), (p1, c_b) in zip(stops, stops[1:]):
        m = ((ang >= p0) & (ang <= p1)); f = (ang - p0) / (p1 - p0)
        col = np.where(m, np.array(c_a, np.float32) + (np.array(c_b, np.float32) - np.array(c_a, np.float32)) * f, col)
    ring = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).convert('RGBA'); ring.putalpha(arcm)
    # 弧的软光晕与外沿高光
    halo = ring.filter(ImageFilter.GaussianBlur(S * .028)); halo.putalpha(halo.split()[3].point(lambda p: int(p * .55)))
    img = Image.alpha_composite(img, halo)
    tr = Image.new('RGBA', (S, S), (255, 255, 255, 0)); tr.putalpha(track.point(lambda p: int(p * .07))); img = Image.alpha_composite(img, tr)
    img = Image.alpha_composite(img, ring)
    inner = Image.new('L', (S, S), 0); ImageDraw.Draw(inner).arc([b + w * .18 for b in box[:2]] + [b - w * .18 for b in box[2:]], a0, a1, fill=255, width=int(w * .16))
    hi = Image.new('RGBA', (S, S), (255, 255, 255, 0)); hi.putalpha(inner.point(lambda p: int(p * .5))); img = Image.alpha_composite(img, hi.filter(ImageFilter.GaussianBlur(S * .002)))
    # 「现在」:发光的金色圆点,位于弧的终点
    nx = cx + rr * math.cos(math.radians(a1)); ny = cy + rr * math.sin(math.radians(a1)); r = w * .62
    og = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(og).ellipse([nx - r * 2.3, ny - r * 2.3, nx + r * 2.3, ny + r * 2.3], fill=(255, 200, 110, 190))
    img = Image.alpha_composite(img, og.filter(ImageFilter.GaussianBlur(r * 1.0)))
    od = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(od)
    d.ellipse([nx - r, ny - r, nx + r, ny + r], fill=(255, 240, 214, 255)); d.ellipse([nx - r * .62, ny - r * .62, nx + r * .62, ny + r * .62], fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, od)
    # 环心:一道细的竖线(日程时间轴的意象)
    cd = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(cd); lw = int(S * .028 * k); lh = R * .62
    d.rounded_rectangle([cx - lw / 2, cy - lh * .55, cx + lw / 2, cy + lh * .55], radius=lw / 2, fill=(255, 255, 255, 235))
    d.ellipse([cx - lw * .95, cy - lh * .55 - lw * .95 - lw * 1.4, cx + lw * .95, cy - lh * .55 + lw * .95 - lw * 1.4], fill=(255, 255, 255, 235)) if False else None
    return img

def rounded(im, r):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=int(im.size[0] * r), fill=255)
    o = Image.new('RGBA', im.size, (0, 0, 0, 0)); o.paste(im, (0, 0), m); return o

full = render(); mk = render(True)
rd = rounded(full, .225)
# 细边:顶部一圈极淡的亮边,增加玻璃质感
rim = Image.new('RGBA', rd.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle([3, 3, rd.size[0] - 4, rd.size[1] - 4], radius=int(rd.size[0] * .225), outline=(255, 255, 255, 46), width=6); rd = Image.alpha_composite(rd, rim)
for n, sz in [('icon-512.png', 512), ('icon-192.png', 192)]: rd.resize((sz, sz), Image.LANCZOS).save(os.path.join(out, n))
full.convert('RGB').resize((180, 180), Image.LANCZOS).save(os.path.join(out, 'apple-touch-icon.png'))   # iOS 自己加圆角
mk.convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'maskable-512.png'))
rd.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, 'icon-1024.png'))
rd.save(os.path.join(out, 'chrono.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
open(os.path.join(out, 'icon.svg'), 'w', encoding='utf-8').write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2646EB"/><stop offset=".6" stop-color="#7A54E8"/><stop offset="1" stop-color="#24BEBE"/></linearGradient></defs><rect width="512" height="512" rx="115" fill="url(#g)"/><circle cx="256" cy="256" r="154" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="38"/><path d="M256 102A154 154 0 1 1 102 256" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round"/><g fill="#fff"><rect x="205" y="222" width="102" height="24" rx="12"/><rect x="205" y="254" width="68" height="24" rx="12" fill-opacity=".84"/><rect x="205" y="286" width="84" height="24" rx="12" fill-opacity=".68"/></g><circle cx="102" cy="256" r="24" fill="#FFC442" stroke="#fff" stroke-width="7"/></svg>''')
print('icons ok')
