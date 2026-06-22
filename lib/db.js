import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  createEvent,
  appendEvent,
  appendEvents,
  listEvents,
  getEventById,
  getEventsByBatch,
  migrateLogsToEvents,
  migrateObservationsToEvents,
  migrateItemToEvents,
  runMigration as runEventMigration,
  rebuildBatchState,
  getEventStats,
  verifyMigration,
} from "./events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");

export const defaultRule = {
  id: "default",
  name: "默认规则",
  source: "*",
  isDefault: true,
  minDays: 7,
  maxDays: 30,
  temperatureMin: 15,
  temperatureMax: 35,
  abnormalKeywords: ["霉", "臭", "腐", "酸败", "异味", "发黑", "结块", "霉斑", "发霉", "腐败"],
  autoStatusRules: {
    onAbnormalKeyword: "异常观察",
    onTemperatureOutOfRange: "异常观察",
    onDaysReachedMin: "可抄纸",
    onDaysExceedMax: "异常观察",
  },
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

export const builtinRules = [
  {
    id: "rule-goushupi",
    name: "构树皮发酵规则",
    source: "构树皮",
    isDefault: false,
    minDays: 7,
    maxDays: 21,
    temperatureMin: 18,
    temperatureMax: 32,
    abnormalKeywords: ["霉", "臭", "腐", "酸败", "异味", "发黑", "结块", "霉斑", "发霉", "腐败"],
    autoStatusRules: {
      onAbnormalKeyword: "异常观察",
      onTemperatureOutOfRange: "异常观察",
      onDaysReachedMin: "可抄纸",
      onDaysExceedMax: "异常观察",
    },
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
];

const seed = {
  handovers: [
    {
      id: "HO-00000001",
      handedOverBy: "林素",
      receivedBy: "王师傅",
      batchIds: ["PF-001"],
      batchCodes: ["PF-001"],
      keyObservations: "温度稳定在24-26℃，气味正常",
      pendingAbnormalities: "无",
      nextWaterChangeReminder: "2026-06-23",
      note: "正常交接",
      createdAt: "2026-06-20T08:00:00.000Z",
    },
  ],
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
  fermentationRules: [
    { ...defaultRule },
    ...builtinRules,
  ],
  experiments: [
    {
      id: "EXP-00000001",
      name: "构树皮 vs 桑皮",
      description: "对比不同原料的发酵表现差异",
      batchIds: [],
      createdAt: "2026-06-10T00:00:00.000Z",
      updatedAt: "2026-06-10T00:00:00.000Z",
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

export const ruleFields = [
  ["name", "规则名称", "text"],
  ["source", "原料来源（*表示通用）", "text"],
  ["minDays", "最短发酵天数", "number"],
  ["maxDays", "最长发酵天数", "number"],
  ["temperatureMin", "温度下限(℃)", "number"],
  ["temperatureMax", "温度上限(℃)", "number"],
];

export const autoStatusOptions = ["异常观察", "可抄纸", "发酵中", "入缸"];

export function newExperimentId() {
  return "EXP-" + String(Date.now()).slice(-8);
}

export function ensureExperiments(db) {
  if (!db.experiments || !Array.isArray(db.experiments)) {
    db.experiments = [
      {
        id: "EXP-00000001",
        name: "构树皮 vs 桑皮",
        description: "对比不同原料的发酵表现差异",
        batchIds: [],
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    ];
    return true;
  }
  return false;
}

export function listExperiments(db) {
  return db.experiments || [];
}

export function getExperimentById(db, id) {
  return (db.experiments || []).find((e) => e.id === id) || null;
}

export function validateExperiment(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["实验数据格式错误"] };
  }
  if (!input.name || String(input.name).trim() === "") {
    errors.push("实验名称不能为空");
  }
  return { valid: errors.length === 0, errors };
}

export function createExperiment(db, input) {
  const validation = validateExperiment(input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  const now = new Date().toISOString();
  const experiment = {
    id: newExperimentId(),
    name: String(input.name).trim(),
    description: String(input.description || "").trim(),
    batchIds: Array.isArray(input.batchIds) ? input.batchIds : [],
    createdAt: now,
    updatedAt: now,
  };
  db.experiments ||= [];
  db.experiments.unshift(experiment);
  return { success: true, experiment };
}

export function updateExperiment(db, id, input) {
  const experiment = getExperimentById(db, id);
  if (!experiment) {
    return { success: false, errors: ["实验不存在"] };
  }
  const now = new Date().toISOString();
  if (input.name !== undefined) {
    experiment.name = String(input.name).trim();
  }
  if (input.description !== undefined) {
    experiment.description = String(input.description || "").trim();
  }
  if (Array.isArray(input.batchIds)) {
    experiment.batchIds = [...new Set(input.batchIds)];
  }
  experiment.updatedAt = now;
  return { success: true, experiment };
}

export function addBatchesToExperiment(db, id, batchIds) {
  const experiment = getExperimentById(db, id);
  if (!experiment) {
    return { success: false, errors: ["实验不存在"] };
  }
  const validIds = batchIds.filter((bid) => {
    const item = db.items.find((i) => i.id === bid || i.code === bid);
    return !!item;
  });
  const newBatchIds = validIds.map((bid) => {
    const item = db.items.find((i) => i.id === bid || i.code === bid);
    return item ? item.id || item.code : bid;
  });
  experiment.batchIds = [...new Set([...(experiment.batchIds || []), ...newBatchIds])];
  experiment.updatedAt = new Date().toISOString();
  return { success: true, experiment, addedCount: validIds.length };
}

export function removeBatchFromExperiment(db, id, batchId) {
  const experiment = getExperimentById(db, id);
  if (!experiment) {
    return { success: false, errors: ["实验不存在"] };
  }
  experiment.batchIds = (experiment.batchIds || []).filter((b) => b !== batchId);
  experiment.updatedAt = new Date().toISOString();
  return { success: true, experiment };
}

export function deleteExperiment(db, id) {
  const idx = (db.experiments || []).findIndex((e) => e.id === id);
  if (idx === -1) {
    return { success: false, errors: ["实验不存在"] };
  }
  const deleted = db.experiments.splice(idx, 1)[0];
  return { success: true, experiment: deleted };
}

function parseDateExp(d) {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

export function analyzeBatchForComparison(db, item) {
  const observations = item.observations || [];
  const logs = item.logs || [];

  const abnormalCount = observations.filter((o) => o.abnormal).length +
    logs.filter((l) => l.abnormal).length;

  let daysToReady = null;
  if (item.status === "可抄纸") {
    daysToReady = Number(item.days || 0);
  }

  const fermentDays = Number(item.days || 0);

  const waterChangeCount = observations.filter((o) =>
    String(o.changedWater || "").includes("是") ||
    String(o.changedWater || "").includes("有") ||
    String(o.changedWater || "").includes("已换") ||
    String(o.changedWater || "").toLowerCase() === "true" ||
    o.changedWater === true
  ).length;

  const lastObservations = observations.slice(-3).map((o) => ({
    at: o.at,
    temperature: o.temperature,
    smell: o.smell,
    fiber: o.fiber,
    changedWater: o.changedWater,
    abnormal: o.abnormal,
    abnormalNote: o.abnormalNote,
  }));

  const rule = findRuleForSource(db, item.source);

  return {
    id: item.id || item.code,
    code: item.code,
    source: item.source,
    vat: item.vat,
    vatId: item.vatId,
    days: fermentDays,
    expectedDays: Number(item.expectedDays || rule.minDays || 7),
    startDate: item.startDate,
    status: item.status,
    owner: item.owner,
    abnormalCount,
    daysToReady,
    waterChangeCount,
    waterChangeFrequency: fermentDays > 0
      ? (waterChangeCount / fermentDays).toFixed(2)
      : "0",
    lastObservations,
    observationCount: observations.length,
    ruleName: rule.name,
    minDays: rule.minDays,
    maxDays: rule.maxDays,
  };
}

export function getExperimentWithAnalysis(db, experiment) {
  const batches = (experiment.batchIds || []).map((bid) => {
    const item = db.items.find((i) => i.id === bid || i.code === bid);
    if (!item) return null;
    return analyzeBatchForComparison(db, item);
  }).filter(Boolean);

  return {
    ...experiment,
    batches,
    batchCount: batches.length,
    summary: {
      totalBatches: batches.length,
      avgAbnormal: batches.length
        ? (batches.reduce((s, b) => s + b.abnormalCount, 0) / batches.length).toFixed(1)
        : "0",
      avgDaysToReady: batches.filter((b) => b.daysToReady !== null).length
        ? (batches
            .filter((b) => b.daysToReady !== null)
            .reduce((s, b) => s + b.daysToReady, 0) /
          batches.filter((b) => b.daysToReady !== null).length
        ).toFixed(1)
        : "-",
      readyCount: batches.filter((b) => b.status === "可抄纸").length,
      abnormalBatches: batches.filter((b) => b.abnormalCount > 0).length,
    },
  };
}

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
  const emptyResult = {
    headers: [],
    detectedFields: [],
    detectedFieldCount: 0,
    totalFields: Object.keys(obsFieldAliases).length,
    rows: [],
    rowCount: 0,
  };

  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return emptyResult;

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
      abnormalNote: row.abnormalNote || "",
      at: row.at || new Date().toISOString(),
    };

    const evaluation = evaluateFermentationStatus(db, item, observation);
    const abnormal = evaluation.isAbnormal;
    const willTriggerAbnormal = abnormal && item.status !== "异常观察";
    const willBeReady = evaluation.willBeReady && item.status !== "可抄纸";

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
      newDays: evaluation.newDays,
      newStatus: evaluation.nextStatus,
      ruleName: evaluation.rule.name,
      reasons: evaluation.reasons,
      keywordMatched: evaluation.keywordMatched,
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

  const importEvents = [];
  let importedCount = 0;

  for (const match of previewData.matched) {
    try {
      let item = null;
      if (match.itemId) {
        item = db.items.find((x) => x.id === match.itemId);
      }
      if (!item && match.itemCode) {
        item = db.items.find((x) => x.code === match.itemCode);
      }
      if (!item) {
        results.failed.push({ match, reason: "批次不存在" });
        continue;
      }

      const observation = match.observation;
      const evaluation = evaluateFermentationStatus(db, item, observation);
      const abnormal = evaluation.isAbnormal;
      const obsAt = observation.at || new Date().toISOString();

      item.observations ||= [];
      item.observations.push({
        at: obsAt,
        temperature: observation.temperature || "",
        smell: observation.smell || "",
        fiber: observation.fiber || "",
        changedWater: observation.changedWater || "",
        abnormalNote: observation.abnormalNote || "",
        abnormal,
      });

      item.days = evaluation.newDays;
      item.status = evaluation.nextStatus;

      const reasonNote = evaluation.reasons.length > 0 ? "（判定依据：" + evaluation.reasons.join("；") + "，规则：" + evaluation.rule.name + "）" : "";
      const noteText =
        "温度" +
        (observation.temperature || "") +
        "，" +
        (observation.smell || "") +
        "，" +
        (observation.fiber || "") +
        reasonNote;
      item.logs ||= [];
      item.logs.push({
        at: obsAt,
        step: "观察",
        note: noteText,
        abnormal,
      });

      const obsEvent = createEvent(
        EVENT_TYPES.OBSERVATION_RECORDED,
        item.id || item.code,
        item.code,
        {
          temperature: observation.temperature || "",
          smell: observation.smell || "",
          fiber: observation.fiber || "",
          changedWater: observation.changedWater || "",
          abnormalNote: observation.abnormalNote || "",
          newStatus: evaluation.nextStatus,
          newDays: evaluation.newDays,
          step: "观察",
          note: noteText,
        },
        {
          timestamp: obsAt,
          source: "batch_import",
          operator: observation.operator || null,
          abnormal,
        }
      );
      importEvents.push(obsEvent);

      const ruleEvent = createEvent(
        EVENT_TYPES.RULE_EVALUATED,
        item.id || item.code,
        item.code,
        {
          ruleId: evaluation.rule.id,
          ruleName: evaluation.rule.name,
          nextStatus: evaluation.nextStatus,
          newDays: evaluation.newDays,
          reasons: evaluation.reasons,
          keywordMatched: evaluation.keywordMatched,
          triggered: evaluation.triggered,
          note: "规则判定：" + evaluation.rule.name + " → " + evaluation.nextStatus + (evaluation.reasons.length > 0 ? "（" + evaluation.reasons.join("；") + "）" : "（无触发项）"),
        },
        {
          timestamp: obsAt,
          source: "batch_import",
          operator: observation.operator || null,
          abnormal,
        }
      );
      importEvents.push(ruleEvent);

      importedCount += 1;
      results.success.push({
        itemCode: item.code,
        newStatus: item.status,
        newDays: item.days,
        ruleName: evaluation.rule.name,
        reasons: evaluation.reasons,
      });
    } catch (err) {
      results.failed.push({ match, reason: err.message });
    }
  }

  if (importedCount > 0) {
    const importEvent = createEvent(
      EVENT_TYPES.BATCH_IMPORTED,
      null,
      null,
      {
        importedCount,
        successCount: results.success.length,
        failedCount: results.failed.length,
        step: "批量导入",
        note: "批量导入 " + importedCount + " 条观察记录",
      },
      {
        source: "batch_import",
        abnormal: results.success.some(r => r.newStatus === "异常观察"),
      }
    );
    importEvents.push(importEvent);
    appendEvents(db, importEvents);
  }

  await saveDb(db);
  return results;
}

export function validateInspectionRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["记录格式错误"] };
  }
  if (!record.itemCode && !record.itemId) {
    errors.push("缺少批次编号或批次ID");
  }
  if (record.temperature !== undefined && record.temperature !== "") {
    const temp = Number(record.temperature);
    if (isNaN(temp) || temp < -20 || temp > 60) {
      errors.push("温度值超出合理范围(-20℃~60℃)");
    }
  }
  if (record.at) {
    const d = new Date(record.at);
    if (isNaN(d.getTime())) {
      errors.push("观察时间格式错误");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function applyOfflineInspections(db, inspections) {
  const results = {
    success: [],
    failed: [],
  };

  const inspectionEvents = [];

  for (const inspection of inspections) {
    try {
      const validation = validateInspectionRecord(inspection);
      if (!validation.valid) {
        results.failed.push({
          localId: inspection.localId,
          itemCode: inspection.itemCode,
          itemId: inspection.itemId,
          record: inspection,
          reason: validation.errors.join("；"),
        });
        continue;
      }

      let item = null;
      if (inspection.itemId) {
        item = db.items.find((x) => x.id === inspection.itemId);
      }
      if (!item && inspection.itemCode) {
        item = findItemByCode(db, inspection.itemCode);
      }
      if (!item) {
        results.failed.push({
          localId: inspection.localId,
          itemCode: inspection.itemCode,
          itemId: inspection.itemId,
          record: inspection,
          reason: '找不到批次"' + (inspection.itemCode || inspection.itemId) + '"',
        });
        continue;
      }

      const evaluation = evaluateFermentationStatus(db, item, inspection);
      const abnormal = evaluation.isAbnormal;
      const inspAt = inspection.at || new Date().toISOString();
      item.observations ||= [];
      item.observations.push({
        at: inspAt,
        temperature: inspection.temperature || "",
        smell: inspection.smell || "",
        fiber: inspection.fiber || "",
        changedWater: inspection.changedWater || "",
        abnormalNote: inspection.abnormalNote || "",
        abnormal,
      });

      item.days = evaluation.newDays;
      item.status = evaluation.nextStatus;

      const reasonNote = evaluation.reasons.length > 0 ? "（判定依据：" + evaluation.reasons.join("；") + "，规则：" + evaluation.rule.name + "）" : "";
      item.logs ||= [];
      const noteParts = [];
      if (inspection.temperature) noteParts.push("温度" + inspection.temperature);
      if (inspection.smell) noteParts.push(inspection.smell);
      if (inspection.fiber) noteParts.push(inspection.fiber);
      if (inspection.changedWater) noteParts.push("换水:" + inspection.changedWater);
      if (inspection.abnormalNote) noteParts.push("异常:" + inspection.abnormalNote);
      const noteText = (noteParts.join("，") || "现场巡检记录") + reasonNote;
      item.logs.push({
        at: inspAt,
        step: "现场巡检",
        note: noteText,
        abnormal,
      });

      const inspEvent = createEvent(
        EVENT_TYPES.INSPECTION_RECORDED,
        item.id || item.code,
        item.code,
        {
          temperature: inspection.temperature || "",
          smell: inspection.smell || "",
          fiber: inspection.fiber || "",
          changedWater: inspection.changedWater || "",
          abnormalNote: inspection.abnormalNote || "",
          newStatus: evaluation.nextStatus,
          newDays: evaluation.newDays,
          step: "现场巡检",
          note: noteText,
        },
        {
          timestamp: inspAt,
          source: "batch_inspection",
          operator: inspection.operator || null,
          abnormal,
        }
      );
      inspectionEvents.push(inspEvent);

      const ruleEvent = createEvent(
        EVENT_TYPES.RULE_EVALUATED,
        item.id || item.code,
        item.code,
        {
          ruleId: evaluation.rule.id,
          ruleName: evaluation.rule.name,
          nextStatus: evaluation.nextStatus,
          newDays: evaluation.newDays,
          reasons: evaluation.reasons,
          keywordMatched: evaluation.keywordMatched,
          triggered: evaluation.triggered,
          note: "规则判定：" + evaluation.rule.name + " → " + evaluation.nextStatus + (evaluation.reasons.length > 0 ? "（" + evaluation.reasons.join("；") + "）" : "（无触发项）"),
        },
        {
          timestamp: inspAt,
          source: "batch_inspection",
          operator: inspection.operator || null,
          abnormal,
        }
      );
      inspectionEvents.push(ruleEvent);

      results.success.push({
        localId: inspection.localId,
        itemCode: item.code,
        itemId: item.id,
        newStatus: item.status,
        newDays: item.days,
        recordedAt: inspection.at,
        ruleName: evaluation.rule.name,
        reasons: evaluation.reasons,
      });
    } catch (err) {
      results.failed.push({
        localId: inspection.localId,
        itemCode: inspection.itemCode,
        itemId: inspection.itemId,
        record: inspection,
        reason: err.message,
      });
    }
  }

  if (inspectionEvents.length > 0) {
    appendEvents(db, inspectionEvents);
  }

  return results;
}

export async function applyBatchInspections(db, inspections) {
  const results = applyOfflineInspections(db, inspections);
  if (results.success.length > 0) {
    await saveDb(db);
  }
  return results;
}

export function ensureFermentationRules(db) {
  if (!db.fermentationRules || !Array.isArray(db.fermentationRules) || db.fermentationRules.length === 0) {
    db.fermentationRules = [{ ...defaultRule }, ...builtinRules];
    return true;
  }
  const hasDefault = db.fermentationRules.some((r) => r.isDefault);
  if (!hasDefault) {
    db.fermentationRules.unshift({ ...defaultRule });
    return true;
  }
  return false;
}

export async function loadDbWithMigration() {
  const db = await loadDb();
  const migrated1 = ensureFermentationRules(db);
  const migrated2 = ensureExperiments(db);
  const migrated3 = ensureHandovers(db);
  const migrationResult = runEventMigration(db);
  const migrated4 = migrationResult.migrated;
  if (migrated1 || migrated2 || migrated3 || migrated4) {
    await saveDb(db);
  }
  return db;
}

export function listRules(db) {
  return db.fermentationRules || [];
}

export function getRuleById(db, id) {
  return (db.fermentationRules || []).find((r) => r.id === id) || null;
}

export function findRuleForSource(db, source) {
  const rules = db.fermentationRules || [];
  if (source) {
    const exact = rules.find((r) => r.source && r.source === source && !r.isDefault);
    if (exact) return exact;
  }
  return rules.find((r) => r.isDefault) || defaultRule;
}

export function newRuleId() {
  return "rule-" + Date.now();
}

export function validateRule(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["规则数据格式错误"] };
  }
  if (!input.name || String(input.name).trim() === "") {
    errors.push("规则名称不能为空");
  }
  if (!input.source || String(input.source).trim() === "") {
    errors.push("原料来源不能为空（使用 * 表示通用）");
  }
  const minDays = Number(input.minDays);
  const maxDays = Number(input.maxDays);
  if (isNaN(minDays) || minDays < 1) {
    errors.push("最短发酵天数必须是大于0的数字");
  }
  if (isNaN(maxDays) || maxDays < 1) {
    errors.push("最长发酵天数必须是大于0的数字");
  }
  if (!isNaN(minDays) && !isNaN(maxDays) && minDays > maxDays) {
    errors.push("最短发酵天数不能大于最长发酵天数");
  }
  const tMin = Number(input.temperatureMin);
  const tMax = Number(input.temperatureMax);
  if (isNaN(tMin)) {
    errors.push("温度下限必须是数字");
  }
  if (isNaN(tMax)) {
    errors.push("温度上限必须是数字");
  }
  if (!isNaN(tMin) && !isNaN(tMax) && tMin > tMax) {
    errors.push("温度下限不能大于温度上限");
  }
  if (input.abnormalKeywords && !Array.isArray(input.abnormalKeywords)) {
    errors.push("异常关键词必须是数组");
  }
  return { valid: errors.length === 0, errors };
}

export function createRule(db, input) {
  const validation = validateRule(input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  if (input.source !== "*") {
    const duplicate = (db.fermentationRules || []).find(
      (r) => !r.isDefault && r.source === input.source
    );
    if (duplicate) {
      return { success: false, errors: ['已有针对原料来源"' + input.source + '"的规则'] };
    }
  }
  const now = new Date().toISOString();
  const rule = {
    id: newRuleId(),
    name: String(input.name).trim(),
    source: String(input.source).trim(),
    isDefault: input.source === "*",
    minDays: Number(input.minDays),
    maxDays: Number(input.maxDays),
    temperatureMin: Number(input.temperatureMin),
    temperatureMax: Number(input.temperatureMax),
    abnormalKeywords: Array.isArray(input.abnormalKeywords)
      ? input.abnormalKeywords.filter((k) => String(k).trim() !== "")
      : [...defaultRule.abnormalKeywords],
    autoStatusRules: {
      onAbnormalKeyword: input.autoStatusRules?.onAbnormalKeyword || defaultRule.autoStatusRules.onAbnormalKeyword,
      onTemperatureOutOfRange: input.autoStatusRules?.onTemperatureOutOfRange || defaultRule.autoStatusRules.onTemperatureOutOfRange,
      onDaysReachedMin: input.autoStatusRules?.onDaysReachedMin || defaultRule.autoStatusRules.onDaysReachedMin,
      onDaysExceedMax: input.autoStatusRules?.onDaysExceedMax || defaultRule.autoStatusRules.onDaysExceedMax,
    },
    createdAt: now,
    updatedAt: now,
  };
  db.fermentationRules ||= [];
  if (rule.isDefault) {
    const idx = db.fermentationRules.findIndex((r) => r.isDefault);
    if (idx >= 0) {
      db.fermentationRules[idx] = { ...rule, id: db.fermentationRules[idx].id, createdAt: db.fermentationRules[idx].createdAt };
      return { success: true, rule: db.fermentationRules[idx] };
    }
  }
  db.fermentationRules.push(rule);
  return { success: true, rule };
}

export function updateRule(db, id, input) {
  const validation = validateRule(input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  const rule = getRuleById(db, id);
  if (!rule) {
    return { success: false, errors: ["规则不存在"] };
  }
  if (input.source !== "*" && input.source !== rule.source) {
    const duplicate = (db.fermentationRules || []).find(
      (r) => r.id !== id && !r.isDefault && r.source === input.source
    );
    if (duplicate) {
      return { success: false, errors: ['已有针对原料来源"' + input.source + '"的规则'] };
    }
  }
  rule.name = String(input.name).trim();
  rule.source = String(input.source).trim();
  rule.isDefault = rule.source === "*";
  rule.minDays = Number(input.minDays);
  rule.maxDays = Number(input.maxDays);
  rule.temperatureMin = Number(input.temperatureMin);
  rule.temperatureMax = Number(input.temperatureMax);
  if (Array.isArray(input.abnormalKeywords)) {
    rule.abnormalKeywords = input.abnormalKeywords.filter((k) => String(k).trim() !== "");
  }
  if (input.autoStatusRules) {
    rule.autoStatusRules = {
      onAbnormalKeyword: input.autoStatusRules.onAbnormalKeyword || rule.autoStatusRules.onAbnormalKeyword,
      onTemperatureOutOfRange: input.autoStatusRules.onTemperatureOutOfRange || rule.autoStatusRules.onTemperatureOutOfRange,
      onDaysReachedMin: input.autoStatusRules.onDaysReachedMin || rule.autoStatusRules.onDaysReachedMin,
      onDaysExceedMax: input.autoStatusRules.onDaysExceedMax || rule.autoStatusRules.onDaysExceedMax,
    };
  }
  rule.updatedAt = new Date().toISOString();
  return { success: true, rule };
}

export function deleteRule(db, id) {
  const idx = (db.fermentationRules || []).findIndex((r) => r.id === id);
  if (idx === -1) {
    return { success: false, errors: ["规则不存在"] };
  }
  if (db.fermentationRules[idx].isDefault) {
    return { success: false, errors: ["默认规则不能删除"] };
  }
  const deleted = db.fermentationRules.splice(idx, 1)[0];
  return { success: true, rule: deleted };
}

export function detectAbnormalByKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return { found: false, matched: [] };
  const str = String(text);
  const matched = keywords.filter((k) => str.includes(k));
  return { found: matched.length > 0, matched };
}

export function checkTemperatureInRange(temp, min, max) {
  if (temp === undefined || temp === null || String(temp).trim() === "") {
    return { inRange: true, isMissing: true };
  }
  const t = Number(temp);
  if (isNaN(t)) return { inRange: true, isMissing: true };
  return { inRange: t >= min && t <= max, value: t, isMissing: false };
}

export function buildReadinessReport(db, itemCodeOrId) {
  const item = db.items.find((x) => x.id === itemCodeOrId || x.code === itemCodeOrId);
  if (!item) return null;
  const itemKey = item.id || item.code;

  const vat = getVatById(db, item.vatId) || (db.vats || []).find((v) => v.name === item.vat) || null;
  const rule = findRuleForSource(db, item.source);

  const observations = item.observations || [];
  const logs = item.logs || [];
  const handovers = listHandovers(db, { batchId: itemKey }).map((h) => ({
    id: h.id,
    handedOverBy: h.handedOverBy,
    receivedBy: h.receivedBy,
    batchCodes: h.batchCodes || [],
    keyObservations: h.keyObservations,
    pendingAbnormalities: h.pendingAbnormalities,
    nextWaterChangeReminder: h.nextWaterChangeReminder,
    note: h.note,
    createdAt: h.createdAt,
  }));

  const lastObservations = observations.slice(-5).map((o) => ({
    at: o.at,
    temperature: o.temperature,
    smell: o.smell,
    fiber: o.fiber,
    changedWater: o.changedWater,
    abnormal: o.abnormal,
    abnormalNote: o.abnormalNote,
  })).reverse();

  const abnormalRecords = [
    ...observations.filter((o) => o.abnormal).map((o) => ({
      at: o.at,
      type: "观察",
      detail: o.abnormalNote || [o.smell, o.fiber].filter(Boolean).join("、"),
    })),
    ...logs.filter((l) => l.abnormal).map((l) => ({
      at: l.at,
      type: l.step || "日志",
      detail: l.note || "",
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const waterChangeCount = observations.filter((o) =>
    String(o.changedWater || "").includes("是") ||
    String(o.changedWater || "").includes("有") ||
    String(o.changedWater || "").includes("已换") ||
    String(o.changedWater || "").toLowerCase() === "true" ||
    o.changedWater === true
  ).length;

  const startDate = parseDate(item.startDate) || parseDate(logs[0]?.at);
  const fermentDays = Number(item.days || 0);
  const expectedDays = Number(item.expectedDays || rule.minDays || 7);

  let daysProgress = [];
  if (startDate) {
    const totalDays = Math.max(1, Math.min(fermentDays, 30));
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      const dayObs = observations.filter((o) => {
        const od = parseDate(o.at);
        return od && od.toDateString() === d.toDateString();
      });
      daysProgress.push({
        day: i + 1,
        date: formatDate(d),
        hasObservation: dayObs.length > 0,
        hasAbnormal: dayObs.some((o) => o.abnormal),
      });
    }
  }

  return {
    basicInfo: {
      code: item.code || item.id,
      source: item.source,
      status: item.status,
      owner: item.owner,
      startDate: item.startDate || (startDate ? formatDate(startDate) : null),
      fermentDays,
      expectedDays,
      minDays: rule.minDays,
      maxDays: rule.maxDays,
      progress: Math.min(100, Math.round((fermentDays / expectedDays) * 100)),
      isReady: item.status === "可抄纸",
      ruleName: rule.name,
    },
    vatInfo: vat ? {
      id: vat.id,
      name: vat.name,
      capacity: vat.capacity,
      location: vat.location,
      material: vat.material,
      note: vat.note,
    } : {
      name: item.vat || "-",
    },
    lastObservations,
    abnormalRecords,
    abnormalCount: abnormalRecords.length,
    observationCount: observations.length,
    waterChangeCount,
    handovers,
    latestHandover: handovers[0] || null,
    daysProgress,
    generatedAt: new Date().toISOString(),
  };
}

export function listReadyBatches(db) {
  return (db.items || [])
    .filter((item) => item.status === "可抄纸")
    .map((item) => ({
      id: item.id,
      code: item.code,
      source: item.source,
      vat: item.vat,
      owner: item.owner,
      days: item.days,
      startDate: item.startDate,
    }));
}

export function evaluateFermentationStatus(db, item, observation) {
  const rule = findRuleForSource(db, item.source);
  const newDays = Number(item.days || 0) + 1;
  const reasons = [];

  const abnormalFromCheckbox = isAbnormalObservation(observation || {});
  if (abnormalFromCheckbox) {
    reasons.push("异常标记");
  }

  const keywordText = [
    observation?.smell,
    observation?.fiber,
    observation?.abnormalNote,
    observation?.abnormal,
    observation?.note,
  ]
    .filter(Boolean)
    .join(" ");
  const keywordResult = detectAbnormalByKeywords(keywordText, rule.abnormalKeywords);
  if (keywordResult.found) {
    reasons.push("异常关键词: " + keywordResult.matched.join("、"));
  }

  const tempCheck = checkTemperatureInRange(observation?.temperature, rule.temperatureMin, rule.temperatureMax);
  const tempOutOfRange = !tempCheck.inRange && !tempCheck.isMissing;
  if (tempOutOfRange) {
    reasons.push("温度超出范围: " + tempCheck.value + "℃ (安全范围 " + rule.temperatureMin + "~" + rule.temperatureMax + "℃)");
  }

  const hasKeywordOrCheckbox = abnormalFromCheckbox || keywordResult.found;

  let nextStatus;
  let triggeredAbnormal = false;
  let triggeredTemp = false;
  let triggeredDaysExceed = false;
  let triggeredDaysReached = false;

  if (hasKeywordOrCheckbox && tempOutOfRange) {
    nextStatus = rule.autoStatusRules.onAbnormalKeyword;
    triggeredAbnormal = true;
  } else if (hasKeywordOrCheckbox) {
    nextStatus = rule.autoStatusRules.onAbnormalKeyword;
    triggeredAbnormal = true;
  } else if (tempOutOfRange) {
    nextStatus = rule.autoStatusRules.onTemperatureOutOfRange;
    triggeredTemp = true;
  } else if (newDays > rule.maxDays) {
    nextStatus = rule.autoStatusRules.onDaysExceedMax;
    triggeredDaysExceed = true;
    reasons.push("已超过最长发酵天数 " + rule.maxDays + " 天");
  } else if (newDays >= rule.minDays) {
    nextStatus = rule.autoStatusRules.onDaysReachedMin;
    triggeredDaysReached = true;
    reasons.push("已达到最短发酵天数 " + rule.minDays + " 天");
  } else {
    nextStatus = "发酵中";
  }

  return {
    rule,
    newDays,
    nextStatus,
    isAbnormal: nextStatus === "异常观察",
    willBeReady: nextStatus === "可抄纸",
    reasons,
    keywordMatched: keywordResult.matched,
    temperatureCheck: tempCheck,
    triggered: {
      abnormalCheckbox: abnormalFromCheckbox,
      abnormalKeyword: keywordResult.found,
      temperatureOutOfRange: tempOutOfRange,
      daysExceedMax: triggeredDaysExceed,
      daysReachedMin: triggeredDaysReached,
      effectiveRule: triggeredAbnormal
        ? "onAbnormalKeyword"
        : triggeredTemp
          ? "onTemperatureOutOfRange"
          : triggeredDaysExceed
            ? "onDaysExceedMax"
            : triggeredDaysReached
              ? "onDaysReachedMin"
              : "none",
    },
  };
}

export function newHandoverId() {
  return "HO-" + String(Date.now()).slice(-8);
}

export function ensureHandovers(db) {
  if (!db.handovers || !Array.isArray(db.handovers)) {
    db.handovers = [];
    return true;
  }
  return false;
}

export function listHandovers(db, options = {}) {
  let handovers = db.handovers || [];
  if (options.batchId) {
    handovers = handovers.filter((h) =>
      (h.batchIds || []).includes(options.batchId) ||
      (h.batchCodes || []).includes(options.batchId)
    );
  }
  if (options.batchCode) {
    handovers = handovers.filter((h) =>
      (h.batchCodes || []).includes(options.batchCode) ||
      (h.batchIds || []).includes(options.batchCode)
    );
  }
  if (options.person) {
    const p = options.person;
    handovers = handovers.filter((h) => h.handedOverBy === p || h.receivedBy === p);
  }
  return [...handovers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getHandoverById(db, id) {
  return (db.handovers || []).find((h) => h.id === id) || null;
}

export function validateHandover(db, input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["交接记录数据格式错误"], resolvedBatches: [] };
  }
  if (!input.handedOverBy || String(input.handedOverBy).trim() === "") {
    errors.push("交出人不能为空");
  }
  if (!input.receivedBy || String(input.receivedBy).trim() === "") {
    errors.push("接收人不能为空");
  }
  const inputBatchIds = Array.isArray(input.batchIds) ? input.batchIds : [];
  const inputBatchCodes = Array.isArray(input.batchCodes) ? input.batchCodes : [];
  if (inputBatchIds.length === 0 && inputBatchCodes.length === 0) {
    errors.push("请至少选择一个涉及批次");
  }

  const resolvedBatchIds = [];
  const resolvedBatchCodes = [];
  const invalidRefs = [];

  const allInputs = [...new Set([...inputBatchIds, ...inputBatchCodes])];
  for (const ref of allInputs) {
    const refTrim = String(ref).trim();
    if (!refTrim) continue;
    const item = db.items.find((i) =>
      (i.id && i.id === refTrim) ||
      (i.code && i.code === refTrim)
    );
    if (!item) {
      invalidRefs.push(refTrim);
    } else {
      const itemId = item.id || item.code;
      if (itemId && !resolvedBatchIds.includes(itemId)) resolvedBatchIds.push(itemId);
      if (item.code && !resolvedBatchCodes.includes(item.code)) resolvedBatchCodes.push(item.code);
    }
  }

  if (invalidRefs.length > 0) {
    errors.push("以下批次不存在：" + invalidRefs.join("、"));
  }
  if (resolvedBatchIds.length === 0 && errors.length === 0) {
    errors.push("请至少选择一个有效的批次");
  }

  return {
    valid: errors.length === 0,
    errors,
    resolvedBatches: resolvedBatchIds.map((id, idx) => ({
      id,
      code: resolvedBatchCodes[idx] || id,
    })),
    resolvedBatchIds,
    resolvedBatchCodes,
  };
}

export function createHandover(db, input) {
  const validation = validateHandover(db, input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const batchIds = validation.resolvedBatchIds;
  const batchCodes = validation.resolvedBatchCodes;

  const now = new Date().toISOString();
  const handover = {
    id: newHandoverId(),
    handedOverBy: String(input.handedOverBy).trim(),
    receivedBy: String(input.receivedBy).trim(),
    batchIds: [...new Set(batchIds)],
    batchCodes: [...new Set(batchCodes)],
    keyObservations: String(input.keyObservations || "").trim(),
    pendingAbnormalities: String(input.pendingAbnormalities || "").trim(),
    nextWaterChangeReminder: String(input.nextWaterChangeReminder || "").trim(),
    note: String(input.note || "").trim(),
    createdAt: now,
  };

  db.handovers ||= [];
  db.handovers.unshift(handover);

  const handoverNote = "交接给" + handover.receivedBy + "（交出人：" + handover.handedOverBy + "）";
  const handoverEvents = [];

  for (const bid of handover.batchIds) {
    const item = db.items.find((i) => i.id === bid || i.code === bid);
    if (item) {
      item.logs ||= [];
      item.logs.push({
        at: now,
        step: "交接",
        note: handoverNote,
      });

      const hoEvent = createEvent(
        EVENT_TYPES.HANDOVER_CREATED,
        item.id || item.code,
        item.code,
        {
          handoverId: handover.id,
          handedOverBy: handover.handedOverBy,
          receivedBy: handover.receivedBy,
          keyObservations: handover.keyObservations,
          pendingAbnormalities: handover.pendingAbnormalities,
          nextWaterChangeReminder: handover.nextWaterChangeReminder,
          step: "交接",
          note: handoverNote + (handover.note ? " · " + handover.note : ""),
        },
        {
          timestamp: now,
          source: "handover",
          operator: input.operator || handover.handedOverBy,
          abnormal: false,
        }
      );
      handoverEvents.push(hoEvent);
    }
  }

  if (handoverEvents.length > 0) {
    appendEvents(db, handoverEvents);
  }

  return { success: true, handover };
}

export function getHandoversByBatch(db, batchIdOrCode) {
  return listHandovers(db, { batchId: batchIdOrCode });
}

export function getLatestHandoverByBatch(db, batchIdOrCode) {
  const list = getHandoversByBatch(db, batchIdOrCode);
  return list.length > 0 ? list[0] : null;
}

export function getHandoverSummary(handover) {
  if (!handover) return null;
  return {
    id: handover.id,
    handedOverBy: handover.handedOverBy,
    receivedBy: handover.receivedBy,
    batchCodes: handover.batchCodes || [],
    keyObservations: handover.keyObservations,
    pendingAbnormalities: handover.pendingAbnormalities,
    nextWaterChangeReminder: handover.nextWaterChangeReminder,
    createdAt: handover.createdAt,
  };
}

export {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  createEvent,
  appendEvent,
  appendEvents,
  listEvents,
  getEventById,
  getEventsByBatch,
  migrateLogsToEvents,
  migrateObservationsToEvents,
  migrateItemToEvents,
  runEventMigration,
  rebuildBatchState,
  getEventStats,
  verifyMigration,
};
