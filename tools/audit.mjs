#!/usr/bin/env node
/**
 * データの粗探し
 *   使い方: node tools/audit.mjs
 *
 * validate.mjs が見るのは「壊れていないか」。
 * こちらは「壊れてはいないが、たぶん間違っている」を探す。
 * 出たものが必ずしも誤りとは限らないので、1件ずつ中身を見て判断すること。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const operators = rd("data/operators.json").operators;
const stations = rd("data/stations.json").stations;
const linesDir = join(root, "data", "lines");
const lines = readdirSync(linesDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => rd(join("data", "lines", f)));

const byId = new Map(stations.map((s) => [s.id, s]));
const findings = [];
const add = (kind, msg) => findings.push({ kind, msg });

// ── 1. 同じ駅を二重に持っていないか ───────────────────────────
const nameKana = new Map();
for (const s of stations) {
  const k = s.name + "／" + s.kana;
  if (!nameKana.has(k)) nameKana.set(k, []);
  nameKana.get(k).push(s.id);
}
for (const [k, ids] of nameKana) {
  if (ids.length > 1) add("重複の疑い", `駅名もふりがなも同じなのに別id: ${k} -> ${ids.join(", ")}`);
}

// 同じ駅名で読みが違う（地域違いなら正常、片方が誤りなら要修正）
const byName = new Map();
for (const s of stations) {
  if (!byName.has(s.name)) byName.set(s.name, []);
  byName.get(s.name).push(s);
}
for (const [n, ss] of byName) {
  if (ss.length > 1) {
    const kanas = [...new Set(ss.map((s) => s.kana))];
    add("同名駅", `${n}: ${ss.map((s) => `${s.id}(${s.kana})`).join(" / ")}` +
      (kanas.length === 1 ? "　※読みも同じ" : ""));
  }
}

// ── 1b. 「ケ／ヶ」など字体だけが違う駅名 ────────────────────
// 事業者ごとに大きいケと小さいヶが割れる。同じ駅を二重に登録していないか見る
const fold = (s) => s
  .replace(/ヶ/g, "ケ").replace(/ケ/g, "ケ")
  .replace(/ッ/g, "ツ").replace(/ノ/g, "ノ")
  .normalize("NFKC");
const byFold = new Map();
for (const s of stations) {
  const k = fold(s.name);
  if (!byFold.has(k)) byFold.set(k, []);
  byFold.get(k).push(s);
}
for (const [, ss] of byFold) {
  const names = [...new Set(ss.map((s) => s.name))];
  if (names.length > 1) {
    add("字体ゆれ", `ケ/ヶ などの字体だけが違う駅名: ${ss.map((s) => `${s.name}(${s.id})`).join(" / ")}`);
  }
}

// ── 2. 駅idの付けかたが揃っているか ─────────────────────────
for (const s of stations) {
  if (/[0-9]$/.test(s.id) && !/^[a-z-]+-[0-9]+$/.test(s.id)) {
    add("id", `末尾が数字の駅id（自動生成の名残かも）: ${s.id} (${s.name})`);
  }
  if (s.id.length < 2) add("id", `短すぎる駅id: ${s.id} (${s.name})`);
}

// ── 3. 駅番号の並び ───────────────────────────────────────
for (const L of lines) {
  const nums = L.stations.map((s) => s.numbering).filter(Boolean);
  if (nums.length && nums.length !== L.stations.length) {
    add("駅番号", `[${L.name}] 駅番号がある駅と無い駅が混在（${nums.length}/${L.stations.length}）`);
  }
  // 同じ記号のあいだで番号が単調か
  const seq = L.stations.map((s) => s.numbering).filter((n) => n && n.startsWith(L.symbol));
  const vals = seq.map((n) => parseInt(n.slice(L.symbol.length), 10));
  const up = vals.every((v, i) => i === 0 || v > vals[i - 1]);
  const down = vals.every((v, i) => i === 0 || v < vals[i - 1]);
  if (vals.length > 2 && !up && !down) {
    add("駅番号", `[${L.name}] 駅番号が単調でない: ${seq.join(" ")}`);
  }
  if (vals.length > 2 && down) {
    add("駅番号", `[${L.name}] 駅番号が降順（起点を01側にする方針と逆）: ${seq[0]} → ${seq[seq.length - 1]}`);
  }
}

// ── 4. 路線の中身 ─────────────────────────────────────────
const seqKey = (L) => L.stations.map((s) => s.stationId).join(">");
const seen = new Map();
for (const L of lines) {
  const k = seqKey(L);
  const rev = L.stations.map((s) => s.stationId).reverse().join(">");
  for (const [kk, name] of seen) {
    if (kk === k) add("重複の疑い", `[${L.name}] ${name} と駅の並びが完全に同じ`);
    if (kk === rev) add("重複の疑い", `[${L.name}] ${name} と駅の並びが逆順で同じ`);
  }
  seen.set(k, L.name);

  if (!/^#[0-9A-F]{6}$/.test(L.color)) add("表記", `[${L.name}] 路線カラーが大文字16進でない: ${L.color}`);
  if (!L.colorName) add("表記", `[${L.name}] colorName が空`);
  if (!L.formalName) add("表記", `[${L.name}] formalName が空`);
  if (L.verified === true && !L.verifiedNote) add("検証", `[${L.name}] verified だが verifiedNote が無い`);
  if (L.verified === true && !L.verifiedOn) add("検証", `[${L.name}] verified だが verifiedOn が無い`);
  if (!operators.some((o) => o.id === L.operatorId)) add("参照", `[${L.name}] 未定義の事業者`);
}

// ── 5. 駅マスタの使われかた ─────────────────────────────────
const used = new Map();
for (const L of lines) for (const s of L.stations) {
  if (!used.has(s.stationId)) used.set(s.stationId, []);
  used.get(s.stationId).push(L.name);
}
for (const s of stations) if (!used.has(s.id)) add("孤立", `どの路線にも属さない駅: ${s.id} (${s.name})`);

// 同じ路線名が2回出てくる駅（＝同じ路線に2回入っている）はvalidate側で検出済み
// ここでは「乗換が多すぎる駅」を目視用に出す
const many = [...used.entries()].filter(([, ls]) => ls.length >= 6)
  .sort((a, b) => b[1].length - a[1].length);

// ── 5b. 別々の駅を1駅に統合していないか ──────────────────────
// 駅名＋ふりがなが同じだと、遠く離れた無関係の駅まで同じidに丸めてしまいやすい。
// 「2つの事業者が、その1駅でしか接していない」箇所を洗い出す。
// 本物の接続駅（五井＝内房線と小湊鐵道 など）も出るので、1件ずつ地図で確かめること。
const opOfLine = new Map(lines.map((L) => [L.name, L.operatorId]));
const opsOfStation = new Map();
for (const L of lines) {
  for (const s of L.stations) {
    if (!opsOfStation.has(s.stationId)) opsOfStation.set(s.stationId, new Set());
    opsOfStation.get(s.stationId).add(L.operatorId);
  }
}
const pairStations = new Map();          // "opA\topB" -> [駅id, ...]
for (const [sid, os] of opsOfStation) {
  const o = [...os].sort();
  for (let i = 0; i < o.length; i++) {
    for (let j = i + 1; j < o.length; j++) {
      const k = o[i] + "\t" + o[j];
      if (!pairStations.has(k)) pairStations.set(k, []);
      pairStations.get(k).push(sid);
    }
  }
}
const opName = new Map(operators.map((o) => [o.id, o.shortName]));
// この検査は地理データが無いと本物の接続駅と誤統合を機械では区別できない。
// そこで 2026-09-02 に全件を人が見て確認し、正しいものを下に控えてある。
// ここに無い駅が出てきたら、それは新しく入り込んだ疑いなので必ず地図で確かめること。
const REVIEWED_JUNCTIONS = new Set([
  // 2026-09-02 確認済み。いずれも実在する接続駅
  "choshi", "fujisawa", "otsuki", "odawara", "katsuta", "higashi-matsudo",
  "shin-kamagaya", "ohara", "kazusa-nakano", "ito", "akagi", "takasaki",
  "tokyo", "shinagawa", "shin-yokohama", "shinjuku", "nishi-funabashi",
  "joetsumyoko", "mabashi", "omiya", "ofuna", "shin-sugita", "yokohama",
  "oimachi", "shimbashi", "shin-kiba", "higashi-kawaguchi", "kiryu",
  "ikebukuro", "goi", "moriya", "kanazawa-hakkei", "higashi-narita",
  "yukarigaoka", "kita-narashino", "chuo-rinkan", "shonandai",
  "akabane-iwabuchi", "tamagawa-josui", "aioi", "tennozu-isle", "shimodate",
]);
let reviewedPairs = 0;
for (const [k, sids] of pairStations) {
  if (sids.length !== 1) continue;       // 2駅以上で接していれば実際に繋がっている
  const [a, b] = k.split("\t");
  const sid = sids[0];
  if (REVIEWED_JUNCTIONS.has(sid)) { reviewedPairs++; continue; }
  add("誤統合の疑い（未確認の接点）",
    `${opName.get(a)} と ${opName.get(b)} は「${byId.get(sid)?.name}」でしか接していない ` +
    `(${sid})　※別の場所の同名駅を1駅にまとめていないか地図で確認`);
}
add("参考", `事業者ペアが1駅だけで接している箇所のうち${reviewedPairs}件は確認済み`);

// ── 6. 路線図との照合 ───────────────────────────────────────
const mapNames = new Set(
  readFileSync(join(root, "refs", "map-station-names.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
const offMap = stations.filter((s) => {
  const full = s.name + (s.subName ? `〈${s.subName}〉` : "");
  return !mapNames.has(s.name) && !mapNames.has(full);
});

// ── 出力 ──────────────────────────────────────────────────
const groups = new Map();
for (const f of findings) {
  if (!groups.has(f.kind)) groups.set(f.kind, []);
  groups.get(f.kind).push(f.msg);
}
console.log("─".repeat(64));
console.log(`路線 ${lines.length} ／ 駅 ${stations.length} ／ 事業者 ${operators.length}`);
console.log("─".repeat(64));
for (const [kind, msgs] of groups) {
  console.log(`\n■ ${kind}（${msgs.length}件）`);
  msgs.forEach((m) => console.log("  - " + m));
}
console.log(`\n■ 路線図に描かれていない駅（${offMap.length}件）`);
const byLine = new Map();
for (const s of offMap) for (const ln of used.get(s.id) ?? ["（どの路線にも無い）"]) {
  if (!byLine.has(ln)) byLine.set(ln, []);
  byLine.get(ln).push(s.name);
}
for (const [ln, ns] of [...byLine].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  - ${ln}: ${ns.length}駅`);
}
console.log(`\n■ 6路線以上が通る駅（${many.length}件）`);
many.forEach(([id, ls]) => console.log(`  - ${byId.get(id).name}: ${ls.length}路線`));
console.log("\n" + "─".repeat(64));
console.log(`指摘 ${findings.length}件（これは「間違いの候補」であって間違いの一覧ではない）`);
