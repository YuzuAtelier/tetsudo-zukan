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

### 環状線（loop）

山手線・大阪環状線のように、最後の駅の次が最初の駅に戻る路線は `"loop": true` を付ける。
駅を2回書かない（最後に最初の駅を足すと validate.mjs が「同じ駅が2回」とエラーにする）。
アプリはこの印を見て、最後の駅の「つぎのえき」を最初の駅にし、路線画面の最後に
「ぐるっと まわって ○○ に もどる」を出す。

大江戸線は「6の字」で全部はつながっていないので付けていない。

### stations[] の並び順

**駅ナンバリングの1番側を起点にする。** これが最も曖昧さがない。

ナンバリングが無い路線に限り、路線名の頭側／事業者公式の1番側を起点とし、その判断根拠を `source` に書く。

### 支線の扱い

`stations[]` は一本道の配列なので、**分岐は表現できない。** 支線は別ファイルに分ける。

- 例：丸ノ内線分岐線 → `tokyo-metro--marunouchi-branch.json`
- 分岐駅（中野坂上）は両方のファイルに入れる。これで乗換駅として正しく繋がる
- 一方、千代田線の綾瀬〜北綾瀬は C19→C20 と連番で一本道なので本線ファイルに含める

---

## data/transfers.json

駅名は違うが、**通路でつながっている・目の前にあるなど、歩いて乗り換えられる駅の組**。
（上野⇔京成上野、町屋⇔町屋駅前、京成関屋⇔牛田 など）
同じ駅名の乗換（上野のJRと銀座線など）は `stations.json` の統合で表すので、ここには書かない。

```json
{
  "stations": ["keisei-sekiya", "ushida"],
  "kind": "near",
  "distanceM": 53,
  "source": ["https://ja.wikipedia.org/wiki/京成関屋駅", "https://ja.wikipedia.org/wiki/牛田駅_(東京都)"]
}
```

| 項目 | 内容 |
|---|---|
| `stations` | 駅idを2つ。順序に意味はない |
| `kind` | `same-facility` 1つの駅施設として扱われている / `passage` 地下通路などで連絡 / `official` 事業者が乗換駅に指定 / `near` 距離が近い |
| `distanceM` | Wikipedia記事の代表地点どうしの**直線距離（目安）**。歩く距離ではない。`same-facility` は0 |
| `source` | 根拠URL（1つ以上） |

採用の基準と経緯は `docs/DECISIONS.md` を参照。

## data/trains.json

新幹線の列車（のぞみ・はやぶさ など）と停車駅。

```json
{
  "id": "nozomi",
  "name": "のぞみ",
  "kana": "のぞみ",
  "lines": ["jr-central--tokaido-shinkansen", "jr-west--sanyo-shinkansen"],
  "stops": [{ "stationId": "tokyo", "stop": "all" }, { "stationId": "himeji", "stop": "some" }]
}
```

| 項目 | 内容 |
|---|---|
| `lines` | その列車が走る路線id。複数路線にまたがる（のぞみは東海道＋山陽） |
| `stops[].stop` | `all` すべての列車がとまる / `some` 一部の列車だけとまる |
| `stops` の並び | `lines` の路線の駅順と同じ向きにする（validate.mjs が検査する） |

**同じ列車名でも1本ごとに停車駅が違う**ので、目安として扱う。

## data/expresses.json

有料の特急（スカイライナー・ロマンスカー・スペーシアX など）と停車駅。
新幹線（trains.json）とちがい、同じ列車名でも**いきさき（variants）ごと**に停車駅を持つ。

```json
{
  "checkedOn": "2026-10-05",
  "links": [{ "stations": ["shin-matsuda", "matsuda"], "note": "小田急と御殿場線の連絡線" }],
  "expresses": [{
    "id": "spacia-x",
    "operatorId": "tobu",
    "name": "スペーシアX",
    "kana": "すぺーしあえっくす",
    "car": "N100系",
    "aliases": ["スペーシアエックス"],
    "source": ["https://www.tobu.co.jp/railway/special_express/stop_station/"],
    "variants": [
      { "lines": ["tobu--skytree", "tobu--nikko"],
        "stops": [{ "stationId": "asakusa", "stop": "all" }, { "stationId": "tobu-nikko", "stop": "all" }] }
    ]
  }]
}
```

| 項目 | 内容 |
|---|---|
| `car` | 車両の愛称・形式（Laview、N100系 など）。画面に出し、検索でも引ける |
| `aliases` | 検索だけに使う別名（「らびゅー」「リバティけごん」など） |
| `source` | 停車駅の根拠URL。会社の公式（時刻表・停車駅案内）を先に書く |
| `variants[].lines` | 走る順に並べた路線id。路線のつなぎ目は両方の路線にある駅で決まる |
| `variants[].stops` | 走る順の停車駅。`all` いつも とまる / `some` ときどき とまる。一部の列車だけの始発・終点も `some`（品川始発のひたち、竜王まで行くかいじ） |
| `variants[].name` / `kana` | いきさきのボタン名を変えたいときだけ（「スーパーはこね」「大船 から」）。`kana` はひらがなの読み。無ければ「終点の駅名 ゆき」 |
| `variants[].continues` | アプリに無い区間へ続くときの行き先（`name` と `kana`）。リバティ会津の会津田島、踊り子の修善寺など。一部の列車だけ続くときは `some: true`（ひたちの仙台） |
| `links` | 駅名がちがう駅どうしを結ぶ線路（新松田〜松田）。同じ駅を持たない路線をつなぐのに使う |

- 向きは東京から出ていく方向にそろえる（片方向しか走らない列車は、今は入れていない）。
- 途中の駅でおわる列車（さがみの本厚木ゆき など）は、別のいきさきにせず停車駅に含めたまま扱う。
- いきさきを分けるのは、道すじが分かれるときだけ（りょうもうの赤城／伊勢崎／葛生、成田エクスプレスの大船から／新宿から）。
- 臨時停車・運転停車（代々木上原など）・臨時列車は入れない。
- 道すじの組み立ては `tools/express-route.mjs`。validate.mjs が、停車駅が走る順に並んでいるかを検査する。

## 後から足すもの（フェーズ2以降）

- `stations[].transferNote` … 「同一駅だが改札外乗換」などの注記
- 駅の緯度経度
- 路線の営業キロ

## 検証

```bash
node tools/validate.mjs
```

エラー0を確認してから完了とする。警告（同名で複数id・どの路線にも属さない駅）は内容を読んで判断する。
