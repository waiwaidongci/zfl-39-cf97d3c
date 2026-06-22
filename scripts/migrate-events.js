#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runMigration as runEventMigration,
  verifyMigration,
  getEventStats,
  rebuildBatchState,
} from "../lib/events.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");
const backupPath = join(__dirname, "..", "data", "paper-pulp-fermentation.backup.json");

function loadDb() {
  if (!existsSync(dbPath)) {
    console.error("数据文件不存在:", dbPath);
    process.exit(1);
  }
  const raw = readFile(dbPath, "utf-8");
  return JSON.parse(raw);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

function pass(msg) {
  console.log("  ✓ " + msg);
}

function fail(msg) {
  console.log("  ✗ " + msg);
}

function warn(msg) {
  console.log("  ⚠ " + msg);
}

function info(msg) {
  console.log("  ℹ " + msg);
}

async function main() {
  console.log("=== 事件溯源迁移验证脚本 ===");
  console.log("数据文件:", dbPath);

  section("步骤 1: 备份原始数据");
  if (!existsSync(backupPath)) {
    copyFileSync(dbPath, backupPath);
    pass("已备份原始数据到 " + backupPath);
  } else {
    info("备份文件已存在，跳过备份");
  }

  section("步骤 2: 加载并检查原始数据");
  const raw = await readFile(dbPath, "utf-8");
  const db = JSON.parse(raw);

  const items = db.items || [];
  console.log("  批次数:", items.length);

  let totalLogs = 0;
  let totalObservations = 0;
  let totalAbnormal = 0;

  for (const item of items) {
    const logCount = (item.logs || []).length;
    const obsCount = (item.observations || []).length;
    totalLogs += logCount;
    totalObservations += obsCount;
    totalAbnormal += (item.logs || []).filter(l => l.abnormal).length;
    totalAbnormal += (item.observations || []).filter(o => o.abnormal).length;
    console.log("    " + (item.code || item.id) + ": logs=" + logCount + ", observations=" + obsCount);
  }

  console.log("  总 logs 数:", totalLogs);
  console.log("  总 observations 数:", totalObservations);
  console.log("  总异常记录数:", totalAbnormal);
  console.log("  预计迁移事件数:", totalLogs + totalObservations);

  section("步骤 3: 首次运行迁移");
  const db1 = JSON.parse(raw);
  const result1 = runEventMigration(db1);

  if (result1.migrated) {
    pass("迁移成功执行");
  } else {
    fail("迁移未执行");
  }
  console.log("  迁移批次数:", result1.itemsMigrated);
  console.log("  迁移事件数:", result1.totalEvents);

  const expectedEvents = totalLogs + totalObservations;
  if (result1.totalEvents >= expectedEvents) {
    pass("迁移事件数符合预期（>= " + expectedEvents + "）");
  } else {
    fail("迁移事件数不足: 期望 " + expectedEvents + ", 实际 " + result1.totalEvents);
  }

  const stats1 = getEventStats(db1);
  console.log("  事件统计:");
  console.log("    总事件数:", stats1.totalEvents);
  console.log("    涉及批次:", stats1.totalBatches);
  console.log("    异常事件:", stats1.abnormalCount);
  console.log("    迁移事件:", stats1.migratedCount);
  console.log("    最早时间:", stats1.earliest);
  console.log("    最晚时间:", stats1.latest);

  for (const ts of stats1.typeStats) {
    console.log("    - " + ts.label + ": " + ts.count);
  }

  section("步骤 4: 验证幂等性（重复运行迁移）");
  const result2 = runEventMigration(db1);

  if (!result2.migrated) {
    pass("重复运行迁移未产生变化（幂等性验证通过）");
  } else {
    fail("重复运行迁移产生了新的事件: " + result2.totalEvents + " 个");
  }

  const stats2 = getEventStats(db1);
  if (stats2.totalEvents === stats1.totalEvents) {
    pass("事件总数未变化: " + stats2.totalEvents);
  } else {
    fail("事件总数变化: " + stats1.totalEvents + " → " + stats2.totalEvents);
  }

  section("步骤 5: 验证迁移结果");
  const verifyResult = verifyMigration(db1);

  if (verifyResult.valid) {
    pass("迁移验证通过");
  } else {
    fail("迁移验证失败");
  }

  console.log("  检查批次数:", verifyResult.itemsChecked);
  console.log("  通过批次数:", verifyResult.itemsPassed);
  console.log("  失败批次数:", verifyResult.itemsFailed);

  if (verifyResult.errors.length > 0) {
    console.log("  错误:");
    for (const err of verifyResult.errors) {
      fail(err);
    }
  }

  if (verifyResult.warnings.length > 0) {
    console.log("  警告:");
    for (const w of verifyResult.warnings) {
      warn(w);
    }
  }

  section("步骤 6: 验证事件状态重建");
  let rebuildPassed = 0;
  let rebuildFailed = 0;

  for (const item of items) {
    const batchKey = item.id || item.code;
    const rebuilt = rebuildBatchState(db1, batchKey);

    if (!rebuilt) {
      fail(batchKey + ": 无法重建状态");
      rebuildFailed++;
      continue;
    }

    let hasIssues = false;

    if (item.status && rebuilt.status !== item.status) {
      warn(batchKey + ": 状态不匹配 - 期望 " + item.status + ", 重建 " + rebuilt.status);
      hasIssues = true;
    }

    if (item.days !== undefined && item.days !== null && rebuilt.days !== item.days) {
      warn(batchKey + ": 天数不匹配 - 期望 " + item.days + ", 重建 " + rebuilt.days);
      hasIssues = true;
    }

    const itemObsCount = (item.observations || []).length;
    if (rebuilt.totalObservations < itemObsCount) {
      warn(batchKey + ": 观察数不匹配 - 期望 " + itemObsCount + ", 重建 " + rebuilt.totalObservations);
      hasIssues = true;
    }

    const itemLogCount = (item.logs || []).length;
    if ((rebuilt.logs || []).length < itemLogCount) {
      warn(batchKey + ": 日志数不匹配 - 期望 >= " + itemLogCount + ", 重建 " + (rebuilt.logs || []).length);
      hasIssues = true;
    }

    if (itemObsCount > 0 && rebuilt.latestObservation) {
      const lastOriginal = (item.observations || [])[itemObsCount - 1];
      if (lastOriginal.temperature && rebuilt.latestObservation.temperature !== lastOriginal.temperature) {
        warn(batchKey + ": 最近观察温度不匹配 - 期望 " + lastOriginal.temperature + ", 重建 " + rebuilt.latestObservation.temperature);
        hasIssues = true;
      }
    }

    const originalAbnormal =
      ((item.logs || []).filter(l => l.abnormal).length) +
      ((item.observations || []).filter(o => o.abnormal).length);
    if ((rebuilt.abnormalCount || 0) < originalAbnormal) {
      warn(batchKey + ": 异常数不匹配 - 期望 >= " + originalAbnormal + ", 重建 " + (rebuilt.abnormalCount || 0));
      hasIssues = true;
    }

    if (rebuilt._eventIds && rebuilt._eventIds.length > 0) {
      if (!hasIssues) {
        pass(batchKey + ": 重建成功 (状态=" + rebuilt.status + ", 天数=" + rebuilt.days + ", 事件=" + rebuilt._eventIds.length + ")");
        rebuildPassed++;
      } else {
        rebuildFailed++;
      }
    } else {
      fail(batchKey + ": 没有用于重建的事件");
      rebuildFailed++;
    }
  }

  console.log("  重建通过:", rebuildPassed);
  console.log("  重建失败/警告:", rebuildFailed);

  section("步骤 7: 保存迁移后的数据");
  await writeFile(dbPath, JSON.stringify(db1, null, 2));
  pass("已保存迁移后的数据到 " + dbPath);

  section("验证总结");
  console.log("  ✓ 迁移执行: " + (result1.migrated ? "通过" : "失败"));
  console.log("  ✓ 幂等性: " + (!result2.migrated ? "通过" : "失败"));
  console.log("  ✓ 数据完整性: " + (verifyResult.valid ? "通过" : "失败"));
  console.log("  ✓ 状态重建: " + rebuildPassed + " / " + items.length + " 通过");

  const allPassed = result1.migrated && !result2.migrated && verifyResult.valid && rebuildFailed === 0;

  if (allPassed) {
    console.log("\n🎉 所有验证通过！");
  } else {
    console.log("\n⚠ 部分验证未通过，请检查警告和错误信息。");
    console.log("  原始数据备份在: " + backupPath);
    process.exitCode = 1;
  }

  console.log("\n使用以下命令恢复原始数据:");
  console.log("  cp " + backupPath + " " + dbPath);
}

main().catch((err) => {
  console.error("验证脚本执行失败:", err);
  process.exit(1);
});
