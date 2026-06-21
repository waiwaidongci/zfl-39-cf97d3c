export function reportPage(batchCode) {
  const initialCode = batchCode ? JSON.stringify(batchCode) : "null";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>可抄纸评估报告</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/report.css">
</head>
<body>
  <header class="no-print">
    <div>
      <h1>可抄纸评估报告</h1>
      <div class="meta">选择可抄纸状态的批次生成评估报告，支持在线预览和打印导出 · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
    <div>
      <select id="batchSelect" style="min-width:220px"><option value="">请选择可抄纸批次</option></select>
      <button id="printBtn" class="secondary" disabled>🖨️ 打印报告</button>
      <button id="exportBtn" disabled>📄 导出打印页</button>
    </div>
  </header>

  <main id="reportMain">
    <div id="emptyState" class="empty-state">
      <div class="empty-icon">📋</div>
      <h2>暂无报告</h2>
      <p>请从上方下拉选择一个状态为"可抄纸"的批次以生成评估报告</p>
    </div>
    <div id="reportContent" style="display:none"></div>
  </main>

  <script>
    const initialBatchCode = ${initialCode};
    let currentReport = null;
    let readyBatches = [];

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || '请求失败');
      return data;
    }

    function formatDateTime(isoStr) {
      if (!isoStr) return '-';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
    }

    function renderReport(report) {
      currentReport = report;
      const bi = report.basicInfo;
      const vi = report.vatInfo;

      const progressHtml = report.daysProgress.length
        ? '<div class="days-grid">' + report.daysProgress.map(d =>
            '<div class="day-cell ' + (d.hasAbnormal ? 'abnormal' : d.hasObservation ? 'normal' : 'empty') + '" title="第' + d.day + '天 · ' + d.date + (d.hasAbnormal ? ' · 有异常' : d.hasObservation ? ' · 有观察' : ' · 无观察') + '">' + d.day + '</div>'
          ).join('') + '</div>'
        : '<div class="meta">暂无日期数据</div>';

      const lastObsHtml = report.lastObservations.length
        ? '<table class="report-table"><thead><tr><th>时间</th><th>温度</th><th>气味</th><th>纤维</th><th>换水</th><th>状态</th></tr></thead><tbody>' +
          report.lastObservations.map(o =>
            '<tr' + (o.abnormal ? ' class="abnormal-row"' : '') + '>' +
              '<td>' + formatDateTime(o.at) + '</td>' +
              '<td>' + (o.temperature || '-') + '℃</td>' +
              '<td>' + (o.smell || '-') + '</td>' +
              '<td>' + (o.fiber || '-') + '</td>' +
              '<td>' + (o.changedWater || '-') + '</td>' +
              '<td>' + (o.abnormal ? '<span class="abnormal-tag">异常</span> ' + (o.abnormalNote || '') : '正常') + '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>'
        : '<div class="meta">暂无观察记录</div>';

      const abnormalHtml = report.abnormalRecords.length
        ? '<table class="report-table"><thead><tr><th>时间</th><th>类型</th><th>详情</th></tr></thead><tbody>' +
          report.abnormalRecords.map(r =>
            '<tr class="abnormal-row">' +
              '<td>' + formatDateTime(r.at) + '</td>' +
              '<td>' + r.type + '</td>' +
              '<td>' + r.detail + '</td>' +
            '</tr>'
          ).join('') +
          '</tbody></table>'
        : '<div class="no-abnormal">✅ 发酵过程无异常记录</div>';

      const vatDetail = vi.id
        ? '<div class="info-grid">' +
            '<div><b>缸号</b><span>' + vi.name + ' (' + vi.id + ')</span></div>' +
            '<div><b>容量</b><span>' + vi.capacity + ' 批次</span></div>' +
            '<div><b>位置</b><span>' + (vi.location || '-') + '</span></div>' +
            '<div><b>材质</b><span>' + (vi.material || '-') + '</span></div>' +
            (vi.note ? '<div class="full-width"><b>备注</b><span>' + vi.note + '</span></div>' : '') +
          '</div>'
        : '<div class="info-grid"><div><b>浸泡缸</b><span>' + vi.name + '</span></div></div>';

      const html =
        '<div class="report-sheet">' +
          '<div class="report-header">' +
            '<div class="report-title">' +
              '<h1>古法纸浆发酵 · 可抄纸评估报告</h1>' +
              '<div class="report-subtitle">Ancient Paper Pulp Fermentation Readiness Assessment Report</div>' +
            '</div>' +
            '<div class="report-meta">' +
              '<div>报告编号：' + bi.code + '-R-' + new Date().getTime().toString().slice(-6) + '</div>' +
              '<div>生成时间：' + formatDateTime(report.generatedAt) + '</div>' +
            '</div>' +
          '</div>' +

          '<section class="report-section">' +
            '<h2 class="section-title">一、批次基础信息</h2>' +
            '<div class="info-grid">' +
              '<div><b>批次编号</b><span>' + bi.code + '</span></div>' +
              '<div><b>原料来源</b><span>' + (bi.source || '-') + '</span></div>' +
              '<div><b>负责人</b><span>' + (bi.owner || '-') + '</span></div>' +
              '<div><b>当前状态</b><span class="pill ready-pill">' + bi.status + '</span></div>' +
              '<div><b>入缸日期</b><span>' + (bi.startDate || '-') + '</span></div>' +
              '<div><b>发酵规则</b><span>' + (bi.ruleName || '-') + '</span></div>' +
            '</div>' +
          '</section>' +

          '<section class="report-section">' +
            '<h2 class="section-title">二、发酵进度</h2>' +
            '<div class="ferment-stats">' +
              '<div class="fstat"><div class="fstat-num">' + bi.fermentDays + '</div><div class="fstat-label">已发酵天数</div></div>' +
              '<div class="fstat"><div class="fstat-num">' + bi.expectedDays + '</div><div class="fstat-label">预计天数</div></div>' +
              '<div class="fstat"><div class="fstat-num">' + bi.minDays + '~' + bi.maxDays + '</div><div class="fstat-label">规则区间</div></div>' +
              '<div class="fstat"><div class="fstat-num">' + bi.progress + '%</div><div class="fstat-label">进度百分比</div></div>' +
              '<div class="fstat"><div class="fstat-num">' + report.observationCount + '</div><div class="fstat-label">观察次数</div></div>' +
              '<div class="fstat"><div class="fstat-num">' + report.waterChangeCount + '</div><div class="fstat-label">换水次数</div></div>' +
            '</div>' +
            '<div class="progress-wrap"><div class="progress-bar"><div class="progress-fill" style="width:' + bi.progress + '%"></div></div>' +
              '<div class="progress-labels"><span>入缸</span><span>' + bi.minDays + '天（最短）</span><span>' + bi.expectedDays + '天（预计）</span><span>' + bi.maxDays + '天（最长）</span></div>' +
            '</div>' +
            '<h3 class="sub-title">逐日观察标记</h3>' +
            progressHtml +
            '<div class="legend">' +
              '<span class="legend-item"><span class="legend-dot normal"></span>正常观察</span>' +
              '<span class="legend-item"><span class="legend-dot abnormal"></span>异常记录</span>' +
              '<span class="legend-item"><span class="legend-dot empty"></span>无观察</span>' +
            '</div>' +
          '</section>' +

          '<section class="report-section">' +
            '<h2 class="section-title">三、最近观察记录 <span class="section-sub">（最近 ' + report.lastObservations.length + ' 条）</span></h2>' +
            lastObsHtml +
          '</section>' +

          '<section class="report-section">' +
            '<h2 class="section-title">四、异常记录摘要 <span class="section-sub">（共 ' + report.abnormalCount + ' 条）</span></h2>' +
            abnormalHtml +
          '</section>' +

          '<section class="report-section">' +
            '<h2 class="section-title">五、浸泡缸信息</h2>' +
            vatDetail +
          '</section>' +

          '<section class="report-section">' +
            '<h2 class="section-title">六、评估结论与签字</h2>' +
            '<div class="conclusion-box">' +
              '<div class="conclusion-item"><b>评估结论：</b><span>本批次已达到可抄纸标准，同意进入抄纸工序。</span></div>' +
            '</div>' +
            '<div class="signature-grid">' +
              '<div class="sig-box"><div class="sig-label">负责人签字：</div><div class="sig-line"></div><div class="sig-date">日期：___________</div></div>' +
              '<div class="sig-box"><div class="sig-label">质检签字：</div><div class="sig-line"></div><div class="sig-date">日期：___________</div></div>' +
            '</div>' +
          '</section>' +
        '</div>';

      document.getElementById('reportContent').innerHTML = html;
      document.getElementById('reportContent').style.display = 'block';
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('printBtn').disabled = false;
      document.getElementById('exportBtn').disabled = false;
    }

    function renderBatchSelect() {
      const sel = document.getElementById('batchSelect');
      sel.innerHTML = '<option value="">请选择可抄纸批次</option>' +
        readyBatches.map(b => '<option value="' + (b.id || b.code) + '">' + b.code + ' · ' + (b.source || '') + ' · ' + (b.owner || '') + ' · 已发酵' + b.days + '天</option>').join('');
    }

    async function loadReport(codeOrId) {
      if (!codeOrId) {
        document.getElementById('reportContent').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('printBtn').disabled = true;
        document.getElementById('exportBtn').disabled = true;
        return;
      }
      try {
        const report = await api('/api/reports/readiness/' + encodeURIComponent(codeOrId));
        renderReport(report);
        const sel = document.getElementById('batchSelect');
        if (sel.value !== codeOrId) {
          const match = readyBatches.find(b => b.id === codeOrId || b.code === codeOrId);
          if (match) sel.value = match.id || match.code;
        }
      } catch (err) {
        alert(err.message);
        document.getElementById('reportContent').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
      }
    }

    function printReport() {
      window.print();
    }

    function exportPrintPage() {
      if (!currentReport) return;
      const sheetHtml = document.querySelector('.report-sheet').outerHTML;
      const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.outerHTML).join('\\n');
      const exportHtml = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>可抄纸评估报告 - ' + currentReport.basicInfo.code + '</title>\\n' +
        cssLinks + '\\n<style>@media print { .no-print { display: none !important; } body { background: #fff; } }</style></head>' +
        '<body>' + sheetHtml +
        '<scri' + 'pt>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</sc' + 'ript>' +
        '</body></html>';
      const blob = new Blob([exportHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '可抄纸评估报告_' + currentReport.basicInfo.code + '_' + new Date().toISOString().slice(0, 10) + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    async function init() {
      try {
        const data = await api('/api/reports/ready-batches');
        readyBatches = data.batches || [];
        renderBatchSelect();
      } catch (err) {
        console.error('加载批次列表失败', err);
      }
      if (initialBatchCode) {
        document.getElementById('batchSelect').value = initialBatchCode;
        await loadReport(initialBatchCode);
      }
    }

    document.getElementById('batchSelect').onchange = (e) => loadReport(e.target.value);
    document.getElementById('printBtn').onclick = printReport;
    document.getElementById('exportBtn').onclick = exportPrintPage;

    init();
  </script>
</body>
</html>`;
}
