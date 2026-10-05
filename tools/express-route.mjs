/**
 * 特急（data/expresses.json）の「いきさき」1つ分の道すじを組み立てる。
 * validate.mjs（検査）と build-app.mjs（アプリ用に停車駅へ路線を付ける）の両方で使う。
 *
 * variant.lines は走る順に並べた路線id。路線と路線のつなぎ目は、両方の路線にある駅
 * （例：小田原線と江ノ島線なら相模大野）。同じ駅が無いときは links（連絡線）でつなぐ。
 * 停車駅が、この道すじの上に走る順で並んでいれば正しい。
 *
 *   routeOf(variant, lineMap, links)
 *     lineMap: Map<路線id, 駅idの並び>
 *     links:   [{ stations: [駅id, 駅id] }]  … 駅名の違う駅どうしを結ぶ線路
 *   → { stops: [{ stationId, stop, lineId }], errors: [文] }
 */
export function routeOf(variant, lineMap, links = []) {
  const errors = [];
  const ids = variant.lines ?? [];
  const stops = variant.stops ?? [];
  const L = ids.map((id) => ({ id, st: lineMap.get(id) }));
  L.filter((x) => !x.st).forEach((x) => errors.push(`無い路線id: ${x.id}`));
  if (errors.length || !L.length || stops.length < 2) {
    if (stops.length < 2) errors.push("停車駅が2つ未満");
    if (!L.length) errors.push("走る路線が空");
    return { stops: [], errors };
  }

  // 1) 停車駅を、走る順に路線へ割りふる（今の路線に無ければ次の路線へ進む）
  const assigned = L.map(() => []);
  let li = 0;
  for (const s of stops) {
    let j = li;
    while (j < L.length && !L[j].st.includes(s.stationId)) j++;
    if (j === L.length) { errors.push(`走る路線に無い駅、または並びが違う: ${s.stationId}`); continue; }
    li = j;
    assigned[j].push(s.stationId);
  }
  if (errors.length) return { stops: [], errors };
  if (!assigned[0].length) errors.push(`最初の停車駅が最初の路線（${L[0].id}）に無い`);
  if (!assigned[L.length - 1].length) errors.push(`最後の停車駅が最後の路線（${L[L.length - 1].id}）に無い`);
  if (errors.length) return { stops: [], errors };

  // 2) 路線のつなぎ目を決める。候補が複数あるとき（京成本線と成田スカイアクセス線は
  //    京成高砂と空港第2ビル・成田空港の3駅を共有）は、前後の停車駅にいちばん近いものを選ぶ
  const junc = [];                       // [この路線を出る駅, 次の路線に入る駅]
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i].st, b = L[i + 1].st;
    const last = assigned[i].length ? assigned[i][assigned[i].length - 1] : junc[i - 1][1];
    const next = assigned[i + 1][0] ?? null;
    const cands = a.filter((x) => b.includes(x)).map((x) => [x, x]);
    for (const k of links) {
      const [p, q] = k.stations;
      if (a.includes(p) && b.includes(q)) cands.push([p, q]);
      if (a.includes(q) && b.includes(p)) cands.push([q, p]);
    }
    if (!cands.length) {
      errors.push(`${L[i].id} と ${L[i + 1].id} がつながっていない（同じ駅も連絡線も無い）`);
      return { stops: [], errors };
    }
    const score = ([p, q]) => Math.abs(a.indexOf(p) - a.indexOf(last))
      + (next ? Math.abs(b.indexOf(q) - b.indexOf(next)) : 0);
    cands.sort((x, y) => score(x) - score(y));
    junc.push(cands[0]);
  }

  // 3) 道すじ（通る駅すべて）をつなげる。路線の向きは入る駅と出る駅で決まる
  const path = [];
  for (let i = 0; i < L.length; i++) {
    const st = L[i].st;
    const from = st.indexOf(i === 0 ? stops[0].stationId : junc[i - 1][1]);
    const to = st.indexOf(i === L.length - 1 ? stops[stops.length - 1].stationId : junc[i][0]);
    const step = to >= from ? 1 : -1;
    for (let k = from; ; k += step) {
      const sid = st[k];
      // つなぎ目の駅は、前の路線の最後としてすでに入っている
      if (!(path.length && path[path.length - 1].stationId === sid)) path.push({ stationId: sid, lineId: L[i].id });
      if (k === to) break;
    }
  }

  // 4) 停車駅が道すじの上に、走る順で並んでいるか
  const out = [];
  let p = 0;
  for (const s of stops) {
    while (p < path.length && path[p].stationId !== s.stationId) p++;
    if (p === path.length) { errors.push(`停車駅の並びが走る順と違う: ${s.stationId}`); break; }
    out.push({ stationId: s.stationId, stop: s.stop, lineId: path[p].lineId });
    p++;
  }
  return { stops: out, errors };
}
