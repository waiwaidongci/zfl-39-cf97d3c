import {
  loadDb, loadDbWithMigration, saveDb, body, send, newId, computeStats, summarize, stages,
  newVatId, getVatById, computeVatBoard, parseObservationText, previewBatchImport,
  applyBatchImport, applyBatchInspections, validateInspectionRecord,
  listRules, getRuleById, createRule, updateRule, deleteRule, findRuleForSource,
  evaluateFermentationStatus, isAbnormalObservation, ruleFields, autoStatusOptions,
  listExperiments, getExperimentById, createExperiment, updateExperiment,
  deleteExperiment, addBatchesToExperiment, removeBatchFromExperiment,
  getExperimentWithAnalysis, buildReadinessReport, listReadyBatches,
  listHandovers, getHandoverById, createHandover, getHandoversByBatch,
  getLatestHandoverByBatch, getHandoverSummary, getBatchHandoverDetails,
  EVENT_TYPES, EVENT_TYPE_LABELS, createEvent, appendEvent, appendEvents,
  listEvents, getEventById, getEventsByBatch, rebuildBatchState,
  getEventStats, runEventMigration, verifyMigration,
  setWorkshopInfo, createExportPackage, validateImportPackage, detectConflicts,
  resolveConflict, applyMerge, recordExport, listSyncHistory, getSyncHistoryById,
} from "../lib/db.js";
import { buildAllTimeline, uniqueValues } from "../lib/timeline.js";

export async function handleApi(req, res, url, method) {
  const db = await loadDbWithMigration();

  if (method === "GET" && url.pathname === "/api/items") {
    const items = db.items.map((item) => {
      const summary = summarize(item);
      const latestHandover = getLatestHandoverByBatch(db, item.id || item.code);
      return { ...summary, latestHandover: latestHandover ? getHandoverSummary(latestHandover) : null };
    });
    return send(res, 200, items);
  }

  if (method === "POST" && url.pathname === "/api/items") {
    const input = await body(req);
    const item = {
      id: newId(),
      ...input,
      logs: [{ at: new Date().toISOString(), step: "建档", note: "创建纸浆批次" }],
    };
    db.items.unshift(item);
    const event = createEvent(
      EVENT_TYPES.BATCH_CREATED,
      item.id,
      item.code,
      {
        source: item.source || "",
        vat: item.vat || "",
        vatId: item.vatId || "",
        owner: item.owner || "",
        status: item.status || "入缸",
        expectedDays: item.expectedDays || 7,
        startDate: item.startDate || "",
        step: "建档",
        note: "创建纸浆批次",
      },
      { source: "api", operator: input.operator || null }
    );
    appendEvent(db, event);
    await saveDb(db);
    return send(res, 201, item);
  }

  const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
  if (patch && method === "PATCH") {
    const item = db.items.find((x) => x.id === patch[1] || x.code === patch[1]);
    if (!item) return send(res, 404, { error: "item_not_found" });
    const oldStatus = item.status;
    const input = await body(req);
    Object.assign(item, input);
    item.logs ||= [];
    item.logs.push({ at: new Date().toISOString(), step: "状态", note: "更新为" + item.status });
    const event = createEvent(
      EVENT_TYPES.STATUS_CHANGED,
      item.id || item.code,
      item.code,
      {
        oldStatus,
        newStatus: item.status,
        step: "状态",
        note: "更新为" + item.status,
      },
      { source: "api", operator: input.operator || null }
    );
    appendEvent(db, event);
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
    const event = createEvent(
      EVENT_TYPES.NOTE_ADDED,
      item.id || item.code,
      item.code,
      {
        step: input.step || "记录",
        note: input.note || "",
      },
      { source: "api", operator: input.operator || null }
    );
    appendEvent(db, event);
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
    const observation = { at: new Date().toISOString(), ...input, abnormal };
    item.observations.push(observation);
    const evaluation = evaluateFermentationStatus(db, item, input);
    item.days = evaluation.newDays;
    item.status = evaluation.nextStatus;
    const rule = evaluation.rule;
    const reasonNote = evaluation.reasons.length > 0 ? "（判定依据：" + evaluation.reasons.join("；") + "，规则：" + rule.name + "）" : "";
    const noteText = "温度" + (input.temperature || "") + "，" + (input.smell || "") + "，" + (input.fiber || "") + reasonNote;
    item.logs.push({
      at: new Date().toISOString(),
      step: "观察",
      note: noteText,
      abnormal: evaluation.isAbnormal,
    });

    const obsEvent = createEvent(
      EVENT_TYPES.OBSERVATION_RECORDED,
      item.id || item.code,
      item.code,
      {
        temperature: input.temperature || "",
        smell: input.smell || "",
        fiber: input.fiber || "",
        changedWater: input.changedWater || "",
        abnormalNote: input.abnormalNote || "",
        newStatus: evaluation.nextStatus,
        newDays: evaluation.newDays,
        step: "观察",
        note: noteText,
      },
      {
        source: "api",
        operator: input.operator || null,
        abnormal: evaluation.isAbnormal,
      }
    );
    appendEvent(db, obsEvent);

    if (evaluation.reasons.length > 0) {
      const ruleEvent = createEvent(
        EVENT_TYPES.RULE_EVALUATED,
        item.id || item.code,
        item.code,
          {
            ruleId: rule.id,
            ruleName: rule.name,
            nextStatus: evaluation.nextStatus,
            newDays: evaluation.newDays,
            reasons: evaluation.reasons,
            keywordMatched: evaluation.keywordMatched,
            triggered: evaluation.triggered,
            note: "规则判定：" + rule.name + " → " + evaluation.nextStatus + "（" + evaluation.reasons.join("；") + "）",
          },
          {
            source: "api",
            operator: input.operator || null,
            abnormal: evaluation.isAbnormal,
          }
      );
      appendEvent(db, ruleEvent);
    }

    await saveDb(db);
    return send(res, 201, { ...item, evaluation });
  }

  if (method === "GET" && url.pathname === "/api/stats") {
    return send(res, 200, computeStats(db.items));
  }

  if (method === "GET" && url.pathname === "/api/timeline") {
    const filterCode = url.searchParams.get("code") || "";
    const filterVat = url.searchParams.get("vat") || "";
    const filterOwner = url.searchParams.get("owner") || "";
    const events = buildAllTimeline(db.items, { code: filterCode, vat: filterVat, owner: filterOwner });
    const handovers = listHandovers(db);
    for (const h of handovers) {
      for (const batchCode of h.batchCodes || []) {
        const item = db.items.find((i) => i.code === batchCode || i.id === batchCode);
        if (!item) continue;
        if (filterCode && !(item.code || "").toLowerCase().includes(filterCode.toLowerCase()) && !(item.id || "").toLowerCase().includes(filterCode.toLowerCase())) continue;
        if (filterVat && !(item.vat || "").includes(filterVat)) continue;
        if (filterOwner && h.handedOverBy !== filterOwner && h.receivedBy !== filterOwner && !(item.owner || "").includes(filterOwner)) continue;
        events.push({
          itemId: item.id || item.code,
          code: item.code,
          vat: item.vat,
          owner: item.owner,
          source: item.source,
          batchStatus: item.status,
          at: h.createdAt,
          type: "handover",
          step: "交接",
          note: h.handedOverBy + " → " + h.receivedBy + (h.keyObservations ? " · 观察：" + h.keyObservations : "") + (h.pendingAbnormalities ? " · 异常：" + h.pendingAbnormalities : "") + (h.nextWaterChangeReminder ? " · 换水提醒：" + h.nextWaterChangeReminder : ""),
          abnormal: false,
          handoverId: h.id,
          handedOverBy: h.handedOverBy,
          receivedBy: h.receivedBy,
          keyObservations: h.keyObservations,
          pendingAbnormalities: h.pendingAbnormalities,
          nextWaterChangeReminder: h.nextWaterChangeReminder,
        });
      }
    }
    events.sort((a, b) => new Date(a.at) - new Date(b.at));
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

  if (method === "POST" && url.pathname === "/api/import/preview") {
    const input = await body(req);
    const text = input.text || "";
    const parsed = parseObservationText(text);
    const preview = previewBatchImport(db, parsed);
    return send(res, 200, { parsed, preview });
  }

  if (method === "POST" && url.pathname === "/api/import/apply") {
    const input = await body(req);
    const previewData = input.previewData;
    if (!previewData || !previewData.matched || previewData.matched.length === 0) {
      return send(res, 400, { error: "no_matched_data", message: "没有可导入的匹配数据" });
    }
    const results = await applyBatchImport(db, previewData);
    return send(res, 200, results);
  }

  if (method === "GET" && url.pathname === "/api/items/active") {
    const activeItems = (db.items || []).filter(
      (item) => item.status === "发酵中" || item.status === "入缸" || item.status === "异常观察"
    );
    return send(res, 200, activeItems.map(summarize));
  }

  if (method === "POST" && url.pathname === "/api/inspections/batch") {
    const input = await body(req);
    const inspections = input.inspections || input;
    if (!Array.isArray(inspections) || inspections.length === 0) {
      return send(res, 400, { error: "invalid_data", message: "巡检记录不能为空" });
    }
    const previewErrors = [];
    for (let i = 0; i < inspections.length; i++) {
      const v = validateInspectionRecord(inspections[i]);
      if (!v.valid) {
        previewErrors.push({ index: i, errors: v.errors });
      }
    }
    if (previewErrors.length > 0 && previewErrors.length === inspections.length) {
      return send(res, 400, { error: "all_records_invalid", validationErrors: previewErrors });
    }
    const results = await applyBatchInspections(db, inspections);
    return send(res, 200, {
      success: results.success,
      failed: results.failed,
      total: inspections.length,
      successCount: results.success.length,
      failedCount: results.failed.length,
    });
  }

  if (method === "GET" && url.pathname === "/api/rules") {
    return send(res, 200, {
      rules: listRules(db),
      fields: ruleFields,
      autoStatusOptions,
    });
  }

  if (method === "GET" && url.pathname === "/api/rules/meta") {
    return send(res, 200, {
      fields: ruleFields,
      autoStatusOptions,
    });
  }

  const ruleMatch = url.pathname.match(/^\/api\/rules\/([^/]+)$/);
  if (ruleMatch && method === "GET") {
    const rule = getRuleById(db, ruleMatch[1]);
    if (!rule) return send(res, 404, { error: "rule_not_found" });
    return send(res, 200, rule);
  }

  if (method === "POST" && url.pathname === "/api/rules") {
    const input = await body(req);
    const result = createRule(db, input);
    if (!result.success) {
      return send(res, 400, { error: "validation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 201, result.rule);
  }

  if (ruleMatch && method === "PATCH") {
    const input = await body(req);
    const result = updateRule(db, ruleMatch[1], input);
    if (!result.success) {
      return send(res, 400, { error: "validation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, result.rule);
  }

  if (ruleMatch && method === "DELETE") {
    const result = deleteRule(db, ruleMatch[1]);
    if (!result.success) {
      return send(res, 400, { error: "delete_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, result.rule);
  }

  if (method === "POST" && url.pathname === "/api/rules/evaluate") {
    const input = await body(req);
    const item = input.item;
    const observation = input.observation || {};
    if (!item) {
      return send(res, 400, { error: "missing_item", message: "缺少批次信息" });
    }
    const evaluation = evaluateFermentationStatus(db, item, observation);
    return send(res, 200, evaluation);
  }

  if (method === "GET" && url.pathname === "/api/rules/for-source") {
    const source = url.searchParams.get("source") || "";
    const rule = findRuleForSource(db, source);
    return send(res, 200, { rule, source });
  }

  if (method === "GET" && url.pathname === "/api/experiments") {
    const experiments = listExperiments(db).map((e) => getExperimentWithAnalysis(db, e));
    return send(res, 200, experiments);
  }

  if (method === "POST" && url.pathname === "/api/experiments") {
    const input = await body(req);
    const result = createExperiment(db, input);
    if (!result.success) {
      return send(res, 400, { error: "validation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 201, result.experiment);
  }

  const expMatch = url.pathname.match(/^\/api\/experiments\/([^/]+)$/);
  if (expMatch && method === "GET") {
    const experiment = getExperimentById(db, expMatch[1]);
    if (!experiment) return send(res, 404, { error: "experiment_not_found" });
    return send(res, 200, getExperimentWithAnalysis(db, experiment));
  }

  if (expMatch && method === "PATCH") {
    const input = await body(req);
    const result = updateExperiment(db, expMatch[1], input);
    if (!result.success) {
      return send(res, 400, { error: "validation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, result.experiment);
  }

  if (expMatch && method === "DELETE") {
    const result = deleteExperiment(db, expMatch[1]);
    if (!result.success) {
      return send(res, 400, { error: "delete_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, result.experiment);
  }

  const expAddBatches = url.pathname.match(/^\/api\/experiments\/([^/]+)\/batches$/);
  if (expAddBatches && method === "POST") {
    const input = await body(req);
    const batchIds = Array.isArray(input) ? input : input.batchIds || [];
    const result = addBatchesToExperiment(db, expAddBatches[1], batchIds);
    if (!result.success) {
      return send(res, 400, { error: "operation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, { experiment: result.experiment, addedCount: result.addedCount });
  }

  const expRemoveBatch = url.pathname.match(/^\/api\/experiments\/([^/]+)\/batches\/([^/]+)$/);
  if (expRemoveBatch && method === "DELETE") {
    const result = removeBatchFromExperiment(db, expRemoveBatch[1], expRemoveBatch[2]);
    if (!result.success) {
      return send(res, 400, { error: "operation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 200, result.experiment);
  }

  if (method === "GET" && url.pathname === "/api/reports/ready-batches") {
    return send(res, 200, { batches: listReadyBatches(db) });
  }

  const reportMatch = url.pathname.match(/^\/api\/reports\/readiness\/([^/]+)$/);
  if (reportMatch && method === "GET") {
    const report = buildReadinessReport(db, reportMatch[1]);
    if (!report) return send(res, 404, { error: "batch_not_found", message: "找不到该批次" });
    if (!report.basicInfo.isReady) {
      return send(res, 400, { error: "not_ready", message: "该批次状态不是可抄纸，无法生成评估报告" });
    }
    return send(res, 200, report);
  }

  if (method === "GET" && url.pathname === "/api/handovers") {
    const batchId = url.searchParams.get("batchId") || "";
    const batchCode = url.searchParams.get("batchCode") || "";
    const person = url.searchParams.get("person") || "";
    const options = {};
    if (batchId) options.batchId = batchId;
    if (batchCode) options.batchCode = batchCode;
    if (person) options.person = person;
    const handovers = listHandovers(db, options);
    const batches = (db.items || []).map((item) => ({
      id: item.id || item.code,
      code: item.code,
      source: item.source,
      status: item.status,
      vat: item.vat,
      owner: item.owner,
    }));
    const allOwners = [...new Set((db.items || []).map((i) => i.owner).filter(Boolean))];
    return send(res, 200, { handovers, batches, owners: allOwners });
  }

  if (method === "POST" && url.pathname === "/api/handovers") {
    const input = await body(req);
    const result = createHandover(db, input);
    if (!result.success) {
      return send(res, 400, { error: "validation_error", errors: result.errors });
    }
    await saveDb(db);
    return send(res, 201, result.handover);
  }

  const handoverMatch = url.pathname.match(/^\/api\/handovers\/([^/]+)$/);
  if (handoverMatch && method === "GET") {
    const handover = getHandoverById(db, handoverMatch[1]);
    if (!handover) return send(res, 404, { error: "handover_not_found", message: "找不到该交接记录" });
    return send(res, 200, handover);
  }

  const batchHandoverMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/handovers$/);
  if (batchHandoverMatch && method === "GET") {
    const handovers = getHandoversByBatch(db, batchHandoverMatch[1]);
    return send(res, 200, { handovers });
  }

  const batchHandoverDetailsMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/handover-details$/);
  if (batchHandoverDetailsMatch && method === "GET") {
    const details = getBatchHandoverDetails(db, batchHandoverDetailsMatch[1]);
    if (!details) return send(res, 404, { error: "batch_not_found", message: "找不到该批次" });
    return send(res, 200, details);
  }

  const batchLastHandoverMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/last-handover$/);
  if (batchLastHandoverMatch && method === "GET") {
    const handover = getLatestHandoverByBatch(db, batchLastHandoverMatch[1]);
    return send(res, 200, { handover: handover ? getHandoverSummary(handover) : null });
  }

  if (method === "GET" && url.pathname === "/api/events/stats") {
    const stats = getEventStats(db);
    return send(res, 200, stats);
  }

  if (method === "GET" && url.pathname === "/api/events") {
    const filters = {
      batchId: url.searchParams.get("batchId") || url.searchParams.get("batchCode") || "",
      batchCode: url.searchParams.get("batchCode") || url.searchParams.get("batchId") || "",
      type: url.searchParams.get("type") || "",
      abnormal: url.searchParams.get("abnormal") || null,
      startTime: url.searchParams.get("startTime") || url.searchParams.get("start") || "",
      endTime: url.searchParams.get("endTime") || url.searchParams.get("end") || "",
      source: url.searchParams.get("source") || "",
      operator: url.searchParams.get("operator") || "",
      sort: url.searchParams.get("sort") || "desc",
      limit: url.searchParams.get("limit") || 0,
    };
    const events = listEvents(db, filters);
    const allBatches = [...new Set(
      (db.items || []).map((i) => i.code || i.id).filter(Boolean),
    )];
    const typeOptions = Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => ({ type, label }));
    return send(res, 200, {
      events,
      total: events.length,
      batches: allBatches,
      typeOptions,
    });
  }

  const eventMatch = url.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch && method === "GET") {
    const event = getEventById(db, eventMatch[1]);
    if (!event) return send(res, 404, { error: "event_not_found" });
    return send(res, 200, event);
  }

  const eventRebuildMatch = url.pathname.match(/^\/api\/events\/batch\/([^/]+)$/);
  if (eventRebuildMatch && method === "GET") {
    const batchId = decodeURIComponent(eventRebuildMatch[1]);
    const events = getEventsByBatch(db, batchId);
    const rebuilt = rebuildBatchState(db, batchId);
    return send(res, 200, { events, rebuiltState: rebuilt });
  }

  const eventRebuildStateMatch = url.pathname.match(/^\/api\/events\/rebuild\/([^/]+)$/);
  if (eventRebuildStateMatch && method === "GET") {
    const batchId = decodeURIComponent(eventRebuildStateMatch[1]);
    const rebuilt = rebuildBatchState(db, batchId);
    if (!rebuilt) return send(res, 404, { error: "batch_not_found", message: "找不到该批次或没有事件数据" });
    return send(res, 200, rebuilt);
  }

  if (method === "POST" && url.pathname === "/api/events/migrate") {
    const result = runEventMigration(db);
    await saveDb(db);
    return send(res, 200, result);
  }

  if (method === "POST" && url.pathname === "/api/events/verify") {
    const result = verifyMigration(db);
    return send(res, 200, result);
  }

  if (method === "GET" && url.pathname === "/api/sync/workshop") {
    if (!db.syncMetadata) db.syncMetadata = {};
    return send(res, 200, {
      workshopId: db.syncMetadata.workshopId || ("WS-" + Date.now().toString(36)),
      workshopName: db.syncMetadata.workshopName || "本地工坊",
      lastExportAt: db.syncMetadata.lastExportAt || null,
      lastImportAt: db.syncMetadata.lastImportAt || null,
    });
  }

  if (method === "POST" && url.pathname === "/api/sync/workshop") {
    const input = await body(req);
    const result = setWorkshopInfo(db, input.workshopName, input.workshopId);
    await saveDb(db);
    return send(res, 200, { ...result, lastExportAt: db.syncMetadata?.lastExportAt || null, lastImportAt: db.syncMetadata?.lastImportAt || null });
  }

  if (method === "POST" && url.pathname === "/api/sync/export") {
    const input = await body(req);
    const options = {};
    if (input.batchCodes && Array.isArray(input.batchCodes)) options.batchCodes = input.batchCodes;
    if (input.since) options.since = input.since;
    const result = createExportPackage(db, options);
    recordExport(db, result.stats);
    await saveDb(db);
    return send(res, 200, result);
  }

  if (method === "POST" && url.pathname === "/api/sync/import/preview") {
    const input = await body(req);
    const pkg = input.package;
    const validation = validateImportPackage(pkg);
    if (!validation.valid) {
      return send(res, 400, { error: "invalid_package", message: "导出包格式验证失败", validation });
    }
    const conflictResult = detectConflicts(db, pkg);
    return send(res, 200, { validation, conflicts: conflictResult.conflicts, summary: conflictResult.summary });
  }

  if (method === "POST" && url.pathname === "/api/sync/import/apply") {
    const input = await body(req);
    const pkg = input.package;
    const resolvedConflicts = input.resolvedConflicts || [];
    const validation = validateImportPackage(pkg);
    if (!validation.valid) {
      return send(res, 400, { error: "invalid_package", message: "导出包格式验证失败", validation });
    }
    const result = applyMerge(db, pkg, resolvedConflicts);
    await saveDb(db);
    return send(res, 200, result);
  }

  if (method === "GET" && url.pathname === "/api/sync/history") {
    const type = url.searchParams.get("type") || "";
    const limit = Number(url.searchParams.get("limit")) || 0;
    const options = {};
    if (type) options.type = type;
    if (limit > 0) options.limit = limit;
    return send(res, 200, listSyncHistory(db, options));
  }

  const syncHistoryMatch = url.pathname.match(/^\/api\/sync\/history\/([^/]+)$/);
  if (syncHistoryMatch && method === "GET") {
    const record = getSyncHistoryById(db, syncHistoryMatch[1]);
    if (!record) return send(res, 404, { error: "history_not_found" });
    return send(res, 200, record);
  }

  return null;
}
