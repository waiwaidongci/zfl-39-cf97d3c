export function experimentsPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>批次对比实验</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/experiments.css">
</head>
<body>
  <header>
    <div>
      <h1>批次对比实验</h1>
      <div class="meta">把多批纸浆放进同一实验组，对比原料、浸泡缸、换水频率和发酵天数的影响 · <a class="nav-link" href="/">← 返回主页</a> · <a class="nav-link" href="/board">浸泡缸看板</a> · <a class="nav-link" href="/rules">规则配置</a></div>
    </div>
    <div>
      <button id="createExperimentBtn">+ 新建实验组</button>
      <button id="reload">刷新</button>
    </div>
  </header>

  <main>
    <section class="left-panel">
      <div class="panel">
        <h2>实验组列表</h2>
        <div class="exp-list" id="expList">
          <div class="empty">点击"新建实验组"开始创建对比实验</div>
        </div>
      </div>
    </section>

    <section class="right-panel">
      <div class="panel" id="detailPanel" style="display:none">
        <div class="detail-header">
          <h2 id="expName">-</h2>
          <div>
            <button class="secondary" id="addBatchBtn">+ 添加批次</button>
            <button class="secondary" id="editExpBtn">编辑</button>
            <button class="reset" id="deleteExpBtn">删除</button>
          </div>
        </div>
        <div class="meta" id="expDesc">-</div>

        <div class="summary-cards" id="summaryCards"></div>

        <h3>对比图表</h3>
        <div class="charts-area">
          <div class="chart-box">
            <div class="chart-title">异常次数对比</div>
            <div class="bar-chart" id="abnormalChart"></div>
          </div>
          <div class="chart-box">
            <div class="chart-title">达到可抄纸天数</div>
            <div class="bar-chart" id="daysChart"></div>
          </div>
          <div class="chart-box">
            <div class="chart-title">换水频率（次/天）</div>
            <div class="bar-chart" id="waterChart"></div>
          </div>
        </div>

        <h3>对比明细表</h3>
        <div class="table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>批次编号</th>
                <th>原料</th>
                <th>浸泡缸</th>
                <th>当前状态</th>
                <th>已发酵天数</th>
                <th>异常次数</th>
                <th>换水次数</th>
                <th>换水频率</th>
                <th>达到可抄纸天数</th>
                <th>负责人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="compareTableBody"></tbody>
          </table>
        </div>

        <h3>关键观察摘要</h3>
        <div id="observationSummaries" class="observation-summaries"></div>
      </div>

      <div class="panel" id="emptyHint" style="display:block">
        <div class="empty-hint-box">
          <div class="empty-hint-icon">🔬</div>
          <h2>选择左侧实验组查看详细对比</h2>
          <div class="meta">新建实验组后，把不同批次添加进去即可对比各项指标</div>
        </div>
      </div>
    </section>
  </main>

  <div class="modal" id="expModal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="expModalTitle">新建实验组</h2>
        <button class="modal-close" id="expModalClose">&times;</button>
      </div>
      <form id="expForm">
        <label>实验名称</label>
        <input name="name" required placeholder="如：构树皮 vs 桑皮对比">
        <label>实验描述</label>
        <textarea name="description" placeholder="描述实验目的、变量控制等"></textarea>
        <div class="modal-actions">
          <button type="button" class="secondary" id="cancelExp">取消</button>
          <button type="submit" id="saveExp">保存</button>
        </div>
      </form>
    </div>
  </div>

  <div class="modal" id="addBatchModal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2>添加批次到实验组</h2>
        <button class="modal-close" id="addBatchModalClose">&times;</button>
      </div>
      <div class="batch-select-area">
        <input id="batchSearch" placeholder="搜索批次编号、原料、缸名...">
        <div class="batch-select-list" id="batchSelectList"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary" id="cancelAddBatch">取消</button>
        <button type="button" id="confirmAddBatch">添加已选批次</button>
      </div>
    </div>
  </div>

  <script>
    let experiments = [];
    let allItems = [];
    let activeExperimentId = null;
    let editingExpId = null;
    const selectedBatchIds = new Set();

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error((data.errors && data.errors.join('；')) || data.error || '请求失败');
      return data;
    }

    function renderExpList() {
      const container = document.getElementById('expList');
      if (experiments.length === 0) {
        container.innerHTML = '<div class="empty">暂无实验组，点击上方按钮新建</div>';
        return;
      }
      container.innerHTML = experiments.map(e => {
        const isActive = e.id === activeExperimentId;
        return '<div class="exp-item ' + (isActive ? 'active' : '') + '" data-id="' + e.id + '">' +
          '<div class="exp-item-name">' + escapeHtml(e.name) + '</div>' +
          '<div class="exp-item-meta">' + (e.batchCount || 0) + ' 个批次 · ' +
            (e.summary?.readyCount || 0) + ' 可抄纸 · ' +
            (e.summary?.abnormalBatches || 0) + ' 有异常</div>' +
          (e.description ? '<div class="exp-item-desc">' + escapeHtml(e.description.slice(0, 40)) + '</div>' : '') +
        '</div>';
      }).join('');
      document.querySelectorAll('.exp-item').forEach(el => {
        el.onclick = () => selectExperiment(el.dataset.id);
      });
    }

    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderDetail() {
      const exp = experiments.find(e => e.id === activeExperimentId);
      if (!exp) return;

      document.getElementById('detailPanel').style.display = 'block';
      document.getElementById('emptyHint').style.display = 'none';
      document.getElementById('expName').textContent = exp.name;
      document.getElementById('expDesc').textContent = exp.description || '（无描述）';

      const s = exp.summary || {};
      document.getElementById('summaryCards').innerHTML =
        '<div class="sum-card"><span>批次总数</span><strong>' + s.totalBatches + '</strong></div>' +
        '<div class="sum-card"><span>已可抄纸</span><strong>' + s.readyCount + '</strong></div>' +
        '<div class="sum-card warn"><span>有异常批次</span><strong>' + s.abnormalBatches + '</strong></div>' +
        '<div class="sum-card"><span>平均异常次数</span><strong>' + s.avgAbnormal + '</strong></div>' +
        '<div class="sum-card"><span>平均可抄纸天数</span><strong>' + s.avgDaysToReady + '</strong></div>';

      renderBarChart('abnormalChart', exp.batches, 'abnormalCount', '异常次数');
      renderBarChart('daysChart', exp.batches, 'daysToReady', '天数', '—');
      renderBarChart('waterChart', exp.batches, 'waterChangeFrequency', '次/天', '0');

      renderCompareTable(exp.batches);
      renderObservationSummaries(exp.batches);
    }

    function renderBarChart(containerId, batches, field, unit, nullLabel) {
      const container = document.getElementById(containerId);
      if (!batches || batches.length === 0) {
        container.innerHTML = '<div class="chart-empty">暂无数据</div>';
        return;
      }
      const values = batches.map(b => b[field] === null || b[field] === undefined ? NaN : Number(b[field]));
      const validValues = values.filter(v => !isNaN(v));
      const maxVal = validValues.length ? Math.max(...validValues, 1) : 1;
      container.innerHTML = batches.map((b, i) => {
        const rawVal = b[field];
        const isNull = rawVal === null || rawVal === undefined || rawVal === '';
        const val = isNull ? 0 : Number(rawVal);
        const height = maxVal > 0 ? (val / maxVal) * 140 : 0;
        const label = isNull ? (nullLabel || '0') : String(rawVal);
        const shortCode = (b.code || b.id || '').slice(-6);
        const isAbnormal = field === 'abnormalCount' && val > 0;
        return '<div class="bar-col" title="' + escapeHtml(b.code || b.id) + '">' +
          '<div class="bar-val ' + (isAbnormal ? 'warn' : '') + '">' + escapeHtml(label) + (unit ? '<span class="unit"> ' + escapeHtml(unit) + '</span>' : '') + '</div>' +
          '<div class="bar" style="height:' + height + 'px"></div>' +
          '<div class="bar-label">' + escapeHtml(shortCode) + '</div>' +
        '</div>';
      }).join('');
    }

    function renderCompareTable(batches) {
      const tbody = document.getElementById('compareTableBody');
      if (!batches || batches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">暂无批次，请点击"添加批次"</td></tr>';
        return;
      }
      tbody.innerHTML = batches.map(b => {
        const abnormalCls = b.abnormalCount > 0 ? 'warn' : '';
        return '<tr>' +
          '<td><b>' + escapeHtml(b.code || b.id) + '</b></td>' +
          '<td>' + escapeHtml(b.source || '-') + '</td>' +
          '<td>' + escapeHtml(b.vat || '-') + '</td>' +
          '<td><span class="pill">' + escapeHtml(b.status || '-') + '</span></td>' +
          '<td>' + b.days + ' / ' + b.expectedDays + '</td>' +
          '<td class="' + abnormalCls + '">' + b.abnormalCount + '</td>' +
          '<td>' + b.waterChangeCount + '</td>' +
          '<td>' + b.waterChangeFrequency + '</td>' +
          '<td>' + (b.daysToReady !== null ? b.daysToReady + ' 天' : '<span class="meta">未达成</span>') + '</td>' +
          '<td>' + escapeHtml(b.owner || '-') + '</td>' +
          '<td><button class="reset small" data-remove="' + escapeHtml(b.id || b.code) + '">移除</button></td>' +
        '</tr>';
      }).join('');
      document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.onclick = () => removeBatch(btn.dataset.remove);
      });
    }

    function renderObservationSummaries(batches) {
      const container = document.getElementById('observationSummaries');
      if (!batches || batches.length === 0) {
        container.innerHTML = '<div class="empty-cell">暂无观察数据</div>';
        return;
      }
      container.innerHTML = batches.map(b => {
        const obs = b.lastObservations || [];
        const obsHtml = obs.length ? obs.map(o => {
          const date = (o.at || '').slice(0, 10);
          const parts = [];
          if (o.temperature) parts.push('温度' + o.temperature + '℃');
          if (o.smell) parts.push('气味:' + o.smell);
          if (o.fiber) parts.push('纤维:' + o.fiber);
          if (o.changedWater) parts.push('换水:' + o.changedWater);
          if (o.abnormalNote) parts.push('<span class="warn">异常:' + escapeHtml(o.abnormalNote) + '</span>');
          return '<div class="obs-item ' + (o.abnormal ? 'abnormal' : '') + '"><span class="obs-date">' + escapeHtml(date) + '</span> ' + parts.map(p => typeof p === 'string' ? p : escapeHtml(p)).join(' | ') + '</div>';
        }).join('') : '<div class="meta">暂无观察记录</div>';
        return '<div class="obs-block">' +
          '<div class="obs-block-head"><b>' + escapeHtml(b.code || b.id) + '</b> · ' + escapeHtml(b.source || '') + ' · ' + escapeHtml(b.vat || '') +
          ' · 共 ' + b.observationCount + ' 次观察</div>' +
          '<div class="obs-block-body">' + obsHtml + '</div>' +
        '</div>';
      }).join('');
    }

    function renderBatchSelectList() {
      const q = document.getElementById('batchSearch').value.trim().toLowerCase();
      const exp = experiments.find(e => e.id === activeExperimentId);
      const existingIds = new Set(exp ? (exp.batchIds || []) : []);
      const filtered = allItems.filter(item => {
        const id = item.id || item.code;
        if (existingIds.has(id) || selectedBatchIds.has(id)) return false;
        if (!q) return true;
        return (item.code || '').toLowerCase().includes(q) ||
          (item.source || '').toLowerCase().includes(q) ||
          (item.vat || '').toLowerCase().includes(q) ||
          (item.owner || '').toLowerCase().includes(q);
      });
      const container = document.getElementById('batchSelectList');
      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-cell">没有可添加的批次</div>';
        return;
      }
      container.innerHTML = filtered.map(item => {
        const id = item.id || item.code;
        const checked = selectedBatchIds.has(id) ? 'checked' : '';
        return '<label class="batch-option">' +
          '<input type="checkbox" data-batch="' + escapeHtml(id) + '" ' + checked + '>' +
          '<span class="batch-option-code">' + escapeHtml(item.code || item.id) + '</span>' +
          '<span class="batch-option-meta">' + escapeHtml(item.source || '') + ' · ' + escapeHtml(item.vat || '') + ' · <span class="pill">' + escapeHtml(item.status || '') + '</span></span>' +
        '</label>';
      }).join('');
      document.querySelectorAll('[data-batch]').forEach(cb => {
        cb.onchange = () => {
          const id = cb.dataset.batch;
          if (cb.checked) selectedBatchIds.add(id); else selectedBatchIds.delete(id);
        };
      });
    }

    async function selectExperiment(id) {
      activeExperimentId = id;
      const detail = await api('/api/experiments/' + id);
      const idx = experiments.findIndex(e => e.id === id);
      if (idx >= 0) experiments[idx] = detail;
      renderExpList();
      renderDetail();
    }

    function openCreateExp() {
      editingExpId = null;
      document.getElementById('expModalTitle').textContent = '新建实验组';
      document.getElementById('expForm').reset();
      document.getElementById('expModal').style.display = 'flex';
    }

    function openEditExp() {
      const exp = experiments.find(e => e.id === activeExperimentId);
      if (!exp) return;
      editingExpId = exp.id;
      document.getElementById('expModalTitle').textContent = '编辑实验组';
      const form = document.getElementById('expForm');
      form.querySelector('[name="name"]').value = exp.name || '';
      form.querySelector('[name="description"]').value = exp.description || '';
      document.getElementById('expModal').style.display = 'flex';
    }

    function closeExpModal() {
      document.getElementById('expModal').style.display = 'none';
      editingExpId = null;
    }

    async function saveExp(e) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(document.getElementById('expForm')).entries());
      try {
        if (editingExpId) {
          await api('/api/experiments/' + editingExpId, { method: 'PATCH', body: JSON.stringify(formData) });
        } else {
          const created = await api('/api/experiments', { method: 'POST', body: JSON.stringify(formData) });
          activeExperimentId = created.id;
        }
        closeExpModal();
        await load();
        if (activeExperimentId) renderDetail();
      } catch (err) {
        alert(err.message);
      }
    }

    async function deleteExperiment() {
      const exp = experiments.find(e => e.id === activeExperimentId);
      if (!exp) return;
      if (!confirm('确定要删除实验组「' + exp.name + '」吗？')) return;
      try {
        await api('/api/experiments/' + exp.id, { method: 'DELETE' });
        activeExperimentId = null;
        document.getElementById('detailPanel').style.display = 'none';
        document.getElementById('emptyHint').style.display = 'block';
        await load();
      } catch (err) {
        alert(err.message);
      }
    }

    async function openAddBatch() {
      if (!activeExperimentId) return;
      selectedBatchIds.clear();
      document.getElementById('batchSearch').value = '';
      renderBatchSelectList();
      document.getElementById('addBatchModal').style.display = 'flex';
    }

    function closeAddBatchModal() {
      document.getElementById('addBatchModal').style.display = 'none';
      selectedBatchIds.clear();
    }

    async function confirmAddBatch() {
      if (!activeExperimentId || selectedBatchIds.size === 0) {
        if (selectedBatchIds.size === 0) alert('请先选择要添加的批次');
        return;
      }
      try {
        const ids = Array.from(selectedBatchIds);
        await api('/api/experiments/' + activeExperimentId + '/batches', {
          method: 'POST',
          body: JSON.stringify({ batchIds: ids })
        });
        closeAddBatchModal();
        await load();
        if (activeExperimentId) {
          const detail = await api('/api/experiments/' + activeExperimentId);
          const idx = experiments.findIndex(e => e.id === activeExperimentId);
          if (idx >= 0) experiments[idx] = detail;
          renderDetail();
        }
      } catch (err) {
        alert(err.message);
      }
    }

    async function removeBatch(batchId) {
      if (!activeExperimentId) return;
      if (!confirm('确定要从实验组移除该批次吗？')) return;
      try {
        await api('/api/experiments/' + activeExperimentId + '/batches/' + encodeURIComponent(batchId), { method: 'DELETE' });
        await load();
        if (activeExperimentId) {
          const detail = await api('/api/experiments/' + activeExperimentId);
          const idx = experiments.findIndex(e => e.id === activeExperimentId);
          if (idx >= 0) experiments[idx] = detail;
          renderDetail();
        }
      } catch (err) {
        alert(err.message);
      }
    }

    async function load() {
      experiments = await api('/api/experiments');
      allItems = await api('/api/items');
      renderExpList();
    }

    document.getElementById('createExperimentBtn').onclick = openCreateExp;
    document.getElementById('reload').onclick = load;
    document.getElementById('expModalClose').onclick = closeExpModal;
    document.getElementById('cancelExp').onclick = closeExpModal;
    document.getElementById('expForm').onsubmit = saveExp;
    document.getElementById('addBatchBtn').onclick = openAddBatch;
    document.getElementById('editExpBtn').onclick = openEditExp;
    document.getElementById('deleteExpBtn').onclick = deleteExperiment;
    document.getElementById('addBatchModalClose').onclick = closeAddBatchModal;
    document.getElementById('cancelAddBatch').onclick = closeAddBatchModal;
    document.getElementById('confirmAddBatch').onclick = confirmAddBatch;
    document.getElementById('batchSearch').oninput = renderBatchSelectList;

    load();
  </script>
</body>
</html>`;
}
