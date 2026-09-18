#!/usr/bin/env node
/**
 * データ整合性チェッカー
 *   使い方: node tools/validate.mjs
 * 路線を追加したら必ずこれを通してからコミットすること。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const linesDir = join(dataDir, "lines");

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    err(`JSONとして読めない: ${p} (${e.message})`);
    return null;
  }
};

// --- masters ---------------------------------------------------------------
const operatorsFile = readJson(join(dataDir, "operators.json"));
const stationsFile = readJson(join(dataDir, "stations.json"));
if (!operatorsFile || !stationsFile) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const operatorIds = new Set();
for (const op of operatorsFile.operators) {
  if (operatorIds.has(op.id)) err(`事業者idが重複: ${op.id}`);
  operatorIds.add(op.id);
}

const stationIds = new Set();
const stationName = new Map();
const KANA = /^[ぁ-んー・ゝゞ\s]+$/;
for (const st of stationsFile.stations) {
  if (stationIds.has(st.id)) err(`駅idが重複: ${st.id}`);
  stationIds.add(st.id);
  stationName.set(st.id, st.name);
  if (!/^[a-z0-9-]+$/.test(st.id)) err(`駅idに使えない文字: ${st.id}`);
  if (!st.name) err(`駅名が空: ${st.id}`);
  if (!st.kana) err(`ふりがなが無い: ${st.id}`);
  else if (!KANA.test(st.kana)) err(`ふりがながひらがなでない: ${st.id} (${st.kana})`);
  // 副称（〈原宿〉など）は name に混ぜず subName/subKana に分ける。片方だけは不可
  if (st.subName && !st.subKana) err(`副称のふりがなが無い: ${st.id} (${st.subName})`);
  if (st.subKana && !st.subName) err(`subName が無いのに subKana がある: ${st.id}`);
  if (st.subKana && !KANA.test(st.subKana)) err(`副称のふりがながひらがなでない: ${st.id} (${st.subKana})`);
  if (/[０-９]/.test(st.name)) err(`駅名に全角数字: ${st.id} (${st.name})`);
}

// 同名の別id（意図的な場合もあるので警告どまり）
const byName = new Map();
for (const st of stationsFile.stations) {
  if (!byName.has(st.name)) byName.set(st.name, []);
  byName.get(st.name).push(st.id);
}
for (const [name, ids] of byName) {
  if (ids.length > 1) warn(`同じ駅名で複数id: ${name} -> ${ids.join(", ")}（同一駅なら統合、別駅なら意図通り）`);
}

// --- lines -----------------------------------------------------------------
const lineFiles = readdirSync(linesDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const lineIds = new Set();
const usedStations = new Set();
const stationToLines = new Map();
let unverified = 0;

for (const f of lineFiles) {
  const line = readJson(join(linesDir, f));
  if (!line) continue;
  const tag = `[${f}]`;

  if (lineIds.has(line.id)) err(`${tag} 路線idが重複: ${line.id}`);
  lineIds.add(line.id);
  if (`${line.id}.json` !== f) err(`${tag} ファイル名と id が一致しない (id=${line.id})`);
  if (!operatorIds.has(line.operatorId)) err(`${tag} 未定義の事業者id: ${line.operatorId}`);
  if (!line.name) err(`${tag} 路線名が空`);
  if (!line.kana || !KANA.test(line.kana)) err(`${tag} 路線のふりがなが不正: ${line.kana}`);
  if (!/^#[0-9A-Fa-f]{6}$/.test(line.color || "")) err(`${tag} 路線カラーが不正: ${line.color}`);
  if (!Array.isArray(line.stations) || line.stations.length < 2) err(`${tag} 駅が2つ未満`);
  if (line.verified !== true) unverified++;
  // 路線記号は駅ナンバリングがある路線だけが持つ。無い路線に架空の記号を付けない
  const hasNumbering = (line.stations ?? []).some((s) => s.numbering !== undefined);
  if (line.symbol !== undefined && !/^[A-Za-z]{1,3}$/.test(line.symbol)) {
    err(`${tag} 路線記号が不正: ${line.symbol}`);
  }
  if (hasNumbering && line.symbol === undefined) err(`${tag} 駅番号があるのに路線記号が無い`);
  if (!hasNumbering && line.symbol !== undefined) {
    warn(`${tag} 駅番号が無いのに路線記号がある: ${line.symbol}`);
  }
  if (!Array.isArray(line.source) || line.source.length === 0) warn(`${tag} source（根拠URL）が空`);

  const seenNum = new Set();
  const seen = new Set();
  for (const s of line.stations ?? []) {
    if (s.numbering !== undefined) {
      if (!/^[A-Za-z]{1,3}[0-9]{2}$/.test(s.numbering)) {
        err(`${tag} 駅番号の形式が不正: ${s.numbering} (${s.stationId})`);
      } else {
        if (seenNum.has(s.numbering)) err(`${tag} 駅番号が重複: ${s.numbering}`);
        seenNum.add(s.numbering);
        // 分岐線の分岐駅など、本線側の記号が混ざるのは正常。警告どまりにする
        const prefix = s.numbering.match(/^[A-Za-z]{1,3}/)[0];
        if (prefix !== line.symbol) {
          warn(`${tag} 駅番号の記号が路線記号と違う: ${s.numbering}（路線記号は ${line.symbol}）`);
        }
      }
    }
    if (!stationIds.has(s.stationId)) {
      err(`${tag} stations.json に無い駅id: ${s.stationId}`);
      continue;
    }
    if (seen.has(s.stationId)) err(`${tag} 同じ駅が2回出てくる: ${s.stationId}`);
    seen.add(s.stationId);
    usedStations.add(s.stationId);
    if (!stationToLines.has(s.stationId)) stationToLines.set(s.stationId, []);
    stationToLines.get(s.stationId).push(line.name);
  }
}

for (const id of stationIds) {
  if (!usedStations.has(id)) warn(`どの路線にも属さない駅: ${id} (${stationName.get(id)})`);
}

// --- walking transfers (data/transfers.json) --------------------------------
// 駅名は違うが歩いて乗り換えられる駅の組。ファイルが無ければ検査しない
const transfersPath = join(dataDir, "transfers.json");
let walkTransfers = [];
if (existsSync(transfersPath)) {
  const tf = readJson(transfersPath);
  const KINDS = new Set(["same-facility", "passage", "official", "near"]);
  const seenPairs = new Set();
  if (!Array.isArray(tf.transfers)) err("transfers.json: transfers が配列ではない");
  (tf.transfers ?? []).forEach((t, i) => {
    const tag = `[transfers.json #${i}]`;
    const [a, b] = t.stations ?? [];
    if (!Array.isArray(t.stations) || t.stations.length !== 2) {
      err(`${tag} stations は駅idを2つ持つ配列にする`);
      return;
    }
    if (a === b) err(`${tag} 同じ駅どうしになっている: ${a}`);
    for (const s of [a, b]) {
      if (!stationIds.has(s)) err(`${tag} stations.json に無い駅id: ${s}`);
      else if (!usedStations.has(s)) warn(`${tag} どの路線にも属さない駅: ${s}`);
    }
    const key = [a, b].sort().join("⇔");
    if (seenPairs.has(key)) err(`${tag} 同じ組が2回ある: ${key}`);
    seenPairs.add(key);
    if (!KINDS.has(t.kind)) err(`${tag} kind が不正: ${t.kind}`);
    if (typeof t.distanceM !== "number" || t.distanceM < 0) err(`${tag} distanceM は0以上の数にする`);
    else if (t.distanceM > 700) warn(`${tag} ${key} が ${t.distanceM}m 離れている（採用基準は700m以内）`);
    // 参考サイトに http でしか公開されていないものがあるので http も許す
    if (!Array.isArray(t.source) || t.source.length === 0 || t.source.some((u) => !/^https?:\/\//.test(u)))
      err(`${tag} source に根拠URL（http/https）を1つ以上書く`);
    // どちらから歩いても新しい路線に乗れない組（路線がまったく同じ）は乗換として意味がない。
    // 片方が他方に含まれるだけなら、小さい駅から大きい駅へ歩く意味があるので許す（新宿西口→新宿）
    const la = new Set(stationToLines.get(a) ?? []), lb = new Set(stationToLines.get(b) ?? []);
    if (la.size && la.size === lb.size && [...la].every((x) => lb.has(x)))
      warn(`${tag} ${key} は両方の路線がまったく同じ（歩いて乗り換える意味がない）`);
  });
  walkTransfers = tf.transfers ?? [];
}

// --- shinkansen trains (data/trains.json) -----------------------------------
// 新幹線の列車（のぞみ・はやぶさ など）と停車駅。ファイルが無ければ検査しない
const trainsPath = join(dataDir, "trains.json");
let trains = [];
if (existsSync(trainsPath)) {
  const td = readJson(trainsPath);
  const seenId = new Set();
  const lineStations = new Map();     // 路線id -> 駅idの並び
  for (const f of lineFiles) {
    const line = readJson(join(linesDir, f));
    if (line) lineStations.set(line.id, line.stations.map((s) => s.stationId));
  }
  (td.trains ?? []).forEach((t) => {
    const tag = `[trains.json ${t.id ?? "?"}]`;
    if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) err(`${tag} 列車idに使えない文字`);
    if (seenId.has(t.id)) err(`${tag} 列車idが重複`);
    seenId.add(t.id);
    if (!t.name) err(`${tag} 列車名が空`);
    if (!t.kana || !KANA.test(t.kana)) err(`${tag} 列車のふりがなが不正: ${t.kana}`);
    if (!Array.isArray(t.lines) || !t.lines.length) err(`${tag} 走る路線が空`);
    // その列車が走る路線の駅を、路線の並び順どおりに並べたもの
    const order = [];
    for (const lid of t.lines ?? []) {
      if (!lineStations.has(lid)) { err(`${tag} 無い路線id: ${lid}`); continue; }
      for (const sid of lineStations.get(lid)) if (!order.includes(sid)) order.push(sid);
    }
    let prev = -1;
    (t.stops ?? []).forEach((s) => {
      if (!stationIds.has(s.stationId)) { err(`${tag} 無い駅id: ${s.stationId}`); return; }
      if (!["all", "some"].includes(s.stop)) err(`${tag} stop は all か some: ${s.stop}`);
      const i = order.indexOf(s.stationId);
      if (i < 0) { err(`${tag} 走る路線に無い駅がある: ${stationName.get(s.stationId)}`); return; }
      if (i <= prev) err(`${tag} 停車駅の並びが路線の順序と違う: ${stationName.get(s.stationId)}`);
      prev = i;
    });
    if ((t.stops ?? []).length < 2) err(`${tag} 停車駅が2つ未満`);
  });
  trains = td.trains ?? [];
}

// --- report ----------------------------------------------------------------
const transfers = [...stationToLines.entries()].filter(([, l]) => l.length > 1);

console.log("─".repeat(52));
console.log(`路線数        : ${lineFiles.length}（未検証 ${unverified}）`);
console.log(`駅数          : ${stationIds.size}`);
console.log(`乗換駅        : ${transfers.length}`);
console.log(`歩く乗換      : ${walkTransfers.length}組`);
console.log(`新幹線の列車  : ${trains.length}本`);
console.log("─".repeat(52));
if (warnings.length) {
  console.log(`\n⚠ 警告 ${warnings.length}件`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
if (errors.length) {
  console.log(`\n✗ エラー ${errors.length}件`);
  errors.forEach((e) => console.log(`  - ${e}`));
  process.exit(1);
}
console.log("\n✓ エラーなし");
