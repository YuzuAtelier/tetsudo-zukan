# 首都圏てつどうずかん

子どもと一緒に、首都圏の駅と路線を調べるアプリ。

**公開URL： https://yuzuatelier.github.io/tetsudo-zukan/**

スマホで開いて「ホーム画面に追加」（iPhone）または「アプリをインストール」（Android）すると、
アイコンから起動でき、オフラインでも使えます。

> **これは非公式の資料です。** 鉄道各社とは一切関係ありません。
> 各鉄道事業者の公式サイトおよびWikipediaを参照して個人が作成したものです。
> 実際のご利用にあたっては、必ず各鉄道会社の公式情報をご確認ください。

- ① 路線を選ぶと、駅が起点から順に並ぶ（駅番号と路線カラーつき）
- ② 駅名・ふりがな・路線記号・駅番号・列車名で検索できる
- ③ 駅を選ぶと、その駅につながる全路線がわかる
- ④ 歩いて乗り換えられる駅（上野⇔京成上野 など）もつながる
- ⑤ 新幹線は列車ごと（のぞみ・はやぶさ など）の停車駅も見られる

駅名はすべて **漢字＋ひらがな** で表示する。子どもが漢字を読めなくても使えるようにするため。

**全179路線／2,254駅を収録（全国の新幹線10路線を含む）。**
最終目標だった `refs/route-map-2026-04.pdf` 掲載路線の網羅は、地方私鉄・三セクを含めほぼ達成。

## 使いかた

```bash
node tools/build-app.mjs
```

`app/index.html` ができる。**ダブルクリックで開けばそのまま動く**（データを埋め込んだHTML1枚）。

`data/` を直したら、必ずこのコマンドを流し直すこと。

## データを検証する

```bash
node tools/validate.mjs
```

こう出れば正常。

```
路線数        : 179（未検証 0）
駅数          : 2254
乗換駅        : 322
✓ エラーなし
```

`⚠ 駅番号の記号が路線記号と違う: M06` の警告は、丸ノ内線分岐線に本線側の
中野坂上が入っているためで、意図どおり。

## フォルダ構成

```
010_railway/
├── README.md                 このファイル
├── .gitignore                refs/ の資料をGit管理外にする
├── CLAUDE.md                 Claude Code 向けの絶対ルール
├── LICENSE                   コードはMIT／データはCC BY 4.0
├── .github/workflows/        push すると app/ を Pages に配信する設定
├── app/                      生成物。ここだけが公開URLになる
│   ├── index.html            単体で開けるアプリ本体
│   ├── manifest.webmanifest  ホーム画面に追加するための設定
│   ├── sw.js                 オフライン用（tools/sw-template.js から生成）
│   └── icon-*.png            アイコン（tools/make-icons.py で自前描画）
├── data/
│   ├── operators.json        事業者マスタ（50事業者）
│   ├── stations.json         駅マスタ（2,254駅）
│   ├── transfers.json        駅名は違うが歩いて乗り換えられる駅の組（120組）
│   ├── trains.json           新幹線の列車と停車駅（のぞみ・はやぶさ など19本）
│   └── lines/                路線179本（1路線1ファイル）
├── refs/                     参照資料（Git管理外・配布しない）
│   ├── README.md             各資料の使い分け
│   ├── route-map-2026-04.pdf
│   ├── route-map-legend.jpg
│   ├── jr-numbering-symbols.png
│   ├── map-station-names.txt PDFから抽出した駅名1,864件（照合用）
│   └── map-station-coords.json  同・駅ラベルの座標（並び順の検査用）
├── docs/
│   ├── DATA_SCHEMA.md        データ構造の仕様
│   ├── DECISIONS.md          なぜそうしたかの記録
│   ├── LINE_CHECKLIST.md     路線ごとの進捗表と要確認メモ
│   └── LINE_DETAIL.md        全路線の記号・カラー・駅数の一覧
└── tools/
    ├── validate.mjs          データ整合性チェッカー（壊れていないか）
    ├── audit.mjs             データの粗探し（壊れてはいないが怪しい箇所）
    ├── check-order.mjs       並び順を路線図の座標と突き合わせる検査
    ├── extract-map-refs.py   路線図PDF → refs/map-station-names.txt と map-station-coords.json
    ├── app-template.html     アプリのUIソース（ここを直す）
    ├── sw-template.js        Service Workerのソース（app/sw.js は生成物）
    ├── make-icons.py         アイコンを図形から描く
    └── build-app.mjs         テンプレ＋データ → app/index.html と app/sw.js
```

アプリの見た目や動きを変えるときは `tools/app-template.html` を直す。
`app/index.html` は生成物なので直接編集しない。

## この設計の要点

駅マスタは事業者をまたいで統合してある。上野（銀座線・日比谷線）はどちらも `ueno`。
だから「駅を選ぶ → つながる全路線」がデータを足すだけで自動的に成立する。

`validate.mjs` の「乗換駅」の数が、路線を足すたびに増えていくのを確認するとよい。
現在は322駅が2路線以上につながっている（東京駅は11路線、渋谷は9路線）。

## データの粗探し

```bash
node tools/audit.mjs
```

`validate.mjs` が「壊れていないか」を見るのに対し、こちらは
**「壊れてはいないが、たぶん間違っている」**を探す。

- 駅名もふりがなも同じなのに別idになっている駅（統合し忘れ）
- 駅番号が単調でない／降順になっている路線
- 駅の並びが完全に同じ／逆順で同じ路線（二重登録）
- `verified` なのに `verifiedNote` が無い路線
- どの路線にも属さない駅
- 路線図に描かれていない駅の数（路線ごと）

出たものが必ずしも誤りとは限らない。1件ずつ中身を見て判断すること。

## 並び順の検査

```bash
node tools/check-order.mjs
```

路線図PDFから拾った駅ラベルの座標と、`data/lines/*.json` の並び順を突き合わせる。
順序が逆かもしれない箇所や、距離が不自然に飛ぶ箇所を指摘する。

**これは並び順の証明ではない。** ラベルは駅の点そのものではなく少しずれた位置にあるので
誤検知も出る。指摘が出たら1件ずつ中身を見て判断すること。

## 注意

全179路線が `verified: true` にしてある。
何をどう確かめたかは各路線ファイルの `verifiedNote` と
`docs/LINE_CHECKLIST.md` に書いてある。

路線図PDFは「駅名が実在するか」の照合には使えるが、**それだけでは並び順の根拠にならない**。
新しい路線を足したときは、事業者公式との照合・座標検査・人の目、の3つを通すこと。

`refs/` の資料は鉄道会社・第三者が作成したもの。
`.gitignore` でGit管理外にしてある。公開リポジトリに含めないこと。

**そのため、このリポジトリをクローンしても `audit.mjs` と `check-order.mjs` は動きません**
（`refs/` のファイルを読むため）。`validate.mjs` と `build-app.mjs` は動きます。

## 出典

- 各鉄道事業者の公式サイト（駅の並び順・正式名称・駅番号・ローマ字表記）
- Wikipedia 日本語版・英語版（裏取り。単独の根拠にはしていない）
- 路線カラー： <https://www.marorika.com/entry/tokyo-metro-line-color-code> ／
  <https://ayaito.net/webtips/color_code/164/> ／ <https://ayaito.net/webtips/color_code/12224/>

鉄道会社のロゴ画像は使用していない。路線記号はすべてCSS/SVGで自前描画している。
アイコンも `tools/make-icons.py` で図形から描き起こしたもの。

## ライセンス

- ソースコード（`tools/` `app/` `.github/`）： MIT
- データ（`data/`）： CC BY 4.0

詳しくは [LICENSE](LICENSE) を参照。

## 公開のしくみ

`main` に push すると GitHub Actions が動き、`app/` フォルダだけが
GitHub Pages に配信される（`.github/workflows/pages.yml`）。
ワークフローの中で `validate.mjs` と `build-app.mjs` を流すので、
手元でのビルド忘れがあっても公開されるものは常に最新になる。
