import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");

const seed = {
  vats: [
    {
      id: "V-001",
      name: "一号缸",
      capacity: 3,
      location: "东车间A区",
      material: "青石",
      note: "大容量缸，适合构树皮",
    },
    {
      id: "V-002",
      name: "二号缸",
      capacity: 2,
      location: "东车间A区",
      material: "陶瓷",
      note: "",
    },
    {
      id: "V-003",
      name: "三号缸",
      capacity: 4,
      location: "西车间B区",
      material: "杉木",
      note: "传统木缸，透气性好",
    },
  ],
  items: [
    {
      code: "PF-001",
      source: "构树皮",
      vat: "三号缸",
      vatId: "V-003",
      days: 5,
      expectedDays: 7,
      owner: "林素",
      status: "发酵中",
      startDate: "2026-06-15",
      logs: [
        {
          at: "2026-06-15",
          step: "建档",
          note: "创建纸浆批次，入三号缸",
          abnormal: false,
        },
      ],
    },
  ],
};

export const vatFields = [
  ["name", "缸名", "text"],
  ["capacity", "容量(批次)", "number"],
  ["location", "位置", "text"],
  ["material", "材质", "text"],
  ["note", "备注", "text"],
];

export const fields = [
  ["code", "批次编号", "text"],
  ["source", "原料来源", "text"],
  ["vat", "浸泡缸", "text"],
  ["vatId", "浸泡缸ID", "text"],
  ["days", "已发酵天数", "number"],
  ["expectedDays", "预计发酵天数", "number"],
  ["startDate", "入缸日期", "date"],
  ["owner", "负责人", "text"],
];
export const stages = ["入缸", "发酵中", "可抄纸", "异常观察"];
export const statLabels = ["入缸", "发酵中", "可抄纸", "异常观察"];
export const extraFields = [
  ["temperature", "温度"],
  ["smell", "气味状态"],
  ["fiber", "纤维松散度"],
  ["changedWater", "是否换水"],
  ["abnormal", "异味或霉点"],
];

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(await readFile(dbPath, "utf8"));
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

export function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}

export function newId() {
  return "PF-" + Date.now();
}

export function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map((label) => [label, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}

export function summarize(item) {
  const logCount =
    (item.logs || []).length +
    (item.tasks || []).reduce((n, t) => n + (t.logs || []).length, 0);
  return { ...item, logCount };
}

export function newVatId() {
  return "V-" + String(Date.now()).slice(-6);
}

export function getVatByName(db, name) {
  return (db.vats || []).find((v) => v.name === name);
}

export function getVatById(db, id) {
  return (db.vats || []).find((v) => v.id === id);
}

function parseDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function computeVatBoard(db) {
  const vats = db.vats || [];
  const items = db.items || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return vats.map((vat) => {
    const vatItems = items.filter(
      (item) =>
        item.vatId === vat.id ||
        (item.vat && item.vat === vat.name)
    );

    const activeItems = vatItems.filter(
      (item) => item.status === "发酵中" || item.status === "入缸"
    );

    const occupied = activeItems.length;
    const remaining = vat.capacity - occupied;
    const overload = occupied > vat.capacity;

    const itemsWithInfo = activeItems.map((item) => {
      const start = parseDate(item.startDate) || parseDate(item.logs?.[0]?.at);
      const expectedDays = Number(item.expectedDays) || Number(item.days) || 7;
      const currentDays = Number(item.days) || 0;

      let expectedEndDate = null;
      let overdueDays = 0;
      let isOverdue = false;

      if (start) {
        expectedEndDate = addDays(start, expectedDays);
        const diffMs = today.getTime() - expectedEndDate.getTime();
        overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isOverdue = overdueDays > 0;
      }

      return {
        ...item,
        expectedEndDate: expectedEndDate ? formatDate(expectedEndDate) : null,
        isOverdue,
        overdueDays: Math.max(0, overdueDays),
        progress: Math.min(100, Math.round((currentDays / expectedDays) * 100)),
      };
    });

    itemsWithInfo.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (b.days || 0) - (a.days || 0);
    });

    const overdueCount = itemsWithInfo.filter((i) => i.isOverdue).length;
    const hasRisk = overload || overdueCount > 0;

    return {
      ...vat,
      occupied,
      remaining: Math.max(0, remaining),
      overload,
      overdueCount,
      hasRisk,
      items: itemsWithInfo,
      totalBatches: vatItems.length,
    };
  });
}
