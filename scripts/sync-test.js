import {
  setWorkshopInfo,
  createExportPackage,
  validateImportPackage,
  detectConflicts,
  resolveConflict,
  applyMerge,
  CONFLICT_TYPES,
  CONFLICT_TYPE_LABELS,
  RESOLVE_STRATEGIES,
  RESOLVE_STRATEGY_LABELS,
} from "../lib/sync.js";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeDb(workshopName, workshopId) {
  const db = {
    items: [],
    events: [],
    vats: [],
    fermentationRules: [],
    handovers: [],
    experiments: [],
    syncMetadata: {
      workshopId,
      workshopName,
      lastExportAt: null,
      lastImportAt: null,
    },
    syncHistory: [],
  };
  setWorkshopInfo(db, workshopName, workshopId);
  return db;
}

function makeItem(code, overrides = {}) {
  return {
    id: code,
    code,
    source: "构树皮",
    vat: "一号缸",
    vatId: "V-001",
    days: 3,
    expectedDays: 7,
    owner: "林素",
    status: "发酵中",
    startDate: "2026-06-15",
    logs: [
      { at: "2026-06-15T08:00:00.000Z", step: "建档", note: "创建纸浆批次，入一号缸", abnormal: false },
      { at: "2026-06-16T08:00:00.000Z", step: "观察", note: "温度25，正常酸味，松散", abnormal: false },
      { at: "2026-06-17T08:00:00.000Z", step: "观察", note: "温度26，微酸，松散", abnormal: false },
    ],
    observations: [
      { at: "2026-06-16T08:00:00.000Z", temperature: "25", smell: "正常酸味", fiber: "松散", changedWater: "否", abnormalNote: "", abnormal: false },
      { at: "2026-06-17T08:00:00.000Z", temperature: "26", smell: "微酸", fiber: "松散", changedWater: "否", abnormalNote: "", abnormal: false },
    ],
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  ✅ " + name);
    passed++;
  } catch (e) {
    console.log("  ❌ " + name + ": " + e.message);
    failed++;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "断言失败");
}

function assertEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(message || ("期望 " + e + "，实际 " + a));
}

console.log("\n=== 多工坊数据同步 - 冲突场景验证测试 ===\n");

console.log("📋 1. 工坊信息设置测试");
test("setWorkshopInfo 设置工坊名称和ID", () => {
  const db = makeDb("", "");
  const result = setWorkshopInfo(db, "东工坊", "WS-DONG-001");
  assertEq(result.workshopName, "东工坊");
  assertEq(result.workshopId, "WS-DONG-001");
  assertEq(db.syncMetadata.workshopName, "东工坊");
});

console.log("\n📋 2. 导出包功能测试");
test("createExportPackage 导出完整数据包", () => {
  const db = makeDb("东工坊", "WS-DONG-001");
  db.items.push(makeItem("PF-001"));
  db.items.push(makeItem("PF-002", { code: "PF-002", id: "PF-002" }));
  db.vats = [{ id: "V-001", name: "一号缸", capacity: 3 }];
  db.fermentationRules = [{ id: "default", name: "默认规则", isDefault: true }];

  const result = createExportPackage(db);
  assert(result.package, "导出包存在");
  assertEq(result.package.version, 1);
  assertEq(result.package.exportedBy, "WS-DONG-001");
  assertEq(result.package.exportedByName, "东工坊");
  assertEq(result.stats.itemCount, 2);
  assertEq(result.stats.vatCount, 1);
  assertEq(result.stats.ruleCount, 1);
  assertEq(result.stats.workshopName, "东工坊");
  assert(result.package.items.length === 2, "导出2个批次");
});

test("createExportPackage 按批次筛选导出", () => {
  const db = makeDb("东工坊", "WS-DONG-001");
  db.items.push(makeItem("PF-001"));
  db.items.push(makeItem("PF-002", { code: "PF-002", id: "PF-002" }));

  const result = createExportPackage(db, { batchCodes: ["PF-001"] });
  assertEq(result.stats.itemCount, 1);
  assertEq(result.package.items[0].code, "PF-001");
});

console.log("\n📋 3. 导入包格式验证测试");
test("validateImportPackage 有效包通过验证", () => {
  const pkg = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workshop: { workshopId: "WS-XI-001", workshopName: "西工坊" },
    items: [],
    events: [],
  };
  const result = validateImportPackage(pkg);
  assert(result.valid === true, "验证通过");
  assertEq(result.errors.length, 0);
});

test("validateImportPackage 缺少工坊信息报错", () => {
  const pkg = { version: 1, items: [], events: [] };
  const result = validateImportPackage(pkg);
  assert(result.valid === false, "验证失败");
  assert(result.errors.some((e) => e.includes("workshop")), "提示缺少工坊信息");
});

test("validateImportPackage 缺少 workshopId 报错", () => {
  const pkg = {
    version: 1,
    workshop: { workshopName: "西工坊" },
    items: [],
    events: [],
  };
  const result = validateImportPackage(pkg);
  assert(result.valid === false, "验证失败");
  assert(result.errors.some((e) => e.includes("workshopId")), "提示缺少workshopId");
});

test("validateImportPackage items非数组报错", () => {
  const pkg = {
    version: 1,
    workshop: { workshopId: "WS-XI-001", workshopName: "西工坊" },
    items: "not-array",
    events: [],
  };
  const result = validateImportPackage(pkg);
  assert(result.valid === false, "验证失败");
});

console.log("\n📋 4. 冲突检测 - 状态冲突");
test("detectConflicts 检测到状态冲突", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { status: "发酵中" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { status: "异常观察" }));
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const statusConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.STATUS_CONFLICT);
  assert(statusConflicts.length === 1, "检测到1条状态冲突");
  assert(statusConflicts[0].local.status === "发酵中", "本地状态正确");
  assert(statusConflicts[0].remote.status === "异常观察", "对方状态正确");
  assert(statusConflicts[0].description.includes("PF-001"), "包含批次编号");
});

console.log("\n📋 5. 冲突检测 - 负责人变更");
test("detectConflicts 检测到负责人变更", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { owner: "林素" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { owner: "王师傅" }));
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const ownerConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.OWNER_CHANGED);
  assert(ownerConflicts.length === 1, "检测到1条负责人冲突");
  assert(ownerConflicts[0].local.owner === "林素");
  assert(ownerConflicts[0].remote.owner === "王师傅");
});

console.log("\n📋 6. 冲突检测 - 浸泡缸名称不一致");
test("detectConflicts 检测到浸泡缸名称不一致", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { vat: "一号缸", vatId: "V-001" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { vat: "二号缸", vatId: "V-002" }));
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const vatConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.VAT_NAME_MISMATCH);
  assert(vatConflicts.length === 1, "检测到1条缸名冲突");
  assert(vatConflicts[0].local.vat === "一号缸");
  assert(vatConflicts[0].remote.vat === "二号缸");
});

console.log("\n📋 7. 冲突检测 - 观察记录重复");
test("detectConflicts 检测到观察记录重复", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  const localItem = makeItem("PF-001");
  localDb.items.push(localItem);

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  const remoteItem = makeItem("PF-001");
  remoteItem.observations.push({
    at: "2026-06-18T08:00:00.000Z",
    temperature: "27",
    smell: "正常酸味",
    fiber: "松散",
    changedWater: "是",
    abnormalNote: "",
    abnormal: false,
  });
  remoteDb.items.push(remoteItem);
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const obsConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.OBSERVATION_DUPLICATE);
  assert(obsConflicts.length === 1, "检测到观察记录重复");
  assert(obsConflicts[0].duplicates.length >= 1, "至少1条重复记录");
});

console.log("\n📋 8. 冲突检测 - 本地缺失批次");
test("detectConflicts 检测到本地缺失批次", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001"));
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const missingConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.ITEM_MISSING_LOCAL);
  assert(missingConflicts.length === 1, "检测到本地缺失");
  assert(missingConflicts[0].remote.code === "PF-001");
  assert(missingConflicts[0].defaultStrategy === RESOLVE_STRATEGIES.USE_REMOTE);
});

console.log("\n📋 9. 冲突检测 - 对方缺失批次");
test("detectConflicts 检测到对方缺失批次", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001"));
  localDb.items.push(makeItem("PF-002", { code: "PF-002", id: "PF-002" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001"));
  const exportResult = createExportPackage(remoteDb);

  const result = detectConflicts(localDb, exportResult.package);
  const missingConflicts = result.conflicts.filter((c) => c.type === CONFLICT_TYPES.ITEM_MISSING_REMOTE);
  assert(missingConflicts.length === 1, "检测到对方缺失PF-002");
  assertEq(missingConflicts[0].batchCode, "PF-002");
});

console.log("\n📋 10. 冲突解决策略测试");
test("resolveConflict USE_LOCAL 采用本地", () => {
  const conflict = {
    id: "CFL-TEST",
    type: CONFLICT_TYPES.STATUS_CONFLICT,
    batchCode: "PF-001",
    local: { status: "发酵中" },
    remote: { status: "异常观察" },
    defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
    availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE],
    resolved: false,
    resolution: null,
  };
  const result = resolveConflict(conflict, RESOLVE_STRATEGIES.USE_LOCAL);
  assert(result.resolved === true);
  assertEq(result.resolution.strategy, RESOLVE_STRATEGIES.USE_LOCAL);
  assertEq(result.resolution.value.status, "发酵中");
});

test("resolveConflict USE_REMOTE 采用对方", () => {
  const conflict = {
    id: "CFL-TEST",
    type: CONFLICT_TYPES.STATUS_CONFLICT,
    batchCode: "PF-001",
    local: { status: "发酵中" },
    remote: { status: "异常观察" },
    defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
    availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE],
    resolved: false,
    resolution: null,
  };
  const result = resolveConflict(conflict, RESOLVE_STRATEGIES.USE_REMOTE);
  assertEq(result.resolution.value.status, "异常观察");
});

test("resolveConflict CUSTOM 自定义合并", () => {
  const conflict = {
    id: "CFL-TEST",
    type: CONFLICT_TYPES.STATUS_CONFLICT,
    batchCode: "PF-001",
    field: "status",
    local: { status: "发酵中" },
    remote: { status: "异常观察" },
    defaultStrategy: RESOLVE_STRATEGIES.USE_LOCAL,
    availableStrategies: [RESOLVE_STRATEGIES.USE_LOCAL, RESOLVE_STRATEGIES.USE_REMOTE, RESOLVE_STRATEGIES.CUSTOM],
    resolved: false,
    resolution: null,
  };
  const result = resolveConflict(conflict, RESOLVE_STRATEGIES.CUSTOM, { status: "可抄纸" });
  assertEq(result.resolution.strategy, RESOLVE_STRATEGIES.CUSTOM);
  assertEq(result.resolution.value.status, "可抄纸");
});

console.log("\n📋 11. 合并写入 - 新增批次测试");
test("applyMerge 新增本地缺失的批次", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001"));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) =>
    resolveConflict(c, c.defaultStrategy)
  );

  const result = applyMerge(localDb, exportResult.package, resolved);
  assertEq(result.mergeResult.itemsCreated, 1);
  assertEq(localDb.items.length, 1);
  assertEq(localDb.items[0].code, "PF-001");
  assert(localDb.items[0]._syncSource === "WS-XI-001", "标记同步来源");
});

console.log("\n📋 12. 合并写入 - 状态合并测试");
test("applyMerge 按策略合并状态冲突（采用对方）", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { status: "发酵中" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { status: "异常观察" }));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) => {
    if (c.type === CONFLICT_TYPES.STATUS_CONFLICT) {
      return resolveConflict(c, RESOLVE_STRATEGIES.USE_REMOTE);
    }
    return resolveConflict(c, c.defaultStrategy);
  });

  applyMerge(localDb, exportResult.package, resolved);
  assertEq(localDb.items[0].status, "异常观察");
});

test("applyMerge 按策略合并状态冲突（保留本地）", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { status: "发酵中" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { status: "异常观察" }));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) =>
    resolveConflict(c, RESOLVE_STRATEGIES.USE_LOCAL)
  );

  applyMerge(localDb, exportResult.package, resolved);
  assertEq(localDb.items[0].status, "发酵中");
});

console.log("\n📋 13. 合并写入 - 负责人合并测试");
test("applyMerge 合并负责人变更（采用对方）", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { owner: "林素" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { owner: "王师傅" }));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) => {
    if (c.type === CONFLICT_TYPES.OWNER_CHANGED) {
      return resolveConflict(c, RESOLVE_STRATEGIES.USE_REMOTE);
    }
    return resolveConflict(c, c.defaultStrategy);
  });

  applyMerge(localDb, exportResult.package, resolved);
  assertEq(localDb.items[0].owner, "王师傅");
});

console.log("\n📋 14. 合并写入 - 缸名合并测试");
test("applyMerge 合并缸名不一致（自定义）", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", { vat: "一号缸", vatId: "V-001" }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001", { vat: "二号缸", vatId: "V-002" }));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) => {
    if (c.type === CONFLICT_TYPES.VAT_NAME_MISMATCH) {
      return resolveConflict(c, RESOLVE_STRATEGIES.CUSTOM, { vat: "主缸-A", vatId: "V-MASTER-A" });
    }
    return resolveConflict(c, c.defaultStrategy);
  });

  applyMerge(localDb, exportResult.package, resolved);
  assertEq(localDb.items[0].vat, "主缸-A");
  assertEq(localDb.items[0].vatId, "V-MASTER-A");
});

console.log("\n📋 15. 合并写入 - 观察记录合并测试");
test("applyMerge 合并观察记录（去重合并）", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001"));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  const remoteItem = makeItem("PF-001");
  remoteItem.observations.push({
    at: "2026-06-18T08:00:00.000Z",
    temperature: "27",
    smell: "正常酸味",
    fiber: "较软",
    changedWater: "是",
    abnormalNote: "",
    abnormal: false,
  });
  remoteDb.items.push(remoteItem);
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) =>
    resolveConflict(c, c.defaultStrategy)
  );

  const beforeCount = localDb.items[0].observations.length;
  applyMerge(localDb, exportResult.package, resolved);
  const afterCount = localDb.items[0].observations.length;

  assert(afterCount > beforeCount, "新增了对方独有的观察记录");
  assert(afterCount <= beforeCount + 1, "没有重复添加相同的观察记录");
});

console.log("\n📋 16. 合并写入 - 同步历史记录测试");
test("applyMerge 记录同步历史", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  remoteDb.items.push(makeItem("PF-001"));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const resolved = detectResult.conflicts.map((c) =>
    resolveConflict(c, c.defaultStrategy)
  );

  applyMerge(localDb, exportResult.package, resolved);
  assert(localDb.syncHistory.length >= 1, "同步历史已记录");
  assertEq(localDb.syncHistory[0].type, "import");
  assertEq(localDb.syncHistory[0].remoteWorkshopName, "西工坊");
});

console.log("\n📋 17. 综合场景 - 多冲突类型同时存在");
test("综合场景：四种主要冲突同时检测并合并", () => {
  const localDb = makeDb("东工坊", "WS-DONG-001");
  localDb.items.push(makeItem("PF-001", {
    status: "发酵中",
    owner: "林素",
    vat: "一号缸",
    vatId: "V-001",
  }));

  const remoteDb = makeDb("西工坊", "WS-XI-001");
  const remoteItem = makeItem("PF-001", {
    status: "可抄纸",
    owner: "王师傅",
    vat: "三号缸",
    vatId: "V-003",
  });
  remoteItem.observations.push({
    at: "2026-06-18T08:00:00.000Z",
    temperature: "28",
    smell: "酸香浓郁",
    fiber: "非常柔软",
    changedWater: "是",
    abnormalNote: "",
    abnormal: false,
  });
  remoteDb.items.push(remoteItem);
  remoteDb.items.push(makeItem("PF-002", { code: "PF-002", id: "PF-002" }));
  const exportResult = createExportPackage(remoteDb);

  const detectResult = detectConflicts(localDb, exportResult.package);
  const summary = detectResult.summary;

  assert(summary.byType[CONFLICT_TYPES.STATUS_CONFLICT] === 1, "检测到状态冲突");
  assert(summary.byType[CONFLICT_TYPES.OWNER_CHANGED] === 1, "检测到负责人变更");
  assert(summary.byType[CONFLICT_TYPES.VAT_NAME_MISMATCH] === 1, "检测到缸名不一致");
  assert(summary.byType[CONFLICT_TYPES.ITEM_MISSING_LOCAL] === 1, "检测到本地缺失PF-002");
  assert(summary.byType[CONFLICT_TYPES.OBSERVATION_DUPLICATE] === 1, "检测到观察记录重复");
  assert(summary.totalConflicts >= 5, "至少5条冲突");

  const resolved = detectResult.conflicts.map((c) => {
    if (c.type === CONFLICT_TYPES.STATUS_CONFLICT) {
      return resolveConflict(c, RESOLVE_STRATEGIES.USE_REMOTE);
    }
    if (c.type === CONFLICT_TYPES.OWNER_CHANGED) {
      return resolveConflict(c, RESOLVE_STRATEGIES.USE_REMOTE);
    }
    if (c.type === CONFLICT_TYPES.VAT_NAME_MISMATCH) {
      return resolveConflict(c, RESOLVE_STRATEGIES.USE_LOCAL);
    }
    return resolveConflict(c, c.defaultStrategy);
  });

  const mergeResult = applyMerge(localDb, exportResult.package, resolved);
  const result = mergeResult.mergeResult;

  assert(result.itemsCreated === 1, "新增1个批次(PF-002)");
  assert(result.itemsUpdated === 1, "更新1个批次(PF-001)");

  const pf001 = localDb.items.find((i) => i.code === "PF-001");
  assertEq(pf001.status, "可抄纸", "状态采用对方");
  assertEq(pf001.owner, "王师傅", "负责人采用对方");
  assertEq(pf001.vat, "一号缸", "缸名保留本地");

  const pf002 = localDb.items.find((i) => i.code === "PF-002");
  assert(pf002, "PF-002已新增");
});

console.log("\n📋 18. 冲突类型标签完整性验证");
test("所有冲突类型都有中文标签", () => {
  for (const [key, value] of Object.entries(CONFLICT_TYPES)) {
    assert(CONFLICT_TYPE_LABELS[value], "冲突类型 " + key + " 缺少标签");
  }
});

test("所有解决策略都有中文标签", () => {
  for (const [key, value] of Object.entries(RESOLVE_STRATEGIES)) {
    assert(RESOLVE_STRATEGY_LABELS[value], "解决策略 " + key + " 缺少标签");
  }
});

console.log("\n========================================");
console.log("测试完成：通过 " + passed + " 项，失败 " + failed + " 项");
console.log("========================================");

if (failed > 0) {
  process.exit(1);
}
