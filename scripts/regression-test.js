#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureFermentationRules,
  findRuleForSource,
  evaluateFermentationStatus,
  createRule,
  updateRule,
  deleteRule,
  validateRule,
  detectAbnormalByKeywords,
  checkTemperatureInRange,
  listRules,
  defaultRule,
  isAbnormalObservation,
  previewBatchImport,
  parseObservationText,
} from "../lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = join(__dirname, "..", "data", "paper-pulp-fermentation.backup.json");
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log("  ✓", message);
  } else {
    failed++;
    failures.push(message);
    console.log("  ✗", message);
  }
}

function assertEq(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log("  ✓", message);
  } else {
    failed++;
    failures.push(message + " (期望: " + JSON.stringify(expected) + ", 实际: " + JSON.stringify(actual) + ")");
    console.log("  ✗", message);
    console.log("    期望:", JSON.stringify(expected));
    console.log("    实际:", JSON.stringify(actual));
  }
}

async function backupDb() {
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, backupPath);
    return true;
  }
  return false;
}

async function restoreDb() {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, dbPath);
    unlinkSync(backupPath);
  }
}

function makeDb() {
  return {
    vats: [],
    items: [
      { code: "PF-001", source: "构树皮", days: 5, status: "发酵中", expectedDays: 7 },
      { code: "PF-002", source: "桑树皮", days: 3, status: "发酵中", expectedDays: 7 },
      { code: "PF-003", source: "竹浆", days: 10, status: "发酵中", expectedDays: 7 },
      { code: "PF-004", source: "", days: 2, status: "发酵中", expectedDays: 7 },
    ],
    fermentationRules: [
      {
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
      },
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
    ],
  };
}

async function runTests() {
  console.log("=== 发酵判定规则回归验证脚本 ===\n");

  console.log("1. 数据迁移与兼容性测试");
  {
    const db = { vats: [], items: [] };
    const changed = ensureFermentationRules(db);
    assert(changed === true, "空库时应添加默认规则");
    assert(db.fermentationRules.length >= 1, "应至少有1条规则");
    assert(db.fermentationRules.some((r) => r.isDefault), "应包含默认规则");

    const db2 = makeDb();
    const changed2 = ensureFermentationRules(db2);
    assert(changed2 === false, "已有完整规则时不应修改");
  }

  console.log("\n2. 规则匹配测试");
  {
    const db = makeDb();
    const r1 = findRuleForSource(db, "构树皮");
    assertEq(r1.source, "构树皮", "构树皮应匹配专属规则");
    assertEq(r1.minDays, 7, "构树皮规则最小天数为7");
    assertEq(r1.temperatureMin, 18, "构树皮规则温度下限为18");

    const r2 = findRuleForSource(db, "桑树皮");
    assert(r2.isDefault, "桑树皮无专属规则，应匹配默认规则");
    assertEq(r2.minDays, 7, "默认规则最小天数为7");
    assertEq(r2.temperatureMin, 15, "默认规则温度下限为15");

    const r3 = findRuleForSource(db, "");
    assert(r3.isDefault, "空原料来源应匹配默认规则");

    const r4 = findRuleForSource(db, undefined);
    assert(r4.isDefault, "undefined 原料来源应匹配默认规则");
  }

  console.log("\n3. 关键词检测测试");
  {
    const keywords = ["霉", "臭", "腐", "酸败", "结块"];
    const r1 = detectAbnormalByKeywords("正常酸味，松散", keywords);
    assertEq(r1.found, false, "正常描述不应触发关键词");
    assertEq(r1.matched.length, 0, "无命中关键词");

    const r2 = detectAbnormalByKeywords("发现霉斑，有臭味，结块严重", keywords);
    assertEq(r2.found, true, "异常描述应触发关键词");
    assert(r2.matched.includes("霉"), "应命中 '霉'");
    assert(r2.matched.includes("臭"), "应命中 '臭'");
    assert(r2.matched.includes("结块"), "应命中 '结块'");

    const r3 = detectAbnormalByKeywords("", keywords);
    assertEq(r3.found, false, "空文本不应触发关键词");

    const r4 = detectAbnormalByKeywords(null, keywords);
    assertEq(r4.found, false, "null 不应触发关键词");
  }

  console.log("\n4. 温度范围检测测试");
  {
    const r1 = checkTemperatureInRange(25, 15, 35);
    assertEq(r1.inRange, true, "25℃在15~35范围内");
    assertEq(r1.value, 25, "正确解析温度值");

    const r2 = checkTemperatureInRange(10, 15, 35);
    assertEq(r2.inRange, false, "10℃低于15℃下限");

    const r3 = checkTemperatureInRange(40, 15, 35);
    assertEq(r3.inRange, false, "40℃高于35℃上限");

    const r4 = checkTemperatureInRange("", 15, 35);
    assertEq(r4.isMissing, true, "空温度视为缺失");
    assertEq(r4.inRange, true, "缺失温度不判为异常");

    const r5 = checkTemperatureInRange("abc", 15, 35);
    assertEq(r5.isMissing, true, "无效温度视为缺失");
  }

  console.log("\n5. 发酵状态评估测试 - 正常流程");
  {
    const db = makeDb();
    const item = { source: "构树皮", days: 5, status: "发酵中" };
    const obs = { temperature: "25", smell: "正常酸味", fiber: "松散", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "发酵中", "5天构树皮正常观察应为发酵中");
    assertEq(eval1.newDays, 6, "天数+1");
    assertEq(eval1.isAbnormal, false, "不标记为异常");
    assertEq(eval1.willBeReady, false, "未到可抄纸");

    const item2 = { source: "构树皮", days: 6, status: "发酵中" };
    const eval2 = evaluateFermentationStatus(db, item2, obs);
    assertEq(eval2.nextStatus, "可抄纸", "7天（6+1）构树皮正常应为可抄纸");
    assertEq(eval2.willBeReady, true, "标记为可抄纸");
    assert(eval2.reasons.some((r) => r.includes("最短发酵天数")), "应包含天数达标原因");
  }

  console.log("\n6. 发酵状态评估测试 - 异常关键词触发");
  {
    const db = makeDb();
    const item = { source: "构树皮", days: 5, status: "发酵中" };
    const obs = { temperature: "25", smell: "有霉味", fiber: "结块", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "异常观察", "霉味+结块应触发异常观察");
    assertEq(eval1.isAbnormal, true, "标记为异常");
    assert(eval1.keywordMatched.length > 0, "应有命中关键词");
    assert(eval1.keywordMatched.includes("霉"), "应命中霉");
    assert(eval1.keywordMatched.includes("结块"), "应命中结块");
  }

  console.log("\n7. 发酵状态评估测试 - 温度异常触发");
  {
    const db = makeDb();
    const item = { source: "构树皮", days: 5, status: "发酵中" };
    const obs = { temperature: "10", smell: "微酸", fiber: "较松散", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "异常观察", "10℃低于构树皮18℃下限应触发异常");
    assertEq(eval1.isAbnormal, true, "标记为异常");
    assert(eval1.reasons.some((r) => r.includes("温度超出范围")), "应包含温度异常原因");

    const obs2 = { temperature: "40", smell: "微酸", fiber: "较松散", abnormal: "" };
    const eval2 = evaluateFermentationStatus(db, item, obs2);
    assertEq(eval2.nextStatus, "异常观察", "40℃高于构树皮32℃上限应触发异常");
  }

  console.log("\n8. 发酵状态评估测试 - 超最长天数触发");
  {
    const db = makeDb();
    const item = { source: "构树皮", days: 21, status: "发酵中" };
    const obs = { temperature: "25", smell: "正常酸味", fiber: "松散", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "异常观察", "22天（21+1）超过构树皮21天上限应触发异常");
    assert(eval1.reasons.some((r) => r.includes("超过最长发酵天数")), "应包含超期原因");
  }

  console.log("\n9. 发酵状态评估测试 - 异常复选框触发");
  {
    const db = makeDb();
    const item = { source: "构树皮", days: 3, status: "发酵中" };
    const obs = { temperature: "25", smell: "微酸", fiber: "松散", abnormal: "是" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "异常观察", "勾选异常应触发异常观察");
    assertEq(eval1.isAbnormal, true, "标记为异常");
    assert(eval1.reasons.some((r) => r.includes("异常标记")), "应包含异常标记原因");
  }

  console.log("\n10. 发酵状态评估测试 - 默认规则兼容性");
  {
    const db = makeDb();
    const item = { source: "桑树皮", days: 6, status: "发酵中" };
    const obs = { temperature: "20", smell: "正常酸味", fiber: "松散", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.rule.isDefault, true, "桑树皮使用默认规则");
    assertEq(eval1.nextStatus, "可抄纸", "7天（6+1）桑树皮正常应为可抄纸");
    assertEq(eval1.newDays, 7, "天数正确");
  }

  console.log("\n11. 规则CRUD测试 - 创建");
  {
    const db = makeDb();
    const input = {
      name: "竹浆发酵规则",
      source: "竹浆",
      minDays: 10,
      maxDays: 25,
      temperatureMin: 20,
      temperatureMax: 30,
      abnormalKeywords: ["霉", "臭", "发黑"],
      autoStatusRules: {
        onAbnormalKeyword: "异常观察",
        onTemperatureOutOfRange: "异常观察",
        onDaysReachedMin: "可抄纸",
        onDaysExceedMax: "异常观察",
      },
    };
    const result = createRule(db, input);
    assertEq(result.success, true, "创建竹浆规则应成功");
    assertEq(result.rule.source, "竹浆", "原料来源正确");
    assertEq(result.rule.minDays, 10, "最小天数正确");
    const idx = listRules(db).findIndex((r) => r.source === "竹浆");
    assert(idx >= 0, "规则应已添加到列表");

    const dup = createRule(db, input);
    assertEq(dup.success, false, "重复原料来源应创建失败");

    const invalid = createRule(db, { name: "", source: "*" });
    assertEq(invalid.success, false, "空名称应验证失败");

    const invalid2 = createRule(db, { name: "x", source: "X", minDays: 10, maxDays: 5 });
    assertEq(invalid2.success, false, "最小天数大于最大天数应验证失败");
  }

  console.log("\n12. 规则CRUD测试 - 更新与删除");
  {
    const db = makeDb();
    const before = findRuleForSource(db, "构树皮");
    const result = updateRule(db, before.id, {
      name: "构树皮规则V2",
      source: "构树皮",
      minDays: 8,
      maxDays: 20,
      temperatureMin: 20,
      temperatureMax: 30,
    });
    assertEq(result.success, true, "更新构树皮规则应成功");
    assertEq(result.rule.minDays, 8, "最小天数已更新");
    assertEq(result.rule.temperatureMin, 20, "温度下限已更新");

    const notFound = updateRule(db, "rule-nonexistent", { name: "x", source: "x" });
    assertEq(notFound.success, false, "更新不存在的规则应失败");

    const defaultRule = listRules(db).find((r) => r.isDefault);
    const delDefault = deleteRule(db, defaultRule.id);
    assertEq(delDefault.success, false, "删除默认规则应失败");

    const goushupiRule = listRules(db).find((r) => r.source === "构树皮");
    const delOk = deleteRule(db, goushupiRule.id);
    assertEq(delOk.success, true, "删除构树皮规则应成功");
    const after = findRuleForSource(db, "构树皮");
    assert(after.isDefault, "删除后构树皮应使用默认规则");
  }

  console.log("\n13. 验证测试 - validateRule");
  {
    const v1 = validateRule({ name: "测试", source: "X", minDays: 5, maxDays: 10, temperatureMin: 15, temperatureMax: 30 });
    assertEq(v1.valid, true, "有效规则应验证通过");

    const v2 = validateRule({ name: "", source: "X" });
    assertEq(v2.valid, false, "空名称应验证失败");

    const v3 = validateRule({ name: "x", source: "" });
    assertEq(v3.valid, false, "空来源应验证失败");

    const v4 = validateRule({ name: "x", source: "X", minDays: 0 });
    assertEq(v4.valid, false, "最小天数<1应验证失败");

    const v5 = validateRule({ name: "x", source: "X", minDays: 5, maxDays: 10, temperatureMin: 30, temperatureMax: 15 });
    assertEq(v5.valid, false, "温度范围颠倒应验证失败");
  }

  console.log("\n14. 批量导入预览测试");
  {
    const db = makeDb();
    const csvText = `批次编号,温度,气味,纤维松散度,是否换水,异常
PF-001,25,正常酸味,松散,否,否
PF-002,12,霉味,结块,否,是
PF-003,28,正常酸味,非常松散,是,否
PF-999,25,正常酸味,松散,否,否`;
    const parsed = parseObservationText(csvText);
    assert(parsed.rowCount >= 3, "应解析出3行数据");
    const preview = previewBatchImport(db, parsed);
    assertEq(preview.matchedCount, 3, "应匹配3个批次");
    assertEq(preview.unmatchedCount, 1, "1个未匹配批次");
    assert(preview.abnormalCount >= 1, "至少1个异常预警");

    const pf001 = preview.matched.find((m) => m.itemCode === "PF-001");
    assert(pf001, "PF-001应匹配成功");
    assertEq(pf001.newStatus, "发酵中", "PF-001 5+1=6天，构树皮规则minDays=7，应为发酵中");

    const pf002 = preview.matched.find((m) => m.itemCode === "PF-002");
    assert(pf002, "PF-002应匹配成功");
    assertEq(pf002.newStatus, "异常观察", "PF-002霉味+温度异常应为异常观察");
  }

  console.log("\n15. 向后兼容测试 - 旧数据无规则时");
  {
    const db = { vats: [], items: [{ code: "OLD-001", source: "老原料", days: 6 }] };
    ensureFermentationRules(db);
    const item = db.items[0];
    const obs = { temperature: "25", smell: "正常酸味", fiber: "松散", abnormal: "" };
    const eval1 = evaluateFermentationStatus(db, item, obs);
    assertEq(eval1.nextStatus, "可抄纸", "旧数据应使用默认规则，7天为可抄纸");
    assert(eval1.rule.isDefault, "使用的是默认规则");
  }

  console.log("\n16. 规则匹配后状态与旧逻辑一致性测试");
  {
    const db = makeDb();
    const testCases = [
      { desc: "正常7天", days: 6, temp: "25", smell: "正常酸味", abnormal: "", source: "桑树皮", expect: "可抄纸" },
      { desc: "正常5天", days: 4, temp: "25", smell: "正常酸味", abnormal: "", source: "桑树皮", expect: "发酵中" },
      { desc: "异常复选框", days: 5, temp: "25", smell: "正常酸味", abnormal: "是", source: "桑树皮", expect: "异常观察" },
      { desc: "关键词异常", days: 5, temp: "25", smell: "霉味", abnormal: "", source: "桑树皮", expect: "异常观察" },
    ];
    for (const tc of testCases) {
      const item = { source: tc.source, days: tc.days, status: "发酵中" };
      const obs = { temperature: tc.temp, smell: tc.smell, fiber: "松散", abnormal: tc.abnormal };
      const eval1 = evaluateFermentationStatus(db, item, obs);
      assertEq(eval1.nextStatus, tc.expect, "[" + tc.desc + "] 状态应为 " + tc.expect);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("测试完成:", passed, "通过,", failed, "失败");
  if (failures.length > 0) {
    console.log("\n失败用例:");
    failures.forEach((f, i) => console.log("  " + (i + 1) + ".", f));
    process.exit(1);
  } else {
    console.log("\n✅ 所有测试通过！");
  }
}

const hadBackup = await backupDb();
try {
  await runTests();
} finally {
  if (hadBackup) {
    await restoreDb();
  }
}
