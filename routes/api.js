import { loadDb, saveDb, body, send, newId, computeStats, summarize, stages, newVatId, getVatById, computeVatBoard } from "../lib/db.js";
import { buildAllTimeline, uniqueValues } from "../lib/timeline.js";

export async function handleApi(req, res, url, method) {
  const db = await loadDb();

  if (method === "GET" && url.pathname === "/api/items") {
    return send(res, 200, db.items.map(summarize));
  }

  if (method === "POST" && url.pathname === "/api/items") {
    const input = await body(req);
    const item = {
      id: newId(),
      ...input,
      logs: [{ at: new Date().toISOString(), step: "建档", note: "创建纸浆批次" }],
    };
    db.items.unshift(item);
    await saveDb(db);
    return send(res, 201, item);
  }

  const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
  if (patch && method === "PATCH") {
    const item = db.items.find((x) => x.id === patch[1] || x.code === patch[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    Object.assign(item, await body(req));
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
    await saveDb(db);
    return send(res, 200, item);
  }

  const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
  if (log && method === "POST") {
    const item = db.items.find((x) => x.id === log[1] || x.code === log[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: input.step || "记录", note: input.note || "" });
    await saveDb(db);
    return send(res, 201, item);
  }

  const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
  if (action && method === "POST") {
    const item = db.items.find((x) => x.id === action[1] || x.code === action[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const input = await body(req);
    item.logs ||= [];
    const abnormal =
      String(input.abnormal || "").includes("是") || String(input.abnormal || "").includes("有");
    item.observations ||= [];
    item.observations.push({ at: new Date().toISOString(), ...input, abnormal });
    item.days = Number(item.days || 0) + 1;
    item.status = abnormal ? "异常观察" : Number(item.days) >= 7 ? "可抄纸" : "发酵中";
    item.logs.push({
      at: new Date().toISOString(),
      step: "观察",
      note: "温度" + (input.temperature || "") + "，" + (input.smell || "") + "，" + (input.fiber || ""),
    });
    await saveDb(db);
    return send(res, 201, item);
  }

  if (method === "GET" && url.pathname === "/api/stats") {
    return send(res, 200, computeStats(db.items));
  }

  if (method === "GET" && url.pathname === "/api/timeline") {
    const code = url.searchParams.get("code") || "";
    const vat = url.searchParams.get("vat") || "";
    const owner = url.searchParams.get("owner") || "";
    const events = buildAllTimeline(db.items, { code, vat, owner });
    const vats = uniqueValues(db.items, "vat");
    const owners = uniqueValues(db.items, "owner");
    return send(res, 200, { events, vats, owners });
  }

  if (method === "GET" && url.pathname === "/api/vats") {
    return send(res, 200, db.vats || []);
  }

  if (method === "POST" && url.pathname === "/api/vats") {
    const input = await body(req);
    const vat = {
      id: newVatId(),
      name: input.name || "",
      capacity: Number(input.capacity) || 1,
      location: input.location || "",
      material: input.material || "",
      note: input.note || "",
    };
    db.vats ||= [];
    db.vats.push(vat);
    await saveDb(db);
    return send(res, 201, vat);
  }

  const vatPatch = url.pathname.match(/^\/api\/vats\/([^/]+)$/);
  if (vatPatch && method === "PATCH") {
    const vat = (db.vats || []).find((v) => v.id === vatPatch[1]);
    if (!vat) return send(res, 404, { error: "vat_not_found" });
    const input = await body(req);
    Object.assign(vat, input);
    vat.capacity = Number(vat.capacity) || 1;
    await saveDb(db);
    return send(res, 200, vat);
  }

  const vatDelete = url.pathname.match(/^\/api\/vats\/([^/]+)$/);
  if (vatDelete && method === "DELETE") {
    const idx = (db.vats || []).findIndex((v) => v.id === vatDelete[1]);
    if (idx === -1) return send(res, 404, { error: "vat_not_found" });
    const deleted = db.vats.splice(idx, 1)[0];
    await saveDb(db);
    return send(res, 200, deleted);
  }

  if (method === "GET" && url.pathname === "/api/board") {
    const board = computeVatBoard(db);
    return send(res, 200, { vats: board, stats: computeStats(db.items) });
  }

  return null;
}
