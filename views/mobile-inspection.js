const smellOptions = ["正常酸味", "轻微异味", "浓烈酸味", "腐烂味", "其他"];
const fiberOptions = ["松散", "较松散", "一般", "较紧实", "紧实结块"];
const waterOptions = ["已换水", "未换水"];

function chipLabels(options, name, warnLast) {
  return options.map(function(opt, idx) {
    const warnClass = warnLast && idx === options.length - 1 ? ' chip-warn' : '';
    return '<label class="chip' + warnClass + '"><input type="radio" name="' + name + '" value="' + opt + '"><span>' + opt + '</span></label>';
  }).join("");
}

export function mobileInspectionPage() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>现场离线巡检采集</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/mobile-inspection.css">
</head>
<body>
  <header class="mobile-header">
  <div class="header-left">
    <a href="/" class="back-btn">←</a>
    <h1>现场巡检采集</h1>
  </div>
  <div id="network-status" class="network-online">
    <span class="dot"></span>
    <span id="network-text">在线</span>
  </div>
</header>

<div id="sync-banner" class="sync-banner sync-hidden">
  <span id="sync-text">有 <strong id="pending-count">0</strong> 条记录待同步</span>
  <button id="sync-btn" class="sync-btn">立即同步</button>
</div>

<main class="mobile-main">
  <section id="batch-section" class="panel">
    <h2>选择巡检批次</h2>
    <div id="batch-list" class="batch-list"></div>
    <button id="refresh-batches" class="secondary btn-block">刷新批次列表</button>
    <div id="batch-list-meta" class="meta"></div>
  </section>

  <section id="form-section" class="panel" style="display:none;">
    <div class="batch-info">
      <h3 id="selected-batch-name"></h3>
      <div id="selected-batch-meta" class="meta"></div>
    </div>

    <form id="inspection-form">
      <label>温度(℃)</label>
      <input name="temperature" type="number" step="0.1" placeholder="如 25.5" inputmode="decimal">

      <label>气味状态</label>
      <div class="chip-group" id="smell-chips">
        ${chipLabels(smellOptions, "smell")}
      </div>

      <label>纤维状态</label>
      <div class="chip-group" id="fiber-chips">
        ${chipLabels(fiberOptions, "fiber")}
      </div>

      <label>换水情况</label>
      <div class="chip-group" id="water-chips">
        ${chipLabels(waterOptions, "changedWater")}
      </div>

      <label>是否有异常（异味/霉点）</label>
      <div class="chip-group" id="abnormal-chips">
        <label class="chip"><input type="radio" name="abnormal" value="否"><span>否</span></label>
        <label class="chip chip-warn"><input type="radio" name="abnormal" value="是"><span>是</span></label>
      </div>

      <label>异常说明</label>
      <textarea name="abnormalNote" placeholder="如有异常请详细描述，无异常可留空"></textarea>

      <button type="submit" id="submit-btn">保存巡检记录</button>
      <button type="button" id="cancel-btn" class="secondary btn-block">取消选择</button>
    </form>
  </section>

  <section id="pending-section" class="panel">
    <h2>待同步记录</h2>
    <div id="pending-list"></div>
    <button id="clear-pending" class="secondary btn-block" style="display:none;">清空待同步记录</button>
  </section>
</main>

<div id="toast" class="toast toast-hidden"></div>

<script src="/public/mobile-inspection.js"></script>
</body>
</html>`;
  return html;
}
