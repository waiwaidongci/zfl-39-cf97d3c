export const EVENT_TYPES = {
  BATCH_CREATED: "batch.created",
  OBSERVATION_RECORDED: "observation.recorded",
  STATUS_CHANGED: "status.changed",
  NOTE_ADDED: "note.added",
  BATCH_IMPORTED: "batch.imported",
  RULE_EVALUATED: "rule.evaluated",
  HANDOVER_CREATED: "handover.created",
  INSPECTION_RECORDED: "inspection.recorded",
};

export const EVENT_TYPE_LABELS = {
  [EVENT_TYPES.BATCH_CREATED]: "批次创建",
  [EVENT_TYPES.OBSERVATION_RECORDED]: "观察记录",
  [EVENT_TYPES.STATUS_CHANGED]: "状态变更",
  [EVENT_TYPES.NOTE_ADDED]: "备注追加",
  [EVENT_TYPES.BATCH_IMPORTED]: "批量导入",
  [EVENT_TYPES.RULE_EVALUATED]: "规则判定",
  [EVENT_TYPES.HANDOVER_CREATED]: "交接记录",
  [EVENT_TYPES.INSPECTION_RECORDED]: "现场巡检",
};

function newEventId() {
  return "EVT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function ensureEventsArray(db) {
  if (!db.events || !Array.isArray(db.events)) {
    db.events = [];
    return true;
  }
  return false;
}

function normalizeTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function createEvent(type, batchId, batchCode, data, options = {}) {
  const now = new Date().toISOString();
  const timestamp = normalizeTimestamp(options.timestamp || now);
  return {
    id: options.id || newEventId(),
    type,
    batchId: batchId || null,
    batchCode: batchCode || null,
    timestamp,
    data: data || {},
    metadata: {
      source: options.source || "system",
      operator: options.operator || null,
      abnormal: options.abnormal === true,
      note: options.note || "",
      ...(options.metadata || {}),
    },
    version: options.version || 1,
    _migrated: options._migrated || false,
    _migratedFrom: options._migratedFrom || null,
  };
}

export function appendEvent(db, event) {
  ensureEventsArray(db);
  if (!event.id) event.id = newEventId();
  if (!event.timestamp) event.timestamp = new Date().toISOString();
  if (!event.version) event.version = 1;
  if (!event.data) event.data = {};
  if (!event.metadata) event.metadata = {};
  db.events.push(event);
  db.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return event;
}

export function appendEvents(db, events) {
  ensureEventsArray(db);
  for (const evt of events) {
    if (!evt.id) evt.id = newEventId();
    if (!evt.timestamp) evt.timestamp = new Date().toISOString();
    if (!evt.version) evt.version = 1;
    if (!evt.data) evt.data = {};
    if (!evt.metadata) evt.metadata = {};
    db.events.push(evt);
  }
  db.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return events;
}

export function listEvents(db, filters = {}) {
  ensureEventsArray(db);
  let events = [...db.events];

  if (filters.batchId) {
    events = events.filter((e) => e.batchId === filters.batchId || e.batchCode === filters.batchId);
  }
  if (filters.batchCode) {
    events = events.filter((e) => e.batchCode === filters.batchCode || e.batchId === filters.batchCode);
  }
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    events = events.filter((e) => types.includes(e.type));
  }
  if (filters.abnormal !== undefined && filters.abnormal !== null) {
    const isAbnormal = filters.abnormal === true || filters.abnormal === "true" || filters.abnormal === "1";
    events = events.filter((e) => e.metadata?.abnormal === isAbnormal);
  }
  if (filters.startTime) {
    const start = new Date(filters.startTime).getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() >= start);
  }
  if (filters.endTime) {
    const end = new Date(filters.endTime).getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() <= end);
  }
  if (filters.source) {
    events = events.filter((e) => e.metadata?.source === filters.source);
  }
  if (filters.operator) {
    events = events.filter((e) => e.metadata?.operator === filters.operator);
  }

  if (filters.sort === "desc") {
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } else {
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  if (filters.limit) {
    const limit = Number(filters.limit) || 0;
    if (limit > 0) {
      events = events.slice(0, limit);
    }
  }

  return events;
}

export function getEventById(db, id) {
  ensureEventsArray(db);
  return db.events.find((e) => e.id === id) || null;
}

export function getEventsByBatch(db, batchIdOrCode) {
  return listEvents(db, { batchId: batchIdOrCode, sort: "asc" });
}

const STEP_TO_EVENT_TYPE = {
  "建档": EVENT_TYPES.BATCH_CREATED,
  "创建": EVENT_TYPES.BATCH_CREATED,
  "观察": EVENT_TYPES.OBSERVATION_RECORDED,
  "状态": EVENT_TYPES.STATUS_CHANGED,
  "备注": EVENT_TYPES.NOTE_ADDED,
  "交接": EVENT_TYPES.HANDOVER_CREATED,
  "现场巡检": EVENT_TYPES.INSPECTION_RECORDED,
  "导入": EVENT_TYPES.BATCH_IMPORTED,
  "批量导入": EVENT_TYPES.BATCH_IMPORTED,
  "规则判定": EVENT_TYPES.RULE_EVALUATED,
};

function detectEventTypeFromStep(step) {
  if (!step) return EVENT_TYPES.NOTE_ADDED;
  for (const [key, type] of Object.entries(STEP_TO_EVENT_TYPE)) {
    if (step.includes(key)) return type;
  }
  return EVENT_TYPES.NOTE_ADDED;
}

export function migrateLogsToEvents(db, item) {
  const events = [];
  const batchId = item.id || item.code;
  const batchCode = item.code || null;

  const logs = item.logs || [];
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const eventType = detectEventTypeFromStep(log.step);
    const event = createEvent(
      eventType,
      batchId,
      batchCode,
      {
        step: log.step || "",
        note: log.note || "",
        originalIndex: i,
      },
      {
        timestamp: log.at,
        abnormal: log.abnormal === true,
        source: "migration",
        _migrated: true,
        _migratedFrom: "logs[" + i + "]",
      }
    );
    events.push(event);
  }

  return events;
}

export function migrateObservationsToEvents(db, item) {
  const events = [];
  const batchId = item.id || item.code;
  const batchCode = item.code || null;

  const observations = item.observations || [];
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const isAbnormal = obs.abnormal === true;
    const noteParts = [];
    if (obs.temperature) noteParts.push("温度" + obs.temperature);
    if (obs.smell) noteParts.push(obs.smell);
    if (obs.fiber) noteParts.push(obs.fiber);
    if (obs.changedWater) noteParts.push("换水:" + obs.changedWater);
    if (obs.abnormalNote) noteParts.push("异常:" + obs.abnormalNote);

    const event = createEvent(
      EVENT_TYPES.OBSERVATION_RECORDED,
      batchId,
      batchCode,
      {
        temperature: obs.temperature || "",
        smell: obs.smell || "",
        fiber: obs.fiber || "",
        changedWater: obs.changedWater || "",
        abnormalNote: obs.abnormalNote || "",
        originalIndex: i,
      },
      {
        timestamp: obs.at,
        abnormal: isAbnormal,
        note: noteParts.join("，"),
        source: "migration",
        _migrated: true,
        _migratedFrom: "observations[" + i + "]",
      }
    );
    events.push(event);
  }

  return events;
}

export function migrateItemToEvents(db, item) {
  const events = [];
  const batchId = item.id || item.code;
  const batchCode = item.code || null;

  const createEventData = {
    source: item.source || "",
    vat: item.vat || "",
    vatId: item.vatId || "",
    owner: item.owner || "",
    expectedDays: item.expectedDays || 7,
    startDate: item.startDate || "",
    status: "入缸",
    step: "建档",
    note: "创建纸浆批次，入" + (item.vat || ""),
  };

  const firstLog = (item.logs || [])[0];
  const createTimestamp = firstLog?.at || item.startDate || new Date().toISOString();

  events.push(createEvent(
    EVENT_TYPES.BATCH_CREATED,
    batchId,
    batchCode,
    createEventData,
    {
      timestamp: createTimestamp,
      abnormal: false,
      source: "migration",
      _migrated: true,
      _migratedFrom: "item.initial_state",
    }
  ));

  const logEvents = migrateLogsToEvents(db, item);
  const obsEvents = migrateObservationsToEvents(db, item);

  events.push(...logEvents.filter(e => e.data?.step !== "建档"));
  events.push(...obsEvents);

  if (item.status && item.status !== "入缸") {
    events.push(createEvent(
      EVENT_TYPES.STATUS_CHANGED,
      batchId,
      batchCode,
      {
        oldStatus: "入缸",
        newStatus: item.status,
        newDays: item.days || 0,
        step: "状态",
        note: "迁移时状态同步：" + item.status,
      },
      {
        timestamp: new Date().toISOString(),
        abnormal: item.status === "异常观察",
        source: "migration",
        _migrated: true,
        _migratedFrom: "item.status_reconciliation",
      }
    ));
  }

  events.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    if (aTime !== bTime) return aTime - bTime;
    if (a.type === EVENT_TYPES.BATCH_CREATED) return -1;
    if (b.type === EVENT_TYPES.BATCH_CREATED) return 1;
    return 0;
  });

  return events;
}

export function runMigration(db) {
  ensureEventsArray(db);
  const result = {
    migrated: false,
    totalItems: 0,
    totalEvents: 0,
    itemsMigrated: 0,
    details: [],
  };

  const items = db.items || [];
  result.totalItems = items.length;

  for (const item of items) {
    const batchKey = item.id || item.code;
    const existingEvents = db.events.filter(
      (e) => (e.batchId === batchKey || e.batchCode === batchKey) && e._migrated
    );
    if (existingEvents.length > 0) {
      result.details.push({ batch: batchKey, skipped: true, reason: "already_migrated" });
      continue;
    }

    const events = migrateItemToEvents(db, item);
    if (events.length > 0) {
      appendEvents(db, events);
      result.totalEvents += events.length;
      result.itemsMigrated += 1;
      result.migrated = true;
      result.details.push({ batch: batchKey, eventCount: events.length, skipped: false });
    } else {
      result.details.push({ batch: batchKey, eventCount: 0, skipped: true, reason: "no_data" });
    }
  }

  return result;
}

export function rebuildBatchState(db, batchIdOrCode) {
  const events = getEventsByBatch(db, batchIdOrCode);
  if (events.length === 0) return null;

  let state = {
    id: null,
    code: null,
    source: "",
    vat: "",
    vatId: "",
    days: 0,
    expectedDays: 7,
    startDate: null,
    owner: "",
    status: "入缸",
    logs: [],
    observations: [],
    latestObservation: null,
    abnormalCount: 0,
    totalObservations: 0,
    _reconstructedFrom: events.length + " events",
    _eventIds: events.map((e) => e.id),
  };

  const firstEvent = events[0];
  state.id = firstEvent.batchId;
  state.code = firstEvent.batchCode;

  for (const event of events) {
    state = applyEventToState(state, event);
  }

  return state;
}

function applyEventToState(state, event) {
  const next = { ...state };
  const data = event.data || {};
  const meta = event.metadata || {};

  switch (event.type) {
    case EVENT_TYPES.BATCH_CREATED:
      if (data.source) next.source = data.source;
      if (data.vat) next.vat = data.vat;
      if (data.vatId) next.vatId = data.vatId;
      if (data.owner) next.owner = data.owner;
      if (data.status) next.status = data.status;
      if (data.expectedDays !== undefined) next.expectedDays = Number(data.expectedDays) || 7;
      if (event.timestamp && !next.startDate) {
        next.startDate = event.timestamp.slice(0, 10);
      }
      if (data.startDate) next.startDate = data.startDate;
      next.logs.push({
        at: event.timestamp,
        step: data.step || "建档",
        note: data.note || "创建纸浆批次",
        abnormal: meta.abnormal === true,
      });
      break;

    case EVENT_TYPES.OBSERVATION_RECORDED:
    case EVENT_TYPES.INSPECTION_RECORDED: {
      const obs = {
        at: event.timestamp,
        temperature: data.temperature || "",
        smell: data.smell || "",
        fiber: data.fiber || "",
        changedWater: data.changedWater || "",
        abnormalNote: data.abnormalNote || "",
        abnormal: meta.abnormal === true,
      };
      next.observations.push(obs);
      next.latestObservation = obs;
      next.totalObservations += 1;
      if (meta.abnormal === true) next.abnormalCount += 1;

      if (data.step || data.note) {
        next.logs.push({
          at: event.timestamp,
          step: data.step || (event.type === EVENT_TYPES.INSPECTION_RECORDED ? "现场巡检" : "观察"),
          note: data.note || "",
          abnormal: meta.abnormal === true,
        });
      }

      if (data.newStatus) {
        next.status = data.newStatus;
      }
      if (data.newDays !== undefined && data.newDays !== null) {
        const nd = Number(data.newDays);
        if (!isNaN(nd) && nd > next.days) next.days = nd;
      }
      break;
    }

    case EVENT_TYPES.STATUS_CHANGED:
      if (data.newStatus) next.status = data.newStatus;
      if (data.newDays !== undefined && data.newDays !== null) {
        const nd = Number(data.newDays);
        if (!isNaN(nd)) next.days = nd;
      }
      next.logs.push({
        at: event.timestamp,
        step: data.step || "状态",
        note: data.note || ("更新为" + (data.newStatus || "")),
        abnormal: meta.abnormal === true,
      });
      break;

    case EVENT_TYPES.NOTE_ADDED:
      next.logs.push({
        at: event.timestamp,
        step: data.step || "备注",
        note: data.note || "",
        abnormal: meta.abnormal === true,
      });
      break;

    case EVENT_TYPES.RULE_EVALUATED:
      if (data.nextStatus) next.status = data.nextStatus;
      if (data.newDays !== undefined && data.newDays !== null) {
        const nd = Number(data.newDays);
        if (!isNaN(nd) && nd > next.days) next.days = nd;
      }
      next.logs.push({
        at: event.timestamp,
        step: "规则判定",
        note: data.note || (data.reasons ? "判定依据: " + data.reasons.join("；") : ""),
        abnormal: meta.abnormal === true,
      });
      break;

    case EVENT_TYPES.HANDOVER_CREATED:
      if (data.receivedBy) next.owner = data.receivedBy;
      next.logs.push({
        at: event.timestamp,
        step: "交接",
        note: data.note || "",
        abnormal: false,
      });
      break;

    case EVENT_TYPES.BATCH_IMPORTED:
      if (data.importedCount) next.totalObservations += Number(data.importedCount) || 0;
      next.logs.push({
        at: event.timestamp,
        step: "批量导入",
        note: data.note || ("导入 " + (data.importedCount || 0) + " 条记录"),
        abnormal: meta.abnormal === true,
      });
      break;

    default:
      next.logs.push({
        at: event.timestamp,
        step: data.step || event.type,
        note: data.note || "",
        abnormal: meta.abnormal === true,
      });
  }

  return next;
}

export function getEventStats(db) {
  ensureEventsArray(db);
  const events = db.events;
  const typeCounts = {};
  const batchSet = new Set();
  let abnormalCount = 0;
  let migratedCount = 0;

  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    if (e.batchId) batchSet.add(e.batchId);
    if (e.batchCode) batchSet.add(e.batchCode);
    if (e.metadata?.abnormal) abnormalCount += 1;
    if (e._migrated) migratedCount += 1;
  }

  const typeStats = Object.entries(typeCounts).map(([type, count]) => ({
    type,
    label: EVENT_TYPE_LABELS[type] || type,
    count,
  }));

  return {
    totalEvents: events.length,
    totalBatches: batchSet.size,
    abnormalCount,
    migratedCount,
    nativeCount: events.length - migratedCount,
    typeStats,
    earliest: events.length > 0 ? events[0].timestamp : null,
    latest: events.length > 0 ? events[events.length - 1].timestamp : null,
  };
}

export function verifyMigration(db) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    totalItems: 0,
    itemsChecked: 0,
    itemsPassed: 0,
    itemsFailed: 0,
    details: [],
  };

  const items = db.items || [];
  result.totalItems = items.length;

  for (const item of items) {
    const batchKey = item.id || item.code;
    result.itemsChecked += 1;
    const itemResult = {
      batch: batchKey,
      passed: true,
      issues: [],
    };

    const events = getEventsByBatch(db, batchKey);
    if (events.length === 0) {
      itemResult.passed = false;
      itemResult.issues.push("no_events_found");
      result.errors.push("批次 " + batchKey + " 没有找到任何事件");
    }

    const expectedLogCount = (item.logs || []).length + (item.observations || []).length;
    const migratedEvents = events.filter((e) => e._migrated);
    if (migratedEvents.length < expectedLogCount) {
      itemResult.issues.push(
        "migrated_count_mismatch: expected " +
          expectedLogCount +
          ", got " +
          migratedEvents.length
      );
      result.warnings.push(
        "批次 " +
          batchKey +
          " 迁移事件数不匹配: 期望 " +
          expectedLogCount +
          ", 实际 " +
          migratedEvents.length
      );
    }

    const rebuilt = rebuildBatchState(db, batchKey);
    if (rebuilt) {
      if (item.status && rebuilt.status !== item.status) {
        itemResult.issues.push(
          "status_mismatch: expected " + item.status + ", got " + rebuilt.status
        );
        result.warnings.push(
          "批次 " +
            batchKey +
            " 重建状态不匹配: 期望 " +
            item.status +
            ", 实际 " +
            rebuilt.status
        );
      }

      const itemObsCount = (item.observations || []).length;
      if (rebuilt.totalObservations < itemObsCount) {
        itemResult.issues.push(
          "observation_count_mismatch: expected " +
            itemObsCount +
            ", got " +
            rebuilt.totalObservations
        );
        result.warnings.push(
          "批次 " +
            batchKey +
            " 重建观察数不匹配: 期望 " +
            itemObsCount +
            ", 实际 " +
            rebuilt.totalObservations
        );
      }
    }

    if (!itemResult.passed) {
      result.itemsFailed += 1;
      result.valid = false;
    } else {
      result.itemsPassed += 1;
    }
    result.details.push(itemResult);
  }

  return result;
}
