export function auditPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>事件溯源与审计日志</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/audit.css">
</head>
<body>
  <header>
    <div>
      <h1>🔍 事件溯源与审计日志</h1>
      <div class="meta">不可覆盖的事件流 · 按时间、批次、操作类型和异常状态过滤 · 从事件流重建批次状态 · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
  </header>
  <div class="content">
    <div class="stats-bar" id="statsBar"></div>

    <div class="filter-panel">
      <h2>筛选条件</h2>
      <div class="filter-grid">
        <div>
          <label>批次编号</label>
          <select id="fBatch"><option value="">全部批次</option></select>
        </div>
        <div>
          <label>操作类型</label>
          <select id="fType"><option value="">全部类型</option></select>
        </div>
        <div>
          <label>异常状态</label>
          <select id="fAbnormal">
            <option value="">全部</option>
            <option value="true">仅异常</option>
            <option value="false">仅正常</option>
          </select>
        </div>
        <div>
          <label>开始时间</label>
          <input type="datetime-local" id="fStart">
        </div>
        <div>
          <label>结束时间</label>
          <input type="datetime-local" id="fEnd">
        </div>
        <div class="filter-actions">
          <label>&nbsp;</label>
          <button id="btnFilter">筛选</button>
          <button class="reset" id="btnReset">重置</button>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="events">事件列表</button>
      <button class="tab-btn" data-tab="rebuild">状态重建</button>
      <button class="tab-btn" data-tab="verify">迁移验证</button>
    </div>

    <div class="tab-content" id="tabEvents">
      <div class="events-list" id="eventsList"></div>
    </div>

    <div class="tab-content hidden" id="tabRebuild">
      <div class="rebuild-panel">
        <div>
          <label>选择批次</label>
          <select id="rebuildBatch"><option value="">请选择批次</option></select>
          <button id="btnRebuild" class="mt-10">重建状态</button>
        </div>
        <div class="rebuild-result" id="rebuildResult"></div>
      </div>
    </div>

    <div class="tab-content hidden" id="tabVerify">
      <div class="verify-panel">
        <button id="btnVerify">运行迁移验证</button>
        <div class="verify-result" id="verifyResult"></div>
      </div>
    </div>
  </div>

  <script>
    let eventData = { events: [], batches: [], typeOptions: [] };
    let statsData = null;
    let currentFilters = {};

    async function loadStats() {
      const res = await fetch('/api/events/stats');
      statsData = await res.json();
      renderStats();
    }

    function renderStats() {
      if (!statsData) return;
      const bar = document.getElementById('statsBar');
      bar.innerHTML =
        '<div class="stat-chip"><span class="stat-label">总事件数</span><strong>' + statsData.totalEvents + '</strong></div>' +
        '<div class="stat-chip"><span class="stat-label">涉及批次</span><strong>' + statsData.totalBatches + '</strong></div>' +
        '<div class="stat-chip warn-chip"><span class="stat-label">异常事件</span><strong>' + statsData.abnormalCount + '</strong></div>' +
        '<div class="stat-chip"><span class="stat-label">迁移事件</span><strong>' + statsData.migratedCount + '</strong></div>' +
        '<div class="stat-chip success-chip"><span class="stat-label">原生事件</span><strong>' + statsData.nativeCount + '</strong></div>';
    }

    async function loadEvents() {
      const params = new URLSearchParams();
      const batch = document.getElementById('fBatch').value;
      const type = document.getElementById('fType').value;
      const abnormal = document.getElementById('fAbnormal').value;
      const start = document.getElementById('fStart').value;
      const end = document.getElementById('fEnd').value;

      if (batch) params.set('batchId', batch);
      if (type) params.set('type', type);
      if (abnormal) params.set('abnormal', abnormal);
      if (start) params.set('startTime', start);
      if (end) params.set('endTime', end);
      params.set('sort', 'desc');

      currentFilters = { batch, type, abnormal, start, end };

      const res = await fetch('/api/events?' + params.toString());
      eventData = await res.json();
      renderFilters();
      renderEvents();
    }

    function renderFilters() {
      const batchSel = document.getElementById('fBatch');
      batchSel.innerHTML = '<option value="">全部批次</option>' +
        eventData.batches.map(b => '<option value="' + b + '" ' + (currentFilters.batch === b ? 'selected' : '') + '>' + b + '</option>').join('');

      const typeSel = document.getElementById('fType');
      typeSel.innerHTML = '<option value="">全部类型</option>' +
        eventData.typeOptions.map(t => '<option value="' + t.type + '" ' + (currentFilters.type === t.type ? 'selected' : '') + '>' + t.label + '</option>').join('');

      const rebuildSel = document.getElementById('rebuildBatch');
      rebuildSel.innerHTML = '<option value="">请选择批次</option>' +
        eventData.batches.map(b => '<option value="' + b + '">' + b + '</option>').join('');
    }

    function formatTime(at) {
      if (!at) return '';
      const d = new Date(at);
      if (isNaN(d.getTime())) return at;
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      const h = String(d.getHours()).padStart(2,'0');
      const min = String(d.getMinutes()).padStart(2,'0');
      const s = String(d.getSeconds()).padStart(2,'0');
      return y+'-'+m+'-'+day+' '+h+':'+min+':'+s;
    }

    function getTypeLabel(type) {
      const found = eventData.typeOptions.find(t => t.type === type);
      return found ? found.label : type;
    }

    function renderEvents() {
      const list = document.getElementById('eventsList');
      const events = eventData.events;

      if (events.length === 0) {
        list.innerHTML = '<div class="empty">暂无匹配的事件，请调整筛选条件</div>';
        return;
      }

      list.innerHTML = events.map(ev => {
        const isAbnormal = ev.metadata?.abnormal;
        const isMigrated = ev._migrated;
        const typeLabel = getTypeLabel(ev.type);

        let badges = '';
        if (isAbnormal) badges += '<span class="evt-badge abnormal-badge">异常</span>';
        if (isMigrated) badges += '<span class="evt-badge migrated-badge">迁移</span>';
        badges += '<span class="evt-badge type-badge">' + typeLabel + '</span>';

        let dataHtml = '';
        if (ev.data && Object.keys(ev.data).length > 0) {
          dataHtml = '<div class="evt-data"><pre>' + JSON.stringify(ev.data, null, 2) + '</pre></div>';
        }

        return '<div class="evt-item ' + (isAbnormal ? 'abnormal' : '') + '">' +
          '<div class="evt-head">' +
            '<span class="evt-type">' + badges + '</span>' +
            '<span class="evt-time">' + formatTime(ev.timestamp) + '</span>' +
          '</div>' +
          '<div class="evt-batch">' +
            '<span class="evt-batch-code">' + (ev.batchCode || ev.batchId || '-') + '</span>' +
            '<span class="evt-id muted">ID: ' + ev.id + '</span>' +
          '</div>' +
          (ev.metadata?.note ? '<div class="evt-note">' + ev.metadata.note + '</div>' : '') +
          (ev.data?.note && ev.data.note !== ev.metadata?.note ? '<div class="evt-note">' + ev.data.note + '</div>' : '') +
          '<div class="evt-meta muted">' +
            '来源: ' + (ev.metadata?.source || '-') +
            (ev.metadata?.operator ? ' · 操作人: ' + ev.metadata.operator : '') +
            (ev._migratedFrom ? ' · 迁移自: ' + ev._migratedFrom : '') +
          '</div>' +
          '<button class="evt-toggle secondary" onclick="toggleData(this)">展开详情</button>' +
          '<div class="evt-data-wrapper hidden">' + dataHtml + '</div>' +
        '</div>';
      }).join('');
    }

    function toggleData(btn) {
      const wrapper = btn.nextElementSibling;
      if (wrapper.classList.contains('hidden')) {
        wrapper.classList.remove('hidden');
        btn.textContent = '收起详情';
      } else {
        wrapper.classList.add('hidden');
        btn.textContent = '展开详情';
      }
    }

    async function rebuildState() {
      const batchId = document.getElementById('rebuildBatch').value;
      if (!batchId) {
        alert('请选择批次');
        return;
      }

      const res = await fetch('/api/events/rebuild/' + encodeURIComponent(batchId));
      if (!res.ok) {
        const err = await res.json();
        document.getElementById('rebuildResult').innerHTML = '<div class="error">错误: ' + (err.message || err.error) + '</div>';
        return;
      }
      const rebuilt = await res.json();
      renderRebuildResult(rebuilt);
    }

    function renderRebuildResult(state) {
      const el = document.getElementById('rebuildResult');
      if (!state) {
        el.innerHTML = '<div class="empty">无法重建状态</div>';
        return;
      }

      el.innerHTML =
        '<div class="rebuild-header">' +
          '<h3>' + (state.code || state.id) + '</h3>' +
          '<span class="pill">' + state.status + '</span>' +
        '</div>' +
        '<div class="rebuild-grid">' +
          '<div><b>原料来源:</b> ' + (state.source || '-') + '</div>' +
          '<div><b>浸泡缸:</b> ' + (state.vat || '-') + '</div>' +
          '<div><b>负责人:</b> ' + (state.owner || '-') + '</div>' +
          '<div><b>已发酵天数:</b> ' + (state.days || 0) + ' 天</div>' +
          '<div><b>预计天数:</b> ' + (state.expectedDays || 7) + ' 天</div>' +
          '<div><b>入缸日期:</b> ' + (state.startDate || '-') + '</div>' +
          '<div><b>观察次数:</b> ' + (state.totalObservations || 0) + ' 次</div>' +
          '<div><b>异常次数:</b> ' + (state.abnormalCount || 0) + ' 次</div>' +
        '</div>' +
        '<div class="rebuild-section">' +
          '<h4>重建依据</h4>' +
          '<p class="muted">基于 ' + (state._eventIds?.length || 0) + ' 个事件重建</p>' +
          '<div class="event-id-list">' + (state._eventIds || []).map(id => '<span class="evt-id-chip">' + id + '</span>').join('') + '</div>' +
        '</div>' +
        '<div class="rebuild-section">' +
          '<h4>最近观察</h4>' +
          (state.latestObservation ?
            '<div class="latest-obs">' +
              '<div>温度: ' + (state.latestObservation.temperature || '-') + '</div>' +
              '<div>气味: ' + (state.latestObservation.smell || '-') + '</div>' +
              '<div>纤维: ' + (state.latestObservation.fiber || '-') + '</div>' +
              '<div>换水: ' + (state.latestObservation.changedWater || '-') + '</div>' +
              (state.latestObservation.abnormalNote ? '<div class="warn">异常: ' + state.latestObservation.abnormalNote + '</div>' : '') +
            '</div>' :
            '<p class="muted">暂无观察记录</p>') +
        '</div>';
    }

    async function runVerify() {
      const res = await fetch('/api/events/verify', { method: 'POST' });
      const result = await res.json();
      renderVerifyResult(result);
    }

    function renderVerifyResult(result) {
      const el = document.getElementById('verifyResult');
      const statusCls = result.valid ? 'verify-pass' : 'verify-fail';
      const statusText = result.valid ? '✓ 验证通过' : '✗ 验证失败';

      let detailsHtml = '';
      if (result.details && result.details.length > 0) {
        detailsHtml = '<div class="verify-details">' +
          '<h4>详细结果</h4>' +
          result.details.map(d =>
            '<div class="verify-item ' + (d.passed ? 'pass' : 'fail') + '">' +
              '<span class="verify-batch">' + d.batch + '</span>' +
              '<span class="verify-status">' + (d.passed ? '通过' : '失败') + '</span>' +
              (d.issues && d.issues.length > 0 ? '<div class="verify-issues">' + d.issues.join('; ') + '</div>' : '') +
            '</div>'
          ).join('') +
        '</div>';
      }

      el.innerHTML =
        '<div class="verify-summary ' + statusCls + '">' +
          '<h3>' + statusText + '</h3>' +
          '<div class="verify-stats">' +
            '<span>总批次数: ' + result.totalItems + '</span>' +
            '<span>已检查: ' + result.itemsChecked + '</span>' +
            '<span class="pass">通过: ' + result.itemsPassed + '</span>' +
            '<span class="fail">失败: ' + result.itemsFailed + '</span>' +
          '</div>' +
        '</div>' +
        (result.errors.length > 0 ? '<div class="verify-errors"><h4>错误</h4><ul>' + result.errors.map(e => '<li>' + e + '</li>').join('') + '</ul></div>' : '') +
        (result.warnings.length > 0 ? '<div class="verify-warnings"><h4>警告</h4><ul>' + result.warnings.map(e => '<li>' + e + '</li>').join('') + '</ul></div>' : '') +
        detailsHtml;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.remove('hidden');
      };
    });

    document.getElementById('btnFilter').onclick = loadEvents;
    document.getElementById('btnReset').onclick = () => {
      document.getElementById('fBatch').value = '';
      document.getElementById('fType').value = '';
      document.getElementById('fAbnormal').value = '';
      document.getElementById('fStart').value = '';
      document.getElementById('fEnd').value = '';
      loadEvents();
    };
    document.getElementById('btnRebuild').onclick = rebuildState;
    document.getElementById('btnVerify').onclick = runVerify;

    loadStats();
    loadEvents();
  </script>
</body>
</html>`;
}
