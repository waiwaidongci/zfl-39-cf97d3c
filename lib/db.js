import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");

const seed = {
  items: [
    {
      code: "PF-001",
      source: "构树皮",
      vat: "三号缸",
      days: 5,
      owner: "林素",
      status: "发酵中",
      logs: [
        {
          at: "2026-06-15",
          step: "观察",
          note: "温度24.6，气味微酸，纤维开始松散",
          abnormal: false,
        },
      ],
    },
  ],
};

export const fields = [
  ["code", "批次编号", "text"],
  ["source", "原料来源", "text"],
  ["vat", "浸泡缸", "text"],
  ["days", "发酵天数", "number"],
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
