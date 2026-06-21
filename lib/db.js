import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

      item.observations ||= [];
      item.observations.push({
        at: observation.at || new Date().toISOString(),
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
          (observation.fiber || "") +
          reasonNote,
        abnormal,
      });

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
      item.observations ||= [];
      item.observations.push({
        at: inspection.at || new Date().toISOString(),
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
      item.logs.push({
        at: inspection.at || new Date().toISOString(),
        step: "现场巡检",
        note: (noteParts.join("，") || "现场巡检记录") + reasonNote,
        abnormal,
      });

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
  const migrated = ensureFermentationRules(db);
  if (migrated) {
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

export function evaluateFermentationStatus(db, item, observation) {
  const rule = findRuleForSource(db, item.source);
  const newDays = Number(item.days || 0) + 1;
  const reasons = [];
  let abnormalFlag = false;

  const abnormalFromCheckbox = isAbnormalObservation(observation || {});
  if (abnormalFromCheckbox) {
    abnormalFlag = true;
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
    abnormalFlag = true;
    reasons.push("异常关键词: " + keywordResult.matched.join("、"));
  }

  const tempCheck = checkTemperatureInRange(observation?.temperature, rule.temperatureMin, rule.temperatureMax);
  if (!tempCheck.inRange && !tempCheck.isMissing) {
    if (!abnormalFlag) {
      abnormalFlag = true;
      reasons.push("温度超出范围: " + tempCheck.value + "℃ (安全范围 " + rule.temperatureMin + "~" + rule.temperatureMax + "℃)");
    }
  }

  let nextStatus;
  if (abnormalFlag) {
    nextStatus = rule.autoStatusRules.onAbnormalKeyword;
  } else if (newDays > rule.maxDays) {
    nextStatus = rule.autoStatusRules.onDaysExceedMax;
    reasons.push("已超过最长发酵天数 " + rule.maxDays + " 天");
  } else if (newDays >= rule.minDays) {
    nextStatus = rule.autoStatusRules.onDaysReachedMin;
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
  };
}
