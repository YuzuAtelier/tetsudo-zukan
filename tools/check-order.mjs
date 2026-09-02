#!/usr/bin/env node
/**
 * 駅の並び順を路線図の座標と突き合わせて検査する
 *   使い方: node tools/check-order.mjs [路線id...]
 *
 * refs/map-station-coords.json（tools/extract-coords.py が作る）に入っている
 * 「路線図上での駅ラベルの位置」を使い、data/lines/*.json の並び順が
 * 地図上で破綻していないかを見る。
 *
 * ★ これは並び順が正しいことの証明ではない。
 *   「明らかにおかしい並びなら気づける」という検査でしかない。
 *   ラベルは駅の点そのものではなく少しずれた位置に置かれているし、
 *   路線が入り組んだ場所では誤検知も出る。最後は人が路線図を見ること。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coordsPath = join(root, "refs", "map-station-coords.json");
if (!existsSync(coordsPath)) {
  console.error("✗ refs/map-station-coords.json がありません。");
  console.error("  先に python tools/extract-coords.py を実行してください。");
  process.exit(1);
}
const COORDS = JSON.parse(readFileSync(coordsPath, "utf8"));
const stations = JSON.parse(readFileSync(join(root, "data", "stations.json"), "utf8")).stations;
const byId = new Map(stations.map((s) => [s.id, s]));

const linesDir = join(root, "data", "lines");
let files = readdirSync(linesDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const argv = process.argv.slice(2);
if (argv.length) files = files.filter((f) => argv.includes(f.replace(/\.json$/, "")));

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

let totalFlags = 0, totalMissing = 0, checkedLines = 0;

for (const f of files) {
  const L = JSON.parse(readFileSync(join(linesDir, f), "utf8"));
  const names = [], pts = [], missing = [], ambiguous = [];

  // 駅ごとに、路線図上の候補座標を1つに決める
  // 同名の駅が複数ある場合は「前の駅にいちばん近い候補」を採る
  let prev = null;
  for (const e of L.stations) {
    const st = byId.get(e.stationId);
    const key = st.name;
    const cands = COORDS[key] || COORDS[key + "〈" + (st.subName || "") + "〉"] || null;
    names.push(st.name);
    if (!cands || !cands.length) { pts.push(null); missing.push(st.name); continue; }
    let pick = cands[0];
    if (cands.length > 1) {
      ambiguous.push(st.name + "(" + cands.length + "候補)");
      if (prev) pick = cands.reduce((a, b) => (dist(prev, a) <= dist(prev, b) ? a : b));
    }
    pts.push(pick);
    prev = pick;
  }

  // 隣り合う駅の距離
  const measure = () => {
    const g = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i] && pts[i + 1]) g.push({ i, d: dist(pts[i], pts[i + 1]) });
    }
    return g;
  };
  // 同名の別駅（東京の有明 と 大糸線の有明 など）の座標を拾ってしまうことがある。
  // 前後どちらから見ても桁違いに遠い点は、別の駅の座標とみなして捨てる。
  const med0 = measure().length ? median(measure().map((g) => g.d)) : 0;
  const wrong = [];
  if (med0 > 0) {
    for (let i = 0; i < pts.length; i++) {
      if (!pts[i]) continue;
      const near = [pts[i - 1], pts[i + 1]].filter(Boolean).map((p) => dist(pts[i], p));
      if (near.length && Math.min(...near) > med0 * 10) { wrong.push(names[i]); pts[i] = null; }
    }
  }
  const gaps = measure();
  const med = gaps.length ? median(gaps.map((g) => g.d)) : 0;

  // ① 入れ替えると経路が短くなる隣接ペア＝並びが逆かもしれない箇所
  const swaps = [];
  for (let i = 1; i + 2 < pts.length; i++) {
    const [a, b, c, d] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    if (!a || !b || !c || !d) continue;
    const now = dist(a, b) + dist(b, c) + dist(c, d);
    const swapped = dist(a, c) + dist(c, b) + dist(b, d);
    if (swapped < now * 0.82) swaps.push({ i, gain: now - swapped, a: names[i], b: names[i + 1] });
  }
  // ② 場所が飛んでいる箇所
  //   路線図は都心を大きく、郊外を圧縮して描くので、路線全体の中央値と比べると
  //   縮尺の違いを誤検知する。前後の区間だけを見た「局所的な中央値」と比べる。
  const jumps = [];
  for (let k = 0; k < gaps.length; k++) {
    const lo = Math.max(0, k - 5), hi = Math.min(gaps.length, k + 6);
    const local = median(gaps.slice(lo, hi).filter((_, j) => lo + j !== k).map((g) => g.d));
    if (local > 0 && gaps[k].d > local * 4.0) {
      jumps.push({ i: gaps[k].i, d: gaps[k].d, local, a: names[gaps[k].i], b: names[gaps[k].i + 1] });
    }
  }

  checkedLines++;
  totalFlags += swaps.length + jumps.length;
  totalMissing += missing.length;

  const mark = swaps.length + jumps.length === 0 ? "○" : "×";
  console.log(`${mark} ${L.name.padEnd(9, "　")} ${String(L.stations.length).padStart(2)}駅  ` +
    `隣接距離の中央値 ${med.toFixed(1)}pt` +
    (missing.length ? `  地図に無い駅 ${missing.length}` : "") +
    (ambiguous.length ? `  同名複数 ${ambiguous.length}` : ""));
  if (missing.length) console.log(`    ・座標が引けない: ${missing.join(", ")}`);
  if (ambiguous.length) console.log(`    ・同名の候補あり: ${ambiguous.join(", ")}`);
  if (wrong.length) console.log(`    ・同名の別駅の座標らしいので無視: ${wrong.join(", ")}`);
  for (const s of swaps) {
    console.log(`    ⚠ 順序が逆かも: ${s.a} ↔ ${s.b}（入れ替えると ${s.gain.toFixed(0)}pt 短くなる）`);
  }
  for (const j of jumps) {
    console.log(`    ⚠ 距離が飛ぶ: ${j.a} → ${j.b}（${j.d.toFixed(0)}pt / 前後の中央値 ${j.local.toFixed(0)}pt の ${(j.d / j.local).toFixed(1)}倍）`);
  }
}

console.log("─".repeat(60));
console.log(`検査した路線 ${checkedLines} ／ 指摘 ${totalFlags}件 ／ 座標が引けない駅 ${totalMissing}件`);
console.log("※ これは並び順の証明ではない。おかしい並びに気づくための検査。");
process.exit(0);
