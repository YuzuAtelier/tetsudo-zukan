# -*- coding: utf-8 -*-
"""refs/route-map-2026-04.pdf から駅名を抽出して refs/map-station-names.txt を書く。
   PDFの構造上の注意:
     - 縦書きラベルは1文字＝1lineに分解されている → x座標でつなぎ直す
     - 1つの駅名が2行に分かれている（行送りは5.2〜6.0ptの固定値）→ つなぐ
     - 隣り合う複数の駅名が1つのspanとして描かれている場合がある
       （文字送りが1.1emを超えるところが駅名の切れ目）→ 切る
"""
import fitz, sys, collections, re, unicodedata, json, os
sys.stdout.reconfigure(encoding="utf-8")
# このファイルの場所を基準にする（どこに置いても動くように）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "refs", "route-map-2026-04.pdf")
OUT = os.path.join(ROOT, "refs", "map-station-names.txt")
if not os.path.exists(SRC):
    sys.exit("✗ %s が見つかりません。\n"
             "  路線図PDFは著作物のためリポジトリに含めていません。\n"
             "  手元の refs/ に置いてから実行してください。" % SRC)
page = fitz.open(SRC)[0]

# --- 1) span を文字送りで切りながら items に落とす ---
items = []
for b in page.get_text("rawdict")["blocks"]:
    if b["type"] != 0: continue
    for l in b["lines"]:
        dx, dy = l["dir"]
        for s in l["spans"]:
            sz = s["size"]
            cur, prev_a = None, None
            for c in s["chars"]:
                a = c["origin"][0]*dx + c["origin"][1]*dy
                if cur is not None and (a - prev_a) <= 1.10*sz:
                    cur["t"] += c["c"]
                else:
                    if cur and cur["t"].strip(): items.append(cur)
                    cur = {"i": len(items), "t": c["c"], "sz": round(sz, 2), "font": s["font"],
                           "dx": dx, "dy": dy, "ox": c["origin"][0], "oy": c["origin"][1]}
                prev_a = a
            if cur and cur["t"].strip(): items.append(cur)

# --- 2) 縦書きの列を組み直す ---
isv = lambda i: abs(i["dx"]) < 1e-6 and i["dy"] > 0.99
vert = sorted([i for i in items if isv(i)], key=lambda i: (round(i["ox"], 1), i["oy"]))
rest = [i for i in items if not isv(i)]
cols, cur = [], None
for it in vert:
    if cur and abs(it["ox"]-cur["ox"]) < 0.6 and cur["sz"] == it["sz"] \
       and 0.45*cur["sz"] <= (it["oy"]-cur["oy_end"]) <= 1.25*cur["sz"]:
        cur["t"] += it["t"]; cur["oy_end"] = it["oy"]; cur["i"] = min(cur["i"], it["i"])
    else:
        if cur: cols.append(cur)
        cur = dict(it, oy_end=it["oy"])
if cur: cols.append(cur)
items = rest + cols

# --- 3) 2行に分かれた1つのラベルをつなぐ ---
for i in items:
    nx, ny = -i["dy"], i["dx"]
    i["a"] = i["ox"]*i["dx"] + i["oy"]*i["dy"]
    i["c"] = i["ox"]*nx + i["oy"]*ny
    i["a_end"] = i["a"] + i["sz"]*len(i["t"].strip())
parent = list(range(len(items)))
def find(x):
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
by = collections.defaultdict(list)
for idx, i in enumerate(items): by[(round(i["dx"],2), round(i["dy"],2))].append(idx)
merges = []
for idxs in by.values():
    idxs.sort(key=lambda x: (items[x]["c"], items[x]["a"]))
    for p in range(len(idxs)):
        A = items[idxs[p]]
        for q in range(p+1, len(idxs)):
            B = items[idxs[q]]
            gap = B["c"] - A["c"]
            if gap > 6.0: break
            if gap < 5.20 or A["font"] != B["font"]: continue
            if min(A["a_end"],B["a_end"]) - max(A["a"],B["a"]) < min(A["sz"],B["sz"])*0.8: continue
            parent[find(idxs[q])] = find(idxs[p])
            merges.append((A["t"].strip(), B["t"].strip()))
groups = collections.defaultdict(list)
for idx in range(len(items)): groups[find(idx)].append(idx)
labels = []
for g in groups.values():
    g.sort(key=lambda x: (items[x]["c"], items[x]["a"]))
    labels.append({"t": "".join(items[x]["t"] for x in g), "sz": items[g[0]]["sz"],
                   "font": items[g[0]]["font"], "i": min(items[x]["i"] for x in g),
                   "ox": items[g[0]]["ox"], "oy": items[g[0]]["oy"]})
labels.sort(key=lambda l: l["i"])

# --- 4) 駅名だけ残す ---
# CJK互換漢字（蓮 U+F999 など）を通常の文字に寄せるため NFC 正規化する
# 資料とデータで字体が割れる文字を寄せる（利用者の指示で 麹町 に統一）
FOLD = {chr(0x9EB4): chr(0x9EB9)}   # 麴(旧字) -> 麹(新字)
def norm(s):
    s = unicodedata.normalize("NFC", re.sub(r"[\s　]+", "", s))
    s = "".join(FOLD.get(c, c) for c in s)
    return re.sub(r"[（(]臨[）)]$", "", s)   # 臨時駅の注記は駅名に含めない
FRAG_DROP = {"空港第", "ビル", "2", "鹿島サッカー", "スタジアム（臨）"}
EXTRA = ["空港第2ビル", "鹿島サッカースタジアム"]
FACILITY_62 = {"東京国際空港", "（羽田空港）", "成田", "国際空港"}
COORD = {}
def keep(l, t):
    if not t: return False
    if "DeBold" in l["font"]: return False
    if not l["font"].startswith("UDShinGo"): return False
    if not (4.7 <= l["sz"] <= 6.3): return False
    if t.startswith("至") or t == "＊": return False
    if "現在" in t or "ご利用" in t: return False
    if l["sz"] == 6.2 and t in FACILITY_62: return False
    return True

names = []
for l in labels:
    t = norm(l["t"])
    if not keep(l, t): continue
    COORD.setdefault(t, []).append([round(l["ox"], 1), round(l["oy"], 1)])
    if t in FRAG_DROP: continue
    names.append(t)
names += EXTRA
# 手作業で結合した駅は、断片のラベル位置をそのまま座標として使う
for whole, frag in (("空港第2ビル", "空港第"), ("鹿島サッカースタジアム", "鹿島サッカー")):
    if frag in COORD: COORD[whole] = COORD[frag]
for frag in FRAG_DROP:
    COORD.pop(frag, None)
seen, uniq = set(), []
for n in names:
    if n not in seen: seen.add(n); uniq.append(n)

HELD = """
# ============================================================
# 判断保留
# ============================================================
#
# --- 除外したもの（上のリストに入れていない） ---
# 至外川 至上総亀山 至下仁田 至中央前橋 至仙台 至会津若松 至南小谷 至原ノ町
# 至三島 至大前 至富士 至小諸 至新潟 至水戸 至沼津 至烏山 至直江津 至福島
# 至茂木 至越後湯沢 至郡山 至金沢 至間藤 至阿字ケ浦 至鹿島神宮
#   → 路線の行き先注記。駅名ではないので除外
# 東京国際空港 / （羽田空港） / 成田国際空港
#   → 空港そのものの名称。対応する駅名は「羽田空港第1〜第3ターミナル」
#      「成田空港」「空港第2ビル」なので、そちらだけを採用した
# 路線名 約220件（銀座線・京成本線 など）
#   → 太字書体（DeBold・5.35pt）でまとめて除外。駅名と書体が明確に分かれている
# 東　京　湾 / 相 模 湾 / 路線図（首都圏エリア）/ 2026年4月1日現在
# ＊関東鉄道では、PASMO・Suica以外のIC乗車券は…
#   → 図のタイトル・注記
#
# --- 入れたが確認してほしいもの ---
# 空港第2ビル
#   → 縦書きの中で「2」だけが横倒しの別要素だったため、手作業で結合した
# 鹿島サッカースタジアム（臨）
#   → 2行の行間が他の駅名より広く自動結合できなかったため、手作業で結合した
# 国際展示場 / 有明
#   → 空港名と同じ6.2ptで組まれているが、位置関係から
#      りんかい線／ゆりかもめ の駅と判断して採用した
# 明治神宮前〈原宿〉 / 押上〈スカイツリー前〉 / 二重橋前〈丸の内〉
#   → 路線図の表記どおり副称ごと入れてある。data側で副称をどう持つか要決定
# 偕楽園(臨) / 鹿島サッカースタジアム（臨）
#   → 「臨」は臨時駅の注記。駅名に含めるか要決定。
#      しかも資料内で半角(臨)と全角（臨）が混在している
# 県 / 寿 / 旭 / 泉 / 柏 / 蕨
#   → 1文字の駅名。位置から実在駅と確認したが、抽出漏れでないか念のため確認してほしい
#
# --- grepするときの注意 ---
# ユーカリが丘 / 万座・鹿沢口 / 元町・中華街 / 中央大学・明星大学 / 大塚・帝京大学
#   → 中黒（・）を含む
# 羽田空港第１・第２ターミナル は全角数字、羽田空港第2ターミナル は半角数字と、
#   資料内で数字の全角/半角がゆれている
#
# --- 資料とデータで字体が違うもの ---
# 麴町（U+9EB4・旧字体）… 路線図はこの字。東京メトロ公式は 麹町（U+9EB9・新字体）。
#   別字なのでNFCでは吸収されない。grepするときは明示的に読み替えること
# 蓮根 / 本蓮沼 … PDF内ではCJK互換漢字 U+F999 で組まれていたため、
#   このファイルではNFC正規化して通常の 蓮（U+84EE）に直してある
"""

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("# 首都圏路線図（2026年4月1日現在）から抽出した駅名一覧\n")
    f.write("# 出典: refs/route-map-2026-04.pdf ／ 出現順・重複除去済み\n")
    f.write("# 用途: 駅名が実在するかの照合のみに使う。駅の並び順の根拠にはならない\n")
    f.write("# 生成: PDFのテキスト抽出（縦書き・2行組・連結spanを補正／NFC正規化済み）\n")
    f.write(f"# 件数: {len(uniq)}\n\n")
    f.write("\n".join(uniq) + "\n")
    f.write(HELD)
COORD_OUT = OUT.replace("map-station-names.txt", "map-station-coords.json")
with open(COORD_OUT, "w", encoding="utf-8", newline='\n') as f:
    json.dump(COORD, f, ensure_ascii=False, indent=0)
print("駅名 %d件 / 座標 %d駅 を書き出しました" % (len(uniq), len(COORD)))
