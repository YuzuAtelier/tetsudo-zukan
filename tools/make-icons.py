# -*- coding: utf-8 -*-
"""ホーム画面用のアイコンを描く。
   使い方: python tools/make-icons.py

   鉄道会社の公式ロゴは使わない（CLAUDE.md の絶対ルール5）。
   ここで図形から自前で描き起こしている。
   大きく描いてから縮小することで、輪郭のギザギザを消している。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "app")

YELLOW = (255, 201, 60)      # 地の色。子どもが見つけやすい黄色
NAVY   = (23, 53, 107)       # 車体
WHITE  = (255, 255, 255)
RED    = (226, 62, 54)       # 車体の帯
GLASS  = (208, 232, 250)     # 窓ガラス
DARK   = (15, 34, 70)        # 足まわり


def draw_icon(size):
    """maskable 対応。中心から半径40%の内側に絵を収め、丸く切られても欠けないようにする"""
    S = 1024
    img = Image.new("RGB", (S, S), YELLOW)
    d = ImageDraw.Draw(img)
    u = lambda v: int(v * S)

    # 車体
    d.rounded_rectangle([u(.26), u(.22), u(.74), u(.78)], radius=u(.13), fill=NAVY)
    # 屋根のふくらみ
    d.rounded_rectangle([u(.30), u(.20), u(.70), u(.34)], radius=u(.06), fill=NAVY)
    # 前面の窓
    d.rounded_rectangle([u(.335), u(.295), u(.665), u(.475)], radius=u(.055), fill=GLASS)
    d.rounded_rectangle([u(.335), u(.295), u(.665), u(.475)], radius=u(.055),
                        outline=WHITE, width=u(.018))
    # 窓の光の反射
    d.polygon([(u(.36), u(.465)), (u(.47), u(.305)), (u(.55), u(.305)), (u(.44), u(.465))],
              fill=(255, 255, 255, 255))
    # 赤い帯
    d.rounded_rectangle([u(.285), u(.515), u(.715), u(.565)], radius=u(.025), fill=RED)
    # ライト2つ
    for cx in (.37, .63):
        d.ellipse([u(cx - .048), u(.615), u(cx + .048), u(.711)], fill=WHITE)
        d.ellipse([u(cx - .028), u(.635), u(cx + .028), u(.691)], fill=(255, 240, 190))
    # 足まわり
    d.rounded_rectangle([u(.31), u(.745), u(.69), u(.80)], radius=u(.022), fill=DARK)
    # レール
    d.rounded_rectangle([u(.20), u(.845), u(.80), u(.875)], radius=u(.015), fill=DARK)
    for cx in (.29, .50, .71):
        d.rounded_rectangle([u(cx - .028), u(.815), u(cx + .028), u(.905)],
                            radius=u(.012), fill=DARK)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(OUTDIR, exist_ok=True)
for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    p = os.path.join(OUTDIR, name)
    draw_icon(size).save(p, "PNG", optimize=True)
    print("  %-24s %5.1f KB" % (name, os.path.getsize(p) / 1024))
print("app/ に書き出しました")
