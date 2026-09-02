# データ構造の仕様

`data/` 配下のJSONの形。ここに書いていないフィールドを勝手に増やさない。

---

## 共通の決めごと

| 項目 | ルール | 理由 |
|---|---|---|
| 文字コード | UTF-8 / 改行LF | — |
| 数字 | **半角に統一** | 路線図では全角半角が混在している（羽田空港第１・第２／第2）。検索が破綻するため寄せる |
| ふりがな | ひらがなのみ。「えき」は付けない | validate.mjs が `/^[ぁ-んー・ゝゞ\s]+$/` で検査する |
| 副称 | `name` に含めず `subName` に分ける | 「明治神宮前〈原宿〉」は表示用の結合であって駅名ではない |
| verified | 人が資料と突き合わせて確認したときだけ `true` | AIは絶対に自分で `true` にしない |

### 駅idの作りかた

ヘボン式ローマ字を英小文字とハイフンで。**事業者公式のローマ字表記をそのまま小文字化する**のが原則。

- 空白は `-` に、`〈〉` の中身は落とす
- 例：`Nishi-nippori` → `nishi-nippori`、`Toranomon Hills` → `toranomon-hills`
- 長音は表記しない（`Tokyo` → `tokyo`）
- 撥音のb/m/p前は公式表記に従う（`Nihombashi` → `nihombashi`、`Shimbashi` → `shimbashi`）
- 同名で別の駅が実在する場合のみ地域や事業者で修飾する（`akasaka-tokyo` / `akasaka-tochigi`）

### 駅マスタの統合ルール

物理的に同じ駅は事業者が違っても1エントリ。名前が違えば別駅。

- 上野（JR・銀座線・日比谷線）→ すべて `ueno`
- 船橋 と 京成船橋 → 別エントリ

---

## data/operators.json

```jsonc
{
  "operators": [
    {
      "id": "tokyo-metro",      // 英小文字とハイフン
      "name": "東京地下鉄",       // 正式社名
      "shortName": "東京メトロ",  // 案内上の呼称。UIではこちらを出す
      "kana": "とうきょうちかてつ"
    }
  ]
}
```

## data/stations.json

駅マスタ。全事業者共通。**路線ファイルはここを参照するだけ。**

```jsonc
{
  "stations": [
    { "id": "shibuya", "name": "渋谷", "kana": "しぶや" },

    // 副称を持つ駅
    {
      "id": "meiji-jingumae",
      "name": "明治神宮前",
      "kana": "めいじじんぐうまえ",
      "subName": "原宿",           // 〈〉の中身。無い駅ではキーごと省く
      "subKana": "はらじゅく"
    }
  ]
}
```

UIでの表示は `subName` があれば `明治神宮前〈原宿〉` と組み立てる。検索は `name` `kana` `subName` `subKana` すべてを対象にする。

## data/lines/{operatorId}--{路線ローマ字}.json

**1路線1ファイル。** ファイル名から `.json` を除いたものが `id` と完全一致すること。

```jsonc
{
  "id": "tokyo-metro--ginza",
  "operatorId": "tokyo-metro",     // operators.json に実在必須
  "name": "銀座線",                 // 案内上の路線名
  "formalName": "東京メトロ銀座線",  // 正式名
  "kana": "ぎんざせん",
  "symbol": "G",                   // 路線記号。ナンバリングの接頭辞と一致させる
  "color": "#FF9500",              // #RRGGBB 大文字
  "colorName": "オレンジ",          // 事業者が公表しているカラー名
  "verified": false,
  "source": [                      // 何を根拠にこの順序にしたか
    "https://www.tokyometro.jp/station/line_ginza/index.html"
  ],
  "stations": [
    { "stationId": "shibuya", "numbering": "G01" },
    { "stationId": "omote-sando", "numbering": "G02" }
  ]
}
```

### stations[] の並び順

**駅ナンバリングの1番側を起点にする。** これが最も曖昧さがない。

ナンバリングが無い路線に限り、路線名の頭側／事業者公式の1番側を起点とし、その判断根拠を `source` に書く。

### 支線の扱い

`stations[]` は一本道の配列なので、**分岐は表現できない。** 支線は別ファイルに分ける。

- 例：丸ノ内線分岐線 → `tokyo-metro--marunouchi-branch.json`
- 分岐駅（中野坂上）は両方のファイルに入れる。これで乗換駅として正しく繋がる
- 一方、千代田線の綾瀬〜北綾瀬は C19→C20 と連番で一本道なので本線ファイルに含める

---

## 後から足すもの（フェーズ2以降）

- `stations[].transferNote` … 「同一駅だが改札外乗換」などの注記
- 駅の緯度経度
- 路線の営業キロ

## 検証

```bash
node tools/validate.mjs
```

エラー0を確認してから完了とする。警告（同名で複数id・どの路線にも属さない駅）は内容を読んで判断する。
