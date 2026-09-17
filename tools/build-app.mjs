#!/usr/bin/env node
/**
 * アプリのビルド
 *   使い方: node tools/build-app.mjs
 *
 * tools/app-template.html に data/ のJSONを埋め込んで、
 * app/index.html（単体で開けるHTML1枚）を書き出す。
 *
 * データを直接fetchしないのは、file:// で開いたときにCORSで読めないため。
 * data/ を直したら、このスクリプトを流し直すこと。
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const linesDir = join(dataDir, "lines");
const outDir = join(root, "app");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const operators = readJson(join(dataDir, "operators.json")).operators;
const stations = readJson(join(dataDir, "stations.json")).stations;

const lines = readdirSync(linesDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => readJson(join(linesDir, f)));

// 事業者ごとに、路線idの昇順ではなく「路線記号の並び」で見せたいので明示的に並べる
const ORDER = [
  "jr-east--yamanote",
  "jr-east--keihin-tohoku-negishi",
  "jr-east--chuo-rapid",
  "jr-east--chuo-sobu-local",
  "jr-east--saikyo",
  "jr-east--yokosuka-sobu-rapid",
  "jr-east--shonan-shinjuku",
  "jr-east--tokaido",
  "jr-east--ito",
  "jr-east--utsunomiya",
  "jr-east--takasaki",
  "jr-east--joban-rapid",
  "jr-east--joban-local",
  "jr-east--joban",
  "jr-east--musashino",
  "jr-east--keiyo",
  "jr-east--nambu",
  "jr-east--nambu-branch",
  "jr-east--yokohama",
  "jr-east--tsurumi",
  "jr-east--tsurumi-umishibaura",
  "jr-east--tsurumi-okawa",
  "jr-east--ome",
  "jr-east--itsukaichi",
  "jr-east--sagami",
  "jr-east--hachiko",
  "jr-east--kawagoe",
  "jr-east--sobu-main",
  "jr-east--sotobo",
  "jr-east--uchibo",
  "jr-east--narita",
  "jr-east--narita-airport",
  "jr-east--narita-abiko",
  "jr-east--kashima",
  "jr-east--togane",
  "jr-east--kururi",
  "jr-east--mito",
  "jr-east--suigun",
  "jr-east--suigun-ota",
  "jr-east--ryomo",
  "jr-east--nikko",
  "jr-east--karasuyama",
  "jr-east--chuo-main",
  "jr-east--joetsu",
  "jr-east--agatsuma",
  "jr-east--koumi",
  "jr-east--oito",
  "jr-east--shinonoi",
  "jr-east--shinetsu-takasaki",
  "jr-east--shinetsu-nagano",
  "jr-east--banetsu-east",
  "jr-east--tohoku-shinkansen",
  "jr-east--joetsu-shinkansen",
  "jr-east--hokuriku-shinkansen",
  "jr-central--tokaido-shinkansen",
  "jr-central--gotemba",
  "jr-central--minobu",
  "tokyo-metro--ginza",
  "tokyo-metro--marunouchi",
  "tokyo-metro--marunouchi-branch",
  "tokyo-metro--hibiya",
  "tokyo-metro--tozai",
  "tokyo-metro--chiyoda",
  "tokyo-metro--yurakucho",
  "tokyo-metro--hanzomon",
  "tokyo-metro--namboku",
  "tokyo-metro--fukutoshin",
  "toei--asakusa",
  "toei--mita",
  "toei--shinjuku",
  "toei--oedo",
  "tobu--skytree",
  "tobu--isesaki",
  "tobu--nikko",
  "tobu--kinugawa",
  "tobu--kameido",
  "tobu--daishi",
  "tobu--tojo",
  "tobu--ogose",
  "tobu--urban-park",
  "tobu--sano",
  "tobu--kiryu",
  "tobu--koizumi",
  "tobu--koizumi-ota",
  "tobu--utsunomiya",
  "seibu--ikebukuro",
  "seibu--chichibu",
  "seibu--yurakucho",
  "seibu--toshima",
  "seibu--sayama",
  "seibu--shinjuku",
  "seibu--haijima",
  "seibu--kokubunji",
  "seibu--seibuen",
  "seibu--tamako",
  "seibu--tamagawa",
  "seibu--yamaguchi",
  "keisei--main",
  "keisei--oshiage",
  "keisei--kanamachi",
  "keisei--chiba",
  "keisei--chihara",
  "keisei--higashi-narita",
  "keisei--sky-access",
  "keisei--matsudo",
  "hokuso--hokuso",
  "shibayama--shibayama",
  "tokyu--toyoko",
  "tokyu--meguro",
  "tokyu--den-en-toshi",
  "tokyu--oimachi",
  "tokyu--ikegami",
  "tokyu--tamagawa",
  "tokyu--setagaya",
  "tokyu--shin-yokohama",
  "tokyu--kodomonokuni",
  "yokohama-minatomirai--minatomirai",
  "keio--keio",
  "keio--new",
  "keio--sagamihara",
  "keio--takao",
  "keio--dobutsuen",
  "keio--keibajo",
  "keio--inokashira",
  "keikyu--main",
  "keikyu--airport",
  "keikyu--daishi",
  "keikyu--zushi",
  "keikyu--kurihama",
  "odakyu--odawara",
  "odakyu--enoshima",
  "odakyu--tama",
  "sotetsu--main",
  "sotetsu--izumino",
  "sotetsu--shin-yokohama",
  "yokohama-city--blue",
  "yokohama-city--green",
  "toei--arakawa",
  "tokyo-monorail--haneda",
  "yurikamome--yurikamome",
  "toei--nippori-toneri",
  "mir--tsukuba-express",
  "twr--rinkai",
  "saitama-railway--saitama",
  "toyo-rapid--toyo",
  "tama-monorail--tama",
  "shonan-monorail--enoshima",
  "chiba-monorail--line1",
  "chiba-monorail--line2",
  "yokohama-seaside--seaside",
  "maihama--disney-resort",
  "chichibu--main",
  "choshi--choshi",
  "enoden--enoshima",
  "fujikyu--fujikyu",
  "hakone-tozan--tozan",
  "hitachinaka--minato",
  "isumi--isumi",
  "izuhakone--daiyuzan",
  "izukyu--izukyu",
  "jomo--jomo",
  "joshin--joshin",
  "kanto--joso",
  "kanto--ryugasaki",
  "kashima-rinkai--oarai",
  "kominato--kominato",
  "ryutetsu--nagareyama",
  "saitama-shintoshi--ina",
  "shinano--shinano",
  "tokimeki--myoko-haneuma",
  "tokimeki--nihonkai-hisui",
  "watarase--watarase",
  "yamaman--yukarigaoka",
];
const rank = (id) => {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
};
lines.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));

// ---- 画面上部の大分類タブ ----
// 事業者ごとに割り当てる。これは「見せかた」の都合なので data/ には持たせない。
const CATEGORIES = [
  { id: "jr",            label: "JR" },
  { id: "subway",        label: "地下鉄" },
  { id: "private-major", label: "大手私鉄" },
  { id: "private-local", label: "そのほかの私鉄" },
  { id: "newtransit",    label: "モノレール・新交通" },
  { id: "other",         label: "その他" },
];
const CAT_OF_OPERATOR = {
  jr: ["jr-east", "jr-central"],
  subway: ["tokyo-metro", "toei", "yokohama-city"],
  // 大手私鉄。関東の大手は東京メトロを除くとこの8社
  "private-major": [
    "tobu", "seibu", "keisei", "tokyu", "keio", "keikyu", "odakyu", "sotetsu",
  ],
  // それ以外の私鉄（地方私鉄・中小私鉄）
  "private-local": [
    "hokuso", "shibayama", "yokohama-minatomirai", "chichibu", "enoden", "izukyu",
    "hakone-tozan", "izuhakone", "ryutetsu", "joshin", "jomo", "choshi",
    "kanto", "fujikyu", "kominato",
  ],
  newtransit: [
    "tokyo-monorail", "yurikamome", "tama-monorail", "shonan-monorail",
    "chiba-monorail", "yokohama-seaside", "maihama", "saitama-shintoshi", "yamaman",
  ],
  other: [
    "mir", "twr", "saitama-railway", "toyo-rapid", "watarase", "kashima-rinkai",
    "hitachinaka", "isumi", "shinano", "tokimeki",
  ],
};
// 事業者では決まらないもの。都営は地下鉄4路線のほかに路面電車と新交通を持っている
const CAT_OF_LINE = {
  "toei--arakawa": "other",             // 東京さくらトラム（路面電車）
  "toei--nippori-toneri": "newtransit", // 日暮里・舎人ライナー
};
const catByOperator = {};
for (const [cat, ops] of Object.entries(CAT_OF_OPERATOR)) {
  for (const op of ops) catByOperator[op] = cat;
}
const categoryOf = (L) => CAT_OF_LINE[L.id] || catByOperator[L.operatorId] || "other";

const missing = lines.filter((L) => !CAT_OF_LINE[L.id] && !catByOperator[L.operatorId]);
if (missing.length) {
  console.error("✗ 大分類が決まっていない路線があります:");
  missing.forEach((L) => console.error(`    ${L.id}（${L.operatorId}）`));
  process.exit(1);
}

// 駅名は違うが歩いて乗り換えられる駅の組（data/transfers.json）。
// アプリで使うのは組とつながり方だけ。距離や根拠URLは載せない
const transfersPath = join(dataDir, "transfers.json");
const walks = existsSync(transfersPath)
  ? readJson(transfersPath).transfers.map((t) => ({ stations: t.stations, kind: t.kind }))
  : [];

const payload = {
  operators,
  stations,
  categories: CATEGORIES,
  walks,
  lines: lines.map((L) => ({
    id: L.id, operatorId: L.operatorId, name: L.name, formalName: L.formalName,
    kana: L.kana, symbol: L.symbol, color: L.color, colorName: L.colorName,
    category: categoryOf(L),
    verified: L.verified === true,
    stations: L.stations.map((s) => ({ stationId: s.stationId, numbering: s.numbering })),
  })),
};

// <script type="application/json"> の中に入れるので </script> だけ無害化する
const json = JSON.stringify(payload).replace(/<\/script/gi, "<\\/script");

const tpl = readFileSync(join(root, "tools", "app-template.html"), "utf8");
if (!tpl.includes("__RAILWAY_DATA__")) {
  console.error("✗ テンプレートに __RAILWAY_DATA__ が見つかりません");
  process.exit(1);
}
const html = tpl.replace("__RAILWAY_DATA__", json);

mkdirSync(outDir, { recursive: true });
const out = join(outDir, "index.html");
writeFileSync(out, html, "utf8");

// オフライン用の Service Worker。中身が変わったときだけ版番号が動くよう、
// 出力HTMLのハッシュを版番号に使う（同じ内容で作り直しても無駄な更新が起きない）
const build = createHash("sha256").update(html).digest("hex").slice(0, 12);
const sw = readFileSync(join(root, "tools", "sw-template.js"), "utf8")
  .replace("__BUILD__", build);
writeFileSync(join(outDir, "sw.js"), sw, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
const unverified = lines.filter((L) => L.verified !== true).length;
console.log("─".repeat(52));
console.log(`書き出し      : app/index.html（${kb} KB・単体で開けます）`);
console.log(`路線数        : ${lines.length}（未検証 ${unverified}）`);
console.log(`駅数          : ${stations.length}`);
console.log(`歩く乗換      : ${walks.length}組`);
console.log("─".repeat(52));
CATEGORIES.forEach((c) => {
  const ls = lines.filter((L) => categoryOf(L) === c.id);
  const st = ls.reduce((n, L) => n + L.stations.length, 0);
  console.log(`  ${c.label.padEnd(12, "　")} ${String(ls.length).padStart(3)}ろせん / ${String(st).padStart(4)}えき`);
});
console.log("─".repeat(52));
