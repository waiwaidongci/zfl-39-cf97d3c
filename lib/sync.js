import { createEvent, appendEvents, EVENT_TYPES } from "./events.js";

export const CONFLICT_TYPES = {
  STATUS_CONFLICT: "status_conflict",
  OBSERVATION_DUPLICATE: "observation_duplicate",
  OWNER_CHANGED: "owner_changed",
  VAT_NAME_MISMATCH: "vat_name_mismatch",
  ITEM_MISSING_LOCAL: "item_missing_local",
  ITEM_MISSING_REMOTE: "item_missing_remote",
  EVENT_CONFLICT: "event_conflict",
};

export const CONFLICT_TYPE_LABELS = {
  [CONFLICT_TYPES.STATUS_CONFLICT]: "状态冲突",
  [CONFLICT_TYPES.OBSERVATION_DUPLICATE]: "观察记录重复",
  [CONFLICT_TYPES.OWNER_CHANGED]: "负责人变更",
  [CONFLICT_TYPES.VAT_NAME_MISMATCH]: "浸泡缸名称不一致",
  [CONFLICT_TYPES.ITEM_MISSING_LOCAL]: "本地缺失该批次",
  [CONFLICT_TYPES.ITEM_MISSING_REMOTE]: "对方缺失该批次",
  [CONFLICT_TYPES.EVENT_CONFLICT]: "事件冲突",
};

export const RESOLVE_STRATEGIES = {
  USE_LOCAL: "use_local",
  USE_REMOTE: "use_remote",
  KEEP_BOTH: "keep_both",
  CUSTOM: "custom",
};

export const RESOLVE_STRATEGY_LABELS = {
  [RESOLVE_STRATEGIES.USE_LOCAL]: "保留本地",
  [RESOLVE_STRATEGIES.USE_REMOTE]: "采用对方",
  [RESOLVE_STRATEGIES.KEEP_BOTH]: "两者都保留",
  [RESOLVE_STRATEGIES.CUSTOM]: "自定义合并",
};

function ensureSyncMetadata(db) {
  if (!db.syncMetadata) {
    db.syncMetadata = {
      workshopId: generateWorkshopId(),
      workshopName: "本地工坊",
      lastExportAt: null,
      lastImportAt: null,
    };
  }
  if (!db.syncHistory) {
    db.syncHistory = [];
  }
  return db;
}

function generateWorkshopId() {
  return "WS-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function newSyncId() {
  return "SYNC-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isEmptyValue(v) {
  return v === undefined || v === null || v === "";
}

function hasSignificantConflict(localVal, remoteVal) {
  if (isEmptyValue(localVal) && isEmptyValue(remoteVal)) return false;
  if (isEmptyValue(localVal) || isEmptyValue(remoteVal)) return false;
  return localVal !== remoteVal;
}

function getWorkshopInfo(db) {
  ensureSyncMetadata(db);
  return {
    workshopId: db.syncMetadata.workshopId,
    workshopName: db.syncMetadata.workshopName,
  };
}

export function setWorkshopInfo(db, workshopName, workshopId) {
  ensureSyncMetadata(db);
  if (workshopName) db.syncMetadata.workshopName = String(workshopName).trim();
  if (workshopId) db.syncMetadata.workshopId = String(workshopId).trim();
  return getWorkshopInfo(db);
}

export function createExportPackage(db, options = {}) {
  ensureSyncMetadata(db);
  const workshopInfo = getWorkshopInfo(db);

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: workshopInfo.workshopId,
    exportedByName: workshopInfo.workshopName,
    workshop: workshopInfo,
    items: [],
    events: [],
    vats: db.vats || [],
    fermentationRules: db.fermentationRules || [],
  };

  const items = db.items || [];
  const allBatchCodes = new Set();
  const allEventIds = new Set();

  const since = options.since ? new Date(options.since).getTime() : null;
  const batchFilter = options.batchCodes || null;

  for (const item of items) {
    const itemCode = item.code || item.id;
    if (batchFilter && !batchFilter.includes(itemCode)) continue;

    const itemClone = deepClone(item);
    if (itemClone._syncSource) delete itemClone._syncSource;
    exportData.items.push(itemClone);
    allBatchCodes.add(itemCode);
  }

  const events = db.events || [];
  for (const evt of events) {
    const batchCode = evt.batchCode || evt.batchId;
    if (batchFilter && batchCode && !batchFilter.includes(batchCode)) continue;
    if (since && evt.timestamp && new Date(evt.timestamp).getTime() < since) continue;

    const evtClone = deepClone(evt);
    if (evtClone.metadata?.source === "sync_import") continue;
    if (evtClone.metadata) {
      evtClone.metadata.importedFrom = workshopInfo.workshopId;
      evtClone.metadata.importedFromName = workshopInfo.workshopName;
    }
    exportData.events.push(evtClone);
    if (evt.id) allEventIds.add(evt.id);
  }

  db.syncMetadata.lastExportAt = exportData.exportedAt;

  return {
    package: exportData,
    stats: {
      itemCount: exportData.items.length,
      eventCount: exportData.events.length,
      vatCount: exportData.vats.length,
      ruleCount: exportData.fermentationRules.length,
      workshopId: workshopInfo.workshopId,
      workshopName: workshopInfo.workshopName,
    },
  };
}

export function validateImportPackage(pkg) {
  const errors = [];
  const warnings = [];

  if (!pkg || typeof pkg !== "object") {
    errors.push("导出包格式错误：不是有效的JSON对象");
    return { valid: false, errors, warnings };
  }

  if (!pkg.version) {
    warnings.push("导出包缺少version字段，默认为版本1");
  }
  if (!pkg.exportedAt) {
    warnings.push("导出包缺少exportedAt时间戳");
  }
  if (!pkg.workshop) {
    errors.push("导出包缺少workshop工坊信息");
  } else {
    if (!pkg.workshop.workshopId) {
      errors.push("工坊信息缺少workshopId标识");
    }
    if (!pkg.workshop.workshopName) {
      warnings.push("工坊信息缺少workshopName名称");
    }
  }
  if (!Array.isArray(pkg.items)) {
    errors.push("导出包items字段必须是数组");
  }
  if (!Array.isArray(pkg.events)) {
    errors.push("导出包events字段必须是数组");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function findLocalItem(db, remoteItem) {
  const code = remoteItem.code || remoteItem.id;
  if (!code) return null;
  return (db.items || []).find(
    (i) => (i.code && i.code === code) || (i.id && i.id === code)
  );
}

function isSameObservation(obs1, obs2) {
  if (!obs1 || !obs2) return false;
  const t1 = obs1.at ? new Date(obs1.at).getTime() : null;
  const t2 = obs2.at ? new Date(obs2.at).getTime() : null;
  if (t1 && t2 && Math.abs(t1 - t2) < 60000) {
    if (obs1.temperature === obs2.temperature &&
        obs1.smell === obs2.smell &&
        obs1.fiber === obs2.fiber) {
      return true;
    }
  }
  return false;
}

export function detectConflicts(db, importPkg) {
  ensureSyncMetadata(db);
  const conflicts = [];
  const matchedItems = [];
  const newItems = [];

  const remoteItems = importPkg.items || [];
  const remoteEvents = importPkg.events || [];
  const localWorkshopId = db.syncMetadata.workshopId;
  const remoteWorkshopId = importPkg.workshop?.workshopId || "unknown";

  for (const remoteItem of remoteItems) {
    const localItem = findLocalItem(db, remoteItem);
    const itemCode = remoteItem.code || remoteItem.id;

    if (!localItem) {
      conflicts.push({
        id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        type: CONFLICT_TYPES.ITEM_MISSING_LOCAL,
        batchCode: itemCode,
        description: `本地没有批次 ${itemCode}，将从${importPkg.workshop?.workshopName || "对方工坊"}新增`,
        local: null,
        remote: remoteItem,
        defaultStrategy: RESOLVE_STRATEGIES.USE_REMOTE,
        availableStrategies: [RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.USE_LOCAL],
        resolved: false,
        resolution: null,
      });
      newItems.push({ remote: remoteItem });
      continue;
    }

    matchedItems.push({ local: localItem, remote: remoteItem });

    if (hasSignificantConflict(localItem.status, remoteItem.status)) {
      conflicts.push({
        id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        type: CONFLICT_TYPES.STATUS_CONFLICT,
        batchCode: itemCode,
        description: `批次 ${itemCode} 状态不一致：本地是"${localItem.status}"，对方是"${remoteItem.status}"`,
        field: "status",
        local: { status: localItem.status, updatedAt: getLatestUpdateTime(localItem) },
        remote: { status: remoteItem.status, updatedAt: getLatestUpdateTime(remoteItem) },
        defaultStrategy: compareUpdateTime(localItem, remoteItem) >= 0
          ? RESOLVE_STRATEGIES.USE_LOCAL
          : RESOLVE_STRATEGIES.USE_REMOTE,
        availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.CUSTOM],
        resolved: false,
        resolution: null,
      });
    }

    if (hasSignificantConflict(localItem.owner, remoteItem.owner)) {
      conflicts.push({
        id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        type: CONFLICT_TYPES.OWNER_CHANGED,
        batchCode: itemCode,
        description: `批次 ${itemCode} 负责人不一致：本地是"${localItem.owner || "(空)"}"，对方是"${remoteItem.owner || "(空)"}"`,
        field: "owner",
        local: { owner: localItem.owner, updatedAt: getLatestUpdateTime(localItem) },
        remote: { owner: remoteItem.owner, updatedAt: getLatestUpdateTime(remoteItem) },
        defaultStrategy: compareUpdateTime(localItem, remoteItem) >= 0
          ? RESOLVE_STRATEGIES.USE_LOCAL
          : RESOLVE_STRATEGIES.USE_REMOTE,
        availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.CUSTOM],
        resolved: false,
        resolution: null,
      });
    }

    if (hasSignificantConflict(localItem.vat, remoteItem.vat)) {
      conflicts.push({
        id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        type: CONFLICT_TYPES.VAT_NAME_MISMATCH,
        batchCode: itemCode,
        description: `批次 ${itemCode} 浸泡缸名称不一致：本地是"${localItem.vat || "(空)"}"，对方是"${remoteItem.vat || "(空)"}"`,
        field: "vat",
        local: { vat: localItem.vat, vatId: localItem.vatId, updatedAt: getLatestUpdateTime(localItem) },
        remote: { vat: remoteItem.vat, vatId: remoteItem.vatId, updatedAt: getLatestUpdateTime(remoteItem) },
        defaultStrategy: compareUpdateTime(localItem, remoteItem) >= 0
          ? RESOLVE_STRATEGIES.USE_LOCAL
          : RESOLVE_STRATEGIES.USE_REMOTE,
        availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.CUSTOM],
        resolved: false,
        resolution: null,
      });
    }

    const localObs = localItem.observations || [];
    const remoteObs = remoteItem.observations || [];
    const duplicates = [];
    for (const rObs of remoteObs) {
      for (const lObs of localObs) {
        if (isSameObservation(lObs, rObs)) {
          if (JSON.stringify(lObs) !== JSON.stringify(rObs)) {
            duplicates.push({ local: lObs, remote: rObs });
          }
          break;
        }
      }
    }
    if (duplicates.length > 0) {
      conflicts.push({
        id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        type: CONFLICT_TYPES.OBSERVATION_DUPLICATE,
        batchCode: itemCode,
        description: `批次 ${itemCode} 有 ${duplicates.length} 条可能重复的观察记录`,
        field: "observations",
        local: { observationCount: localObs.length, sample: localObs.slice(-3) },
        remote: { observationCount: remoteObs.length, sample: remoteObs.slice(-3) },
        duplicates: duplicates,
        defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
        availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.KEEP_BOTH],
        resolved: false,
        resolution: null,
      });
    }
  }

  const localBatchCodes = new Set((db.items || []).map((i) => i.code || i.id));
  for (const remoteCode of remoteItems.map((i) => i.code || i.id)) {
    localBatchCodes.delete(remoteCode);
  }
  for (const code of localBatchCodes) {
    const localItem = (db.items || []).find((i) => (i.code === code) || (i.id === code));
    conflicts.push({
      id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      type: CONFLICT_TYPES.ITEM_MISSING_REMOTE,
      batchCode: code,
      description: `对方没有批次 ${code}，本地的该批次不会被修改`,
      local: localItem,
      remote: null,
      defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
      availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL],
      resolved: false,
      resolution: null,
    });
  }

  const localEventIds = new Set((db.events || []).map((e) => e.id).filter(Boolean));
  const conflictEvents = [];
  for (const rEvt of remoteEvents) {
    if (rEvt.id && localEventIds.has(rEvt.id)) {
      const lEvt = (db.events || []).find((e) => e.id === rEvt.id);
      if (lEvt && JSON.stringify(lEvt.data) !== JSON.stringify(rEvt.data)) {
        conflictEvents.push({ local: lEvt, remote: rEvt });
      }
    }
  }
  if (conflictEvents.length > 0) {
    const batchCodes = [...new Set(conflictEvents.map((c) => c.remote.batchCode || c.remote.batchId))];
    conflicts.push({
      id: "CFL-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      type: CONFLICT_TYPES.EVENT_CONFLICT,
      batchCode: batchCodes.join(", "),
      description: `有 ${conflictEvents.length} 条事件ID相同但内容不同，涉及批次：${batchCodes.join("、")}`,
      field: "events",
      local: { eventCount: conflictEvents.length, samples: conflictEvents.slice(0, 3) },
      remote: { eventCount: conflictEvents.length, samples: conflictEvents.slice(0, 3) },
      eventConflicts: conflictEvents,
      defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
      availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.KEEP_BOTH],
      resolved: false,
      resolution: null,
    });
  }

  return {
    conflicts,
    summary: {
      totalConflicts: conflicts.length,
      byType: countByType(conflicts),
      matchedItemCount: matchedItems.length,
      newItemCount: newItems.length,
      remoteWorkshopId,
      remoteWorkshopName: importPkg.workshop?.workshopName || "未知工坊",
      localWorkshopId,
      localWorkshopName: db.syncMetadata.workshopName,
      remoteItemCount: remoteItems.length,
      remoteEventCount: remoteEvents.length,
      exportedAt: importPkg.exportedAt,
    },
  };
}

function countByType(conflicts) {
  const result = {};
  for (const c of conflicts) {
    result[c.type] = (result[c.type] || 0) + 1;
  }
  return result;
}

function getLatestUpdateTime(item) {
  const logs = item.logs || [];
  const obs = item.observations || [];
  const times = [];
  for (const l of logs) if (l.at) times.push(new Date(l.at).getTime());
  for (const o of obs) if (o.at) times.push(new Date(o.at).getTime());
  if (times.length === 0) return 0;
  return Math.max(...times);
}

function compareUpdateTime(itemA, itemB) {
  return getLatestUpdateTime(itemA) - getLatestUpdateTime(itemB);
}

export function resolveConflict(conflict, strategy, customValue) {
  const resolved = { ...conflict, resolved: true };

  switch (strategy) {
    case RESOLVE_STRATEGIES.USE_LOCAL:
      resolved.resolution = { strategy, value: conflict.local, note: "采用本地版本" };
      break;
    case RESOLVE_STRATEGIES.USE_REMOTE:
      resolved.resolution = { strategy, value: conflict.remote, note: "采用对方版本" };
      break;
    case RESOLVE_STRATEGIES.KEEP_BOTH:
      resolved.resolution = { strategy, value: { local: conflict.local, remote: conflict.remote }, note: "两者都保留" };
      break;
    case RESOLVE_STRATEGIES.CUSTOM:
      resolved.resolution = { strategy, value: customValue, note: "自定义合并" };
      break;
    default:
      resolved.resolution = { strategy: conflict.defaultStrategy, value: conflict.local, note: "使用默认策略" };
  }

  return resolved;
}

export function applyMerge(db, importPkg, resolvedConflicts) {
  ensureSyncMetadata(db);
  const mergeResult = {
    itemsCreated: 0,
    itemsUpdated: 0,
    eventsAdded: 0,
    conflictsResolved: resolvedConflicts?.length || 0,
    skipped: 0,
    details: [],
  };

  const conflictMap = {};
  for (const c of resolvedConflicts || []) {
    if (!c.resolved) continue;
    const key = c.batchCode + "|" + c.type;
    conflictMap[key] = c;
  }

  const remoteItems = importPkg.items || [];

  for (const remoteItem of remoteItems) {
    const itemCode = remoteItem.code || remoteItem.id;
    const localItem = findLocalItem(db, remoteItem);

    if (!localItem) {
      const missingConflict = conflictMap[itemCode + "|" + CONFLICT_TYPES.ITEM_MISSING_LOCAL];
      if (missingConflict && missingConflict.resolution?.strategy === RESOLVE_STRATEGIES.USE_LOCAL) {
        mergeResult.skipped++;
        mergeResult.details.push({ batch: itemCode, action: "skipped", reason: "按策略忽略新增" });
        continue;
      }

      const newItem = deepClone(remoteItem);
      newItem._syncSource = importPkg.workshop?.workshopId || "unknown";
      newItem.id = newItem.id || ("PF-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
      db.items ||= [];
      db.items.push(newItem);
      mergeResult.itemsCreated++;
      mergeResult.details.push({ batch: itemCode, action: "created" });
      continue;
    }

    const updatedItem = deepClone(localItem);

    const statusConflict = conflictMap[itemCode + "|" + CONFLICT_TYPES.STATUS_CONFLICT];
    if (statusConflict?.resolved) {
      if (statusConflict.resolution.strategy === RESOLVE_STRATEGIES.USE_REMOTE) {
        updatedItem.status = remoteItem.status;
      } else if (statusConflict.resolution.strategy === RESOLVE_STRATEGIES.CUSTOM && statusConflict.resolution.value) {
        updatedItem.status = statusConflict.resolution.value.status || updatedItem.status;
      }
    } else if (!statusConflict) {
      if (isEmptyValue(updatedItem.status) && !isEmptyValue(remoteItem.status)) {
        updatedItem.status = remoteItem.status;
      } else if (getLatestUpdateTime(remoteItem) > getLatestUpdateTime(localItem) && !isEmptyValue(remoteItem.status)) {
        updatedItem.status = remoteItem.status;
      }
    }

    const ownerConflict = conflictMap[itemCode + "|" + CONFLICT_TYPES.OWNER_CHANGED];
    if (ownerConflict?.resolved) {
      if (ownerConflict.resolution.strategy === RESOLVE_STRATEGIES.USE_REMOTE) {
        updatedItem.owner = remoteItem.owner;
      } else if (ownerConflict.resolution.strategy === RESOLVE_STRATEGIES.CUSTOM && ownerConflict.resolution.value) {
        updatedItem.owner = ownerConflict.resolution.value.owner || updatedItem.owner;
      }
    } else if (!ownerConflict) {
      if (!updatedItem.owner && remoteItem.owner) {
        updatedItem.owner = remoteItem.owner;
      }
    }

    const vatConflict = conflictMap[itemCode + "|" + CONFLICT_TYPES.VAT_NAME_MISMATCH];
    if (vatConflict?.resolved) {
      if (vatConflict.resolution.strategy === RESOLVE_STRATEGIES.USE_REMOTE) {
        updatedItem.vat = remoteItem.vat;
        updatedItem.vatId = remoteItem.vatId || updatedItem.vatId;
      } else if (vatConflict.resolution.strategy === RESOLVE_STRATEGIES.CUSTOM && vatConflict.resolution.value) {
        updatedItem.vat = vatConflict.resolution.value.vat || updatedItem.vat;
        updatedItem.vatId = vatConflict.resolution.value.vatId || updatedItem.vatId;
      }
    } else if (!vatConflict) {
      if (!updatedItem.vat && remoteItem.vat) {
        updatedItem.vat = remoteItem.vat;
        updatedItem.vatId = remoteItem.vatId || updatedItem.vatId;
      }
    }

    const obsConflict = conflictMap[itemCode + "|" + CONFLICT_TYPES.OBSERVATION_DUPLICATE];
    const localObs = updatedItem.observations || [];
    const remoteObs = remoteItem.observations || [];
    const mergedObs = [...localObs];

    if (obsConflict?.resolved) {
      if (obsConflict.resolution.strategy === RESOLVE_STRATEGIES.USE_REMOTE) {
        for (const rObs of remoteObs) {
          const dup = mergedObs.find((o) => isSameObservation(o, rObs));
          if (dup) Object.assign(dup, rObs);
          else mergedObs.push(deepClone(rObs));
        }
      } else if (obsConflict.resolution.strategy === RESOLVE_STRATEGIES.KEEP_BOTH) {
        for (const rObs of remoteObs) {
          mergedObs.push(deepClone(rObs));
        }
      } else {
        for (const rObs of remoteObs) {
          const dup = mergedObs.find((o) => isSameObservation(o, rObs));
          if (!dup) mergedObs.push(deepClone(rObs));
        }
      }
    } else {
      for (const rObs of remoteObs) {
        const dup = mergedObs.find((o) => isSameObservation(o, rObs));
        if (!dup) mergedObs.push(deepClone(rObs));
      }
    }
    mergedObs.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    updatedItem.observations = mergedObs;

    const localLogs = updatedItem.logs || [];
    const remoteLogs = remoteItem.logs || [];
    for (const rLog of remoteLogs) {
      const exists = localLogs.find((l) =>
        l.at === rLog.at && l.step === rLog.step && l.note === rLog.note
      );
      if (!exists) localLogs.push(deepClone(rLog));
    }
    localLogs.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    updatedItem.logs = localLogs;

    if (remoteItem.days !== undefined && (updatedItem.days === undefined || remoteItem.days > updatedItem.days)) {
      updatedItem.days = remoteItem.days;
    }
    if (remoteItem.expectedDays && !updatedItem.expectedDays) {
      updatedItem.expectedDays = remoteItem.expectedDays;
    }
    if (remoteItem.source && !updatedItem.source) {
      updatedItem.source = remoteItem.source;
    }
    if (remoteItem.startDate && !updatedItem.startDate) {
      updatedItem.startDate = remoteItem.startDate;
    }

    updatedItem._syncSource = importPkg.workshop?.workshopId || (updatedItem._syncSource || "local");

    const idx = db.items.findIndex((i) => (i.code === itemCode) || (i.id === itemCode));
    if (idx >= 0) db.items[idx] = updatedItem;
    mergeResult.itemsUpdated++;
    mergeResult.details.push({ batch: itemCode, action: "updated" });
  }

  const remoteEvents = importPkg.events || [];
  const eventConflict = (resolvedConflicts || []).find((c) => c.type === CONFLICT_TYPES.EVENT_CONFLICT);
  const eventStrategy = eventConflict?.resolution?.strategy || RESOLVE_STRATEGIES.USE_LOCAL;
  const localEventIds = new Set((db.events || []).map((e) => e.id).filter(Boolean));

  const newEvents = [];
  for (const rEvt of remoteEvents) {
    if (rEvt.id && localEventIds.has(rEvt.id)) {
      if (eventStrategy === RESOLVE_STRATEGIES.USE_REMOTE) {
        const idx = db.events.findIndex((e) => e.id === rEvt.id);
        if (idx >= 0) {
          const updatedEvt = deepClone(rEvt);
          updatedEvt.metadata ||= {};
          updatedEvt.metadata.source = "sync_import";
          updatedEvt.metadata.importedAt = new Date().toISOString();
          db.events[idx] = updatedEvt;
          mergeResult.eventsAdded++;
        }
      } else if (eventStrategy === RESOLVE_STRATEGIES.KEEP_BOTH) {
        const newEvt = deepClone(rEvt);
        newEvt.id = "EVT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        newEvt.metadata ||= {};
        newEvt.metadata.source = "sync_import";
        newEvt.metadata.importedAt = new Date().toISOString();
        newEvt.metadata.originalEventId = rEvt.id;
        newEvents.push(newEvt);
      }
      continue;
    }
    const newEvt = deepClone(rEvt);
    newEvt.metadata ||= {};
    newEvt.metadata.source = "sync_import";
    newEvt.metadata.importedAt = new Date().toISOString();
    newEvents.push(newEvt);
  }

  if (newEvents.length > 0) {
    appendEvents(db, newEvents);
    mergeResult.eventsAdded += newEvents.length;
  }

  const importRemoteVats = importPkg.vats || [];
  for (const rVat of importRemoteVats) {
    const exists = (db.vats || []).find((v) =>
      (v.id && v.id === rVat.id) || (v.name && v.name === rVat.name)
    );
    if (!exists) {
      db.vats ||= [];
      db.vats.push(deepClone(rVat));
    }
  }

  db.syncMetadata.lastImportAt = new Date().toISOString();

  const syncRecord = {
    id: newSyncId(),
    type: "import",
    remoteWorkshopId: importPkg.workshop?.workshopId,
    remoteWorkshopName: importPkg.workshop?.workshopName,
    timestamp: new Date().toISOString(),
    result: mergeResult,
    conflictCount: (resolvedConflicts || []).length,
    resolvedCount: (resolvedConflicts || []).filter((c) => c.resolved).length,
  };
  db.syncHistory ||= [];
  db.syncHistory.unshift(syncRecord);

  return { mergeResult, syncRecord };
}

export function recordExport(db, stats) {
  ensureSyncMetadata(db);
  const syncRecord = {
    id: newSyncId(),
    type: "export",
    remoteWorkshopId: null,
    remoteWorkshopName: null,
    timestamp: new Date().toISOString(),
    result: stats,
    conflictCount: 0,
    resolvedCount: 0,
  };
  db.syncHistory ||= [];
  db.syncHistory.unshift(syncRecord);
  return syncRecord;
}

export function listSyncHistory(db, options = {}) {
  ensureSyncMetadata(db);
  let history = [...(db.syncHistory || [])];

  if (options.type) {
    history = history.filter((h) => h.type === options.type);
  }
  if (options.limit) {
    history = history.slice(0, Number(options.limit));
  }

  return history;
}

export function getSyncHistoryById(db, id) {
  ensureSyncMetadata(db);
  return (db.syncHistory || []).find((h) => h.id === id) || null;
}
