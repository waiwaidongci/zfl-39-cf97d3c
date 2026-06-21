#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data", "paper-pulp-fermentation.json");

const defaultRule = {
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const builtinRules = [
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function main() {
  console.log("=== 发酵判定规则数据迁移脚本 ===");
  console.log("数据文件:", dbPath);

  if (!existsSync(dbPath)) {
    console.log("数据文件不存在，创建初始数据...");
    return;
  }

  const raw = await readFile(dbPath, "utf-8");
  const db = JSON.parse(raw);

  let changed = false;

  if (!db.fermentationRules || !Array.isArray(db.fermentationRules) || db.fermentationRules.length === 0) {
    console.log("未找到 fermentationRules 字段，添加默认规则和内置规则...");
    db.fermentationRules = [{ ...defaultRule }, ...builtinRules];
    changed = true;
  } else {
    const hasDefault = db.fermentationRules.some((r) => r.isDefault);
    if (!hasDefault) {
      console.log("未找到默认规则，添加默认规则...");
      db.fermentationRules.unshift({ ...defaultRule });
      changed = true;
    }

    const existingSources = new Set(db.fermentationRules.filter((r) => !r.isDefault).map((r) => r.source));
    for (const builtin of builtinRules) {
      if (!existingSources.has(builtin.source)) {
        console.log('添加内置规则:', builtin.name, '（原料:', builtin.source, '）');
        db.fermentationRules.push({ ...builtin });
        changed = true;
      }
    }

    for (const rule of db.fermentationRules) {
      if (!rule.autoStatusRules) {
        console.log('规则 "', rule.name, '" 缺少 autoStatusRules，补充默认值...');
        rule.autoStatusRules = { ...defaultRule.autoStatusRules };
        changed = true;
      } else {
        let ruleChanged = false;
        for (const [k, v] of Object.entries(defaultRule.autoStatusRules)) {
          if (!rule.autoStatusRules[k]) {
            rule.autoStatusRules[k] = v;
            ruleChanged = true;
          }
        }
        if (ruleChanged) {
          console.log('规则 "', rule.name, '" 缺少部分自动状态规则，已补充。');
          changed = true;
        }
      }
      if (!rule.abnormalKeywords || rule.abnormalKeywords.length === 0) {
        console.log('规则 "', rule.name, '" 缺少异常关键词，补充默认值...');
        rule.abnormalKeywords = [...defaultRule.abnormalKeywords];
        changed = true;
      }
      if (rule.isDefault === undefined) {
        rule.isDefault = rule.source === "*";
        changed = true;
      }
    }
  }

  if (!db.items) db.items = [];
  if (!db.vats) db.vats = [];

  const sourcesInItems = [...new Set(db.items.map((i) => i.source).filter(Boolean))];
  console.log("\n现有批次中的原料来源:", sourcesInItems.join(", ") || "(无)");
  const covered = sourcesInItems.filter((s) =>
    db.fermentationRules.some((r) => !r.isDefault && r.source === s)
  );
  const uncovered = sourcesInItems.filter((s) => !covered.includes(s));
  if (uncovered.length > 0) {
    console.log("以下原料来源暂未配置专属规则，将使用默认规则:", uncovered.join(", "));
  } else if (sourcesInItems.length > 0) {
    console.log("所有原料来源均已配置专属规则。");
  }

  if (changed) {
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    console.log("\n迁移完成，已保存数据。");
  } else {
    console.log("\n数据已是最新，无需修改。");
  }

  console.log("\n当前规则总数:", db.fermentationRules.length);
  for (const r of db.fermentationRules) {
    console.log("  -", r.name, r.isDefault ? "(默认)" : "(" + r.source + ")");
    console.log("    天数:", r.minDays, "~", r.maxDays, "温度:", r.temperatureMin, "~", r.temperatureMax);
    console.log("    关键词:", (r.abnormalKeywords || []).join(", "));
  }
}

main().catch((err) => {
  console.error("迁移失败:", err);
  process.exit(1);
});
