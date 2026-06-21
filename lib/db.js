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
      (item) => item.status === "发酵中" || item.status === "入缸" || item.status === "异常观察"
    );

    const normalItems = vatItems.filter(
      (item) => item.status === "发酵中" || item.status === "入缸"
    );
    const abnormalItems = vatItems.filter(
      (item) => item.status === "异常观察"
    );

    const occupied = activeItems.length;
    const abnormalOccupied = abnormalItems.length;
    const remaining = vat.capacity - occupied;
    const overload = occupied > vat.capacity;

    const itemsWithInfo = activeItems.map((item) => {
      const start = parseDate(item.startDate) || parseDate(item.logs?.[0]?.at);
      const expectedDays = Number(item.expectedDays) || Number(item.days) || 7;
      const currentDays = Number(item.days) || 0;

      let expectedEndDate = null;
      let overdueDays = 0;
      let isOverdue = false;
      let noDateWarning = false;

      if (start) {
        expectedEndDate = addDays(start, expectedDays);
        const diffMs = today.getTime() - expectedEndDate.getTime();
        overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isOverdue = overdueDays > 0;
      } else {
        noDateWarning = true;
        overdueDays = currentDays - expectedDays;
        isOverdue = overdueDays > 0;
      }

      return {
        ...item,
        expectedEndDate: expectedEndDate ? formatDate(expectedEndDate) : null,
        isOverdue,
        overdueDays: Math.max(0, overdueDays),
        progress: Math.min(100, Math.round((currentDays / expectedDays) * 100)),
        noDateWarning,
      };
    });

    itemsWithInfo.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (b.days || 0) - (a.days || 0);
    });

    const overdueCount = itemsWithInfo.filter((i) => i.isOverdue).length;
    const hasRisk = overload || overdueCount > 0 || abnormalOccupied > 0;

    return {
      ...vat,
      occupied,
      abnormalOccupied,
      remaining: Math.max(0, remaining),
      overload,
      overdueCount,
      hasRisk,
      items: itemsWithInfo,
      totalBatches: vatItems.length,
    };
  });
}

const obsFieldAliases = {
  code: ["批次编号", "批次", "编号", "code", "Code"],
  temperature: ["温度", "温度℃", "温度(℃)", "temperature", "Temperature"],
  smell: ["气味", "气味状态", "smell", "Smell"],
  fiber: ["纤维", "纤维状态", "纤维松散度", "fiber", "Fiber"],
  changedWater: ["是否换水", "换水", "换水了吗", "changedWater", "ChangedWater"],
  abnormal: ["异常", "是否异常", "异味", "霉点", "异味或霉点", "abnormal", "Abnormal"],
  at: ["日期", "观察日期", "时间", "at", "date", "Date"],
};

function detectCsvDelimiter(text) {
  const firstLine = text.split("\n")[0] || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  if (tabs > commas && tabs > semicolons) return "\t";
  if (semicolons > commas && semicolons > tabs) return ";";
  return ",";
}

function parseCsvRow(row, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseObservationText(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectCsvDelimiter(text);
  const headerLine = lines[0];
  const rawHeaders = parseCsvRow(headerLine, delimiter);

  const fieldMap = {};
  rawHeaders.forEach((h, idx) => {
    const hTrim = h.trim();
    for (const [field, aliases] of Object.entries(obsFieldAliases)) {
      if (aliases.some((a) => a.toLowerCase() === hTrim.toLowerCase())) {
        fieldMap[idx] = field;
        break;
      }
    }
  });

  const detectedFields = Object.values(fieldMap);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i], delimiter);
    const row = {};
    let hasData = false;
    for (const [idx, field] of Object.entries(fieldMap)) {
      const val = values[Number(idx)];
      if (val !== undefined && val !== "") {
        row[field] = val;
        hasData = true;
      }
    }
    if (hasData) {
      row._raw = lines[i];
      row._rowIndex = i;
      rows.push(row);
    }
  }

  return {
    headers: rawHeaders,
    detectedFields,
    detectedFieldCount: detectedFields.length,
    totalFields: Object.keys(obsFieldAliases).length,
    rows,
    rowCount: rows.length,
  };
}

export function isAbnormalObservation(input) {
  return (
    String(input.abnormal || "").includes("是") ||
    String(input.abnormal || "").includes("有")
  );
}

function findItemByCode(db, code) {
  if (!code) return null;
  const codeTrim = String(code).trim();
  return (
    db.items.find((x) => x.code === codeTrim) ||
    db.items.find((x) => x.id === codeTrim) ||
    db.items.find((x) => (x.code || "").toLowerCase() === codeTrim.toLowerCase()) ||
    null
  );
}

export function previewBatchImport(db, parsed) {
  const matched = [];
  const unmatched = [];
  const abnormalWarnings = [];
  const fieldIssues = [];

  const requiredFields = ["code"];
  const hasCode = parsed.detectedFields.includes("code");

  if (!hasCode) {
    fieldIssues.push("未识别到批次编号字段，无法匹配纸浆批次");
  }

  for (const row of parsed.rows) {
    if (!row.code) {
      unmatched.push({
        row,
        reason: "缺少批次编号",
      });
      continue;
    }

    const item = findItemByCode(db, row.code);
    if (!item) {
      unmatched.push({
        row,
        reason: '找不到编号为"' + row.code + '"的纸浆批次',
      });
      continue;
    }

    const observation = {
      temperature: row.temperature || "",
      smell: row.smell || "",
      fiber: row.fiber || "",
      changedWater: row.changedWater || "",
      abnormal: row.abnormal || "",
      at: row.at || new Date().toISOString(),
    };

    const abnormal = isAbnormalObservation(observation);
    const willTriggerAbnormal = abnormal && item.status !== "异常观察";
    const currentDays = Number(item.days || 0) + 1;
    const willBeReady = !abnormal && currentDays >= 7 && item.status !== "可抄纸";

    const matchInfo = {
      row,
      itemCode: item.code,
      itemId: item.id,
      itemName: item.source || "",
      vat: item.vat || "",
      currentStatus: item.status,
      currentDays: Number(item.days || 0),
      observation,
      abnormal,
      willTriggerAbnormal,
      willBeReady,
      newDays: currentDays,
      newStatus: abnormal
        ? "异常观察"
        : currentDays >= 7
          ? "可抄纸"
          : "发酵中",
    };

    matched.push(matchInfo);

    if (abnormal) {
      abnormalWarnings.push(matchInfo);
    }
  }

  return {
    detectedFields: parsed.detectedFields,
    fieldLabels: parsed.detectedFields.map((f) => {
      const aliasList = obsFieldAliases[f] || [f];
      return { field: f, label: aliasList[0] };
    }),
    totalRows: parsed.rows.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    abnormalCount: abnormalWarnings.length,
    fieldIssues,
    matched,
    unmatched,
    abnormalWarnings,
  };
}

export async function applyBatchImport(db, previewData) {
  const results = {
    success: [],
    failed: [],
  };

  for (const match of previewData.matched) {
    try {
      const item = db.items.find(
        (x) => x.id === match.itemId || x.code === match.itemCode
      );
      if (!item) {
        results.failed.push({ match, reason: "批次不存在" });
        continue;
      }

      const observation = match.observation;
      const abnormal = match.abnormal;

      item.observations ||= [];
      item.observations.push({
        at: observation.at || new Date().toISOString(),
        temperature: observation.temperature || "",
        smell: observation.smell || "",
        fiber: observation.fiber || "",
        changedWater: observation.changedWater || "",
        abnormal,
      });

      item.days = Number(item.days || 0) + 1;
      item.status = abnormal
        ? "异常观察"
        : Number(item.days) >= 7
          ? "可抄纸"
          : "发酵中";

      item.logs ||= [];
      item.logs.push({
        at: new Date().toISOString(),
        step: "观察",
        note:
          "温度" +
          (observation.temperature || "") +
          "，" +
          (observation.smell || "") +
          "，" +
          (observation.fiber || ""),
      });

      results.success.push({
        itemCode: item.code,
        newStatus: item.status,
        newDays: item.days,
      });
    } catch (err) {
      results.failed.push({ match, reason: err.message });
    }
  }

  await saveDb(db);
  return results;
}
