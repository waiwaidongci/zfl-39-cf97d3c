import {
  CONFLICT_TYPES,
  CONFLICT_TYPE_LABELS,
  RESOLVE_STRATEGIES,
  RESOLVE_STRATEGY_LABELS,
} from "../lib/db.js";

export function syncPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>多工坊数据同步</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/sync.css">
</head>
<body>
  <header>
    <div>
      <h1>🔄 多工坊数据同步</h1>
      <div class="meta">导出本地数据为同步包、导入其他工坊的数据包、检测冲突并人工合并、查看同步历史 · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
    <button id="reload">刷新</button>
  </header>

  <div class="sync-tabs">
    <button class="tab-btn active" data-tab="workshop">🏭 工坊设置</button>
    <button class="tab-btn" data-tab="export">📤 导出包</button>
    <button class="tab-btn" data-tab="import">📥 导入预检</button>
    <button class="tab-btn" data-tab="resolve">⚖️ 冲突解决</button>
    <button class="tab-btn" data-tab="history">📋 同步历史</button>
  </div>

  <main class="sync-main">
    <section id="workshopTab" class="tab-content active">
      <div class="panel">
        <h2>工坊信息设置</h2>
        <p class="hint">每个工坊需要有唯一的标识和名称，用于在同步时区分数据来源。</p>
        <div class="form-group">
          <label>工坊名称</label>
          <input type="text" id="workshopName" placeholder="例如：东工坊、西工坊、A车间">
        </div>
        <div class="form-group">
          <label>工坊ID（自动生成，可手动修改）</label>
          <input type="text" id="workshopId" placeholder="WS-xxxxxx">
        </div>
        <div class="form-actions">
          <button id="saveWorkshopBtn" class="primary">保存工坊信息</button>
        </div>
        <div id="workshopInfo"></div>
      </div>
    </section>

    <section id="exportTab" class="tab-content">
      <div class="panel">
        <h2>导出同步数据包</h2>
        <p class="hint">将本地的纸浆批次数据、观察记录、事件日志等打包为 JSON 文件，发送给其他工坊进行同步。</p>
        <div class="form-group">
          <label>选择要导出的批次（留空则导出全部）</label>
          <select id="exportBatchSelect" multiple size="8">
            <option value="">全部批次</option>
          </select>
        </div>
        <div class="form-group">
          <label>仅导出指定时间之后的变更（可选）</label>
          <input type="datetime-local" id="exportSince">
        </div>
        <div class="form-actions">
          <button id="generateExportBtn" class="primary">生成导出包</button>
        </div>
        <div id="exportResult"></div>
      </div>
    </section>

    <section id="importTab" class="tab-content">
      <div class="panel">
        <h2>导入同步数据包</h2>
        <p class="hint">上传或粘贴其他工坊导出的 JSON 同步包，系统将进行预检并检测冲突。</p>
        <div class="import-methods">
          <div class="form-group">
            <label>选择同步包文件 (.json)</label>
            <input type="file" id="importFileInput" accept=".json">
          </div>
          <div class="divider">或</div>
          <div class="form-group">
            <label>粘贴 JSON 内容</label>
            <textarea id="importPasteArea" placeholder='{"version": 1, "workshop": {...}, "items": [...]}' rows="8"></textarea>
          </div>
        </div>
        <div class="form-actions">
          <button id="previewImportBtn" class="primary">执行导入预检</button>
        </div>
        <div id="importPreview"></div>
      </div>
    </section>

    <section id="resolveTab" class="tab-content">
      <div class="panel">
        <h2>冲突检测与人工合并</h2>
        <p class="hint">当同一个批次在不同工坊被编辑时，可能产生以下冲突：状态冲突、观察记录重复、负责人变更、浸泡缸名称不一致等。请逐项选择处理策略。</p>
        <div id="conflictFilter" class="conflict-filter">
          <button class="filter-btn active" data-filter="all">全部</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.STATUS_CONFLICT}">状态冲突</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.OBSERVATION_DUPLICATE}">观察重复</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.OWNER_CHANGED}">负责人变更</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.VAT_NAME_MISMATCH}">缸名不一致</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.ITEM_MISSING_LOCAL}">本地缺失</button>
          <button class="filter-btn" data-filter="${CONFLICT_TYPES.ITEM_MISSING_REMOTE}">对方缺失</button>
        </div>
        <div class="form-actions">
          <button id="autoResolveAllBtn" class="secondary">一键使用默认策略</button>
          <button id="applyMergeBtn" class="primary" disabled>执行合并写入</button>
        </div>
        <div id="conflictList"></div>
      </div>
    </section>

    <section id="historyTab" class="tab-content">
      <div class="panel">
        <h2>同步历史记录</h2>
        <p class="hint">查看所有的导出和导入操作记录，包括每次同步的数据量和冲突处理情况。</p>
        <div class="form-group">
          <label>筛选类型</label>
          <select id="historyTypeFilter">
            <option value="">全部</option>
            <option value="export">仅导出</option>
            <option value="import">仅导入</option>
          </select>
        </div>
        <div id="historyList"></div>
      </div>
    </section>
  </main>

  <script>
    const CONFLICT_TYPES = ${JSON.stringify(CONFLICT_TYPES)};
    const CONFLICT_TYPE_LABELS = ${JSON.stringify(CONFLICT_TYPE_LABELS)};
    const RESOLVE_STRATEGIES = ${JSON.stringify(RESOLVE_STRATEGIES)};
    const RESOLVE_STRATEGY_LABELS = ${JSON.stringify(RESOLVE_STRATEGY_LABELS)};

    let currentPkg = null;
    let currentConflicts = [];
    let workshopInfo = null;

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (data.message || '请求失败'));
      return data;
    }

    function formatDateTime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function setupTabs() {
      document.querySelectorAll('.sync-tabs .tab-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.sync-tabs .tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.sync-main .tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          const tabId = btn.dataset.tab + 'Tab';
          document.getElementById(tabId).classList.add('active');
          if (btn.dataset.tab === 'export') loadExportBatches();
          if (btn.dataset.tab === 'history') loadHistory();
        };
      });
    }

    async function loadWorkshopInfo() {
      try {
        workshopInfo = await api('/api/sync/workshop');
        document.getElementById('workshopName').value = workshopInfo.workshopName || '';
        document.getElementById('workshopId').value = workshopInfo.workshopId || '';
        document.getElementById('workshopInfo').innerHTML =
          '<div class="info-card"><div><strong>当前工坊：</strong>' + (workshopInfo.workshopName || '(未命名)') + '</div>' +
          '<div><strong>工坊ID：</strong>' + (workshopInfo.workshopId || '(未设置)') + '</div>' +
          (workshopInfo.lastExportAt ? '<div><strong>最后导出：</strong>' + formatDateTime(workshopInfo.lastExportAt) + '</div>' : '') +
          (workshopInfo.lastImportAt ? '<div><strong>最后导入：</strong>' + formatDateTime(workshopInfo.lastImportAt) + '</div>' : '') +
          '</div>';
      } catch (e) {
        console.error(e);
      }
    }

    async function saveWorkshop() {
      const name = document.getElementById('workshopName').value.trim();
      const id = document.getElementById('workshopId').value.trim();
      if (!name) { alert('请输入工坊名称'); return; }
      try {
        const result = await api('/api/sync/workshop', { method: 'POST', body: JSON.stringify({ workshopName: name, workshopId: id }) });
        workshopInfo = result;
        alert('工坊信息已保存');
        loadWorkshopInfo();
      } catch (e) {
        alert('保存失败：' + e.message);
      }
    }

    async function loadExportBatches() {
      try {
        const items = await api('/api/items');
        const select = document.getElementById('exportBatchSelect');
        select.innerHTML = '<option value="">全部批次</option>' +
          items.map(it => '<option value="' + (it.code || it.id) + '">' + (it.code || it.id) + ' · ' + (it.source || '') + ' · ' + (it.status || '') + '</option>').join('');
      } catch (e) { console.error(e); }
    }

    async function generateExport() {
      const batchCodes = Array.from(document.getElementById('exportBatchSelect').selectedOptions)
        .map(o => o.value).filter(v => v);
      const since = document.getElementById('exportSince').value;
      try {
        const result = await api('/api/sync/export', {
          method: 'POST',
          body: JSON.stringify({ batchCodes: batchCodes.length ? batchCodes : null, since: since || null })
        });
        const pkg = result.package;
        const stats = result.stats;

        const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = 'sync-' + (stats.workshopName || 'workshop') + '-' + new Date().toISOString().slice(0, 10) + '.json';

        document.getElementById('exportResult').innerHTML =
          '<div class="success-card">' +
          '<h3>✅ 导出包已生成</h3>' +
          '<div class="stats-grid">' +
          '<div><strong>工坊：</strong>' + stats.workshopName + '</div>' +
          '<div><strong>批次数量：</strong>' + stats.itemCount + '</div>' +
          '<div><strong>事件数量：</strong>' + stats.eventCount + '</div>' +
          '<div><strong>浸泡缸：</strong>' + stats.vatCount + '</div>' +
          '<div><strong>规则：</strong>' + stats.ruleCount + '</div>' +
          '</div>' +
          '<div class="form-actions"><a class="btn primary" href="' + url + '" download="' + filename + '">⬇️ 下载同步包</a></div>' +
          '</div>';
      } catch (e) {
        alert('导出失败：' + e.message);
      }
    }

    async function previewImport() {
      let jsonText = '';
      const file = document.getElementById('importFileInput').files?.[0];
      const pasteText = document.getElementById('importPasteArea').value.trim();

      if (file) {
        jsonText = await file.text();
      } else if (pasteText) {
        jsonText = pasteText;
      } else {
        alert('请选择文件或粘贴 JSON 内容');
        return;
      }

      try {
        const pkg = JSON.parse(jsonText);
        const result = await api('/api/sync/import/preview', {
          method: 'POST',
          body: JSON.stringify({ package: pkg })
        });

        currentPkg = pkg;
        currentConflicts = result.conflicts.map(c => ({ ...c, resolved: false, resolution: null }));

        renderImportPreview(result, pkg);
        renderConflicts(currentConflicts);

        document.querySelector('.sync-tabs .tab-btn[data-tab="resolve"]').click();
      } catch (e) {
        document.getElementById('importPreview').innerHTML =
          '<div class="error-card"><h3>❌ 导入失败</h3><div>' + e.message + '</div></div>';
      }
    }

    function renderImportPreview(previewResult, pkg) {
      const summary = previewResult.summary;
      const validation = previewResult.validation;

      let html = '<div class="preview-card">';
      html += '<h3>📦 导入预检结果</h3>';

      if (validation && validation.errors && validation.errors.length > 0) {
        html += '<div class="error-box"><strong>格式错误：</strong><ul>' +
          validation.errors.map(e => '<li>' + e + '</li>').join('') + '</ul></div>';
      }
      if (validation && validation.warnings && validation.warnings.length > 0) {
        html += '<div class="warn-box"><strong>警告：</strong><ul>' +
          validation.warnings.map(w => '<li>' + w + '</li>').join('') + '</ul></div>';
      }

      html += '<div class="stats-grid">' +
        '<div><strong>来源工坊：</strong>' + (summary.remoteWorkshopName || '未知') + ' (' + summary.remoteWorkshopId + ')</div>' +
        '<div><strong>导出时间：</strong>' + formatDateTime(summary.exportedAt) + '</div>' +
        '<div><strong>批次数量：</strong>' + summary.remoteItemCount + '</div>' +
        '<div><strong>事件数量：</strong>' + summary.remoteEventCount + '</div>' +
        '<div><strong>匹配批次：</strong>' + summary.matchedItemCount + '</div>' +
        '<div><strong>新增批次：</strong>' + summary.newItemCount + '</div>' +
        '<div class="full-width warn"><strong>冲突总数：</strong>' + summary.totalConflicts + '</div>' +
        '</div>';

      if (summary.byType) {
        html += '<div class="conflict-types"><h4>冲突类型分布：</h4><ul>';
        for (const [type, count] of Object.entries(summary.byType)) {
          html += '<li><span class="conflict-badge">' + (CONFLICT_TYPE_LABELS[type] || type) + '</span> × ' + count + '</li>';
        }
        html += '</ul></div>';
      }

      html += '</div>';
      document.getElementById('importPreview').innerHTML = html;
    }

    function renderConflicts(conflicts, filterType) {
      const list = document.getElementById('conflictList');
      const filtered = filterType && filterType !== 'all'
        ? conflicts.filter(c => c.type === filterType)
        : conflicts;

      if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">没有需要解决的冲突。请先导入同步包进行预检。</div>';
        updateMergeButton();
        return;
      }

      let html = '';
      for (const conflict of filtered) {
        html += renderConflictCard(conflict);
      }
      list.innerHTML = html;

      filtered.forEach(conflict => {
        const card = document.querySelector('[data-conflict-id="' + conflict.id + '"]');
        if (!card) return;

        const select = card.querySelector('.strategy-select');
        if (select) {
          select.onchange = (e) => {
            const strategy = e.target.value;
            const idx = currentConflicts.findIndex(c => c.id === conflict.id);
            if (idx >= 0) {
              if (strategy === 'custom' && RESOLVE_STRATEGIES.CUSTOM) {
                showCustomResolveDialog(currentConflicts[idx]);
              } else {
                currentConflicts[idx] = applyResolveStrategy(currentConflicts[idx], strategy);
                renderConflicts(currentConflicts, document.querySelector('.filter-btn.active')?.dataset.filter);
              }
            }
          };
        }
      });

      updateMergeButton();
    }

    function renderConflictCard(conflict) {
      const typeLabel = CONFLICT_TYPE_LABELS[conflict.type] || conflict.type;
      const strategies = conflict.availableStrategies || [];
      const currentStrategy = conflict.resolution?.strategy || conflict.defaultStrategy;

      let localHtml = '';
      let remoteHtml = '';

      if (conflict.type === CONFLICT_TYPES.STATUS_CONFLICT) {
        localHtml = '<div class="value-badge local">' + (conflict.local?.status || '(空)') + '</div><div class="meta">更新于 ' + formatDateTime(new Date(conflict.local?.updatedAt || 0).toISOString()) + '</div>';
        remoteHtml = '<div class="value-badge remote">' + (conflict.remote?.status || '(空)') + '</div><div class="meta">更新于 ' + formatDateTime(new Date(conflict.remote?.updatedAt || 0).toISOString()) + '</div>';
      } else if (conflict.type === CONFLICT_TYPES.OWNER_CHANGED) {
        localHtml = '<div class="value-badge local">' + (conflict.local?.owner || '(空)') + '</div>';
        remoteHtml = '<div class="value-badge remote">' + (conflict.remote?.owner || '(空)') + '</div>';
      } else if (conflict.type === CONFLICT_TYPES.VAT_NAME_MISMATCH) {
        localHtml = '<div class="value-badge local">' + (conflict.local?.vat || '(空)') + (conflict.local?.vatId ? ' (' + conflict.local.vatId + ')' : '') + '</div>';
        remoteHtml = '<div class="value-badge remote">' + (conflict.remote?.vat || '(空)') + (conflict.remote?.vatId ? ' (' + conflict.remote.vatId + ')' : '') + '</div>';
      } else if (conflict.type === CONFLICT_TYPES.OBSERVATION_DUPLICATE) {
        localHtml = '<div>共 ' + (conflict.local?.observationCount || 0) + ' 条观察</div>' +
          '<div class="meta">最近：' + JSON.stringify(conflict.local?.sample?.[conflict.local.sample.length - 1] || {}).slice(0, 60) + '...</div>';
        remoteHtml = '<div>共 ' + (conflict.remote?.observationCount || 0) + ' 条观察</div>' +
          '<div class="meta">重复 ' + (conflict.duplicates?.length || 0) + ' 条</div>';
      } else if (conflict.type === CONFLICT_TYPES.ITEM_MISSING_LOCAL) {
        localHtml = '<div class="empty-state">本地无此批次</div>';
        remoteHtml = '<div class="value-badge remote">' + (conflict.remote?.code || conflict.remote?.id) + ' · ' + (conflict.remote?.source || '') + ' · ' + (conflict.remote?.status || '') + '</div>';
      } else if (conflict.type === CONFLICT_TYPES.ITEM_MISSING_REMOTE) {
        localHtml = '<div class="value-badge local">' + (conflict.local?.code || conflict.local?.id) + ' · ' + (conflict.local?.source || '') + ' · ' + (conflict.local?.status || '') + '</div>';
        remoteHtml = '<div class="empty-state">对方无此批次</div>';
      } else if (conflict.type === CONFLICT_TYPES.EVENT_CONFLICT) {
        localHtml = '<div>本地事件 ' + (conflict.local?.eventCount || 0) + ' 条冲突</div>';
        remoteHtml = '<div>对方事件 ' + (conflict.remote?.eventCount || 0) + ' 条冲突</div>';
      } else {
        localHtml = '<div>' + JSON.stringify(conflict.local || {}).slice(0, 100) + '</div>';
        remoteHtml = '<div>' + JSON.stringify(conflict.remote || {}).slice(0, 100) + '</div>';
      }

      const strategyOptions = strategies.map(s =>
        '<option value="' + s + '" ' + (s === currentStrategy ? 'selected' : '') + '>' +
        (RESOLVE_STRATEGY_LABELS[s] || s) +
        (s === conflict.defaultStrategy ? ' (默认)' : '') +
        '</option>'
      ).join('');

      const resolvedClass = conflict.resolved ? 'resolved' : '';
      const resolutionNote = conflict.resolution?.note || '';

      return '<div class="conflict-card ' + resolvedClass + '" data-conflict-id="' + conflict.id + '">' +
        '<div class="conflict-header">' +
        '<span class="conflict-type-badge">' + typeLabel + '</span>' +
        '<span class="conflict-batch">' + conflict.batchCode + '</span>' +
        (conflict.resolved ? '<span class="resolved-badge">✅ 已处理</span>' : '<span class="pending-badge">⏳ 待处理</span>') +
        '</div>' +
        '<div class="conflict-desc">' + conflict.description + '</div>' +
        '<div class="conflict-compare">' +
        '<div class="compare-col local-col"><div class="col-title">🏠 本地</div>' + localHtml + '</div>' +
        '<div class="compare-vs">VS</div>' +
        '<div class="compare-col remote-col"><div class="col-title">🌐 对方</div>' + remoteHtml + '</div>' +
        '</div>' +
        '<div class="conflict-resolution">' +
        '<label>处理策略：</label>' +
        '<select class="strategy-select">' + strategyOptions + '</select>' +
        (resolutionNote ? '<span class="resolution-note">💬 ' + resolutionNote + '</span>' : '') +
        '</div>' +
        '</div>';
    }

    function applyResolveStrategy(conflict, strategy) {
      const resolved = { ...conflict, resolved: true };
      switch (strategy) {
        case RESOLVE_STRATEGIES.USE_LOCAL:
          resolved.resolution = { strategy, value: conflict.local, note: '采用本地版本' };
          break;
        case RESOLVE_STRATEGIES.USE_REMOTE:
          resolved.resolution = { strategy, value: conflict.remote, note: '采用对方版本' };
          break;
        case RESOLVE_STRATEGIES.KEEP_BOTH:
          resolved.resolution = { strategy, value: { local: conflict.local, remote: conflict.remote }, note: '两者都保留' };
          break;
        case RESOLVE_STRATEGIES.CUSTOM:
          resolved.resolution = { strategy, value: null, note: '等待自定义合并' };
          break;
        default:
          resolved.resolution = { strategy: conflict.defaultStrategy, value: conflict.local, note: '使用默认策略' };
      }
      return resolved;
    }

    function showCustomResolveDialog(conflict) {
      let customValue = {};
      if (conflict.field === 'status') {
        const val = prompt('请输入自定义状态（入缸/发酵中/可抄纸/异常观察）：', conflict.local?.status || conflict.remote?.status || '');
        if (val === null) return;
        customValue = { status: val };
      } else if (conflict.field === 'owner') {
        const val = prompt('请输入自定义负责人：', conflict.local?.owner || conflict.remote?.owner || '');
        if (val === null) return;
        customValue = { owner: val };
      } else if (conflict.field === 'vat') {
        const vat = prompt('请输入浸泡缸名称：', conflict.local?.vat || conflict.remote?.vat || '');
        if (vat === null) return;
        const vatId = prompt('请输入浸泡缸ID（可选）：', conflict.local?.vatId || conflict.remote?.vatId || '');
        customValue = { vat, vatId };
      } else {
        alert('该冲突类型暂不支持自定义合并');
        return;
      }
      const idx = currentConflicts.findIndex(c => c.id === conflict.id);
      if (idx >= 0) {
        currentConflicts[idx] = {
          ...conflict,
          resolved: true,
          resolution: { strategy: RESOLVE_STRATEGIES.CUSTOM, value: customValue, note: '自定义合并：' + JSON.stringify(customValue) }
        };
        renderConflicts(currentConflicts, document.querySelector('.filter-btn.active')?.dataset.filter);
      }
    }

    function autoResolveAll() {
      currentConflicts = currentConflicts.map(c =>
        applyResolveStrategy(c, c.defaultStrategy)
      );
      renderConflicts(currentConflicts, document.querySelector('.filter-btn.active')?.dataset.filter);
    }

    function updateMergeButton() {
      const allResolved = currentConflicts.length > 0 && currentConflicts.every(c => c.resolved);
      const btn = document.getElementById('applyMergeBtn');
      btn.disabled = !(allResolved && currentPkg);
    }

    async function applyMerge() {
      if (!currentPkg || currentConflicts.length === 0) {
        alert('请先导入同步包并解决所有冲突');
        return;
      }
      if (!confirm('确认将合并后的数据写入本地数据库？此操作不可撤销。')) return;

      try {
        const result = await api('/api/sync/import/apply', {
          method: 'POST',
          body: JSON.stringify({
            package: currentPkg,
            resolvedConflicts: currentConflicts
          })
        });

        const r = result.mergeResult;
        let html = '<div class="success-card"><h3>✅ 合并完成</h3>';
        html += '<div class="stats-grid">' +
          '<div><strong>新增批次：</strong>' + r.itemsCreated + '</div>' +
          '<div><strong>更新批次：</strong>' + r.itemsUpdated + '</div>' +
          '<div><strong>新增事件：</strong>' + r.eventsAdded + '</div>' +
          '<div><strong>跳过：</strong>' + r.skipped + '</div>' +
          '<div><strong>处理冲突：</strong>' + r.conflictsResolved + '</div>' +
          '</div>';
        if (r.details && r.details.length > 0) {
          html += '<div class="details-list"><h4>详细：</h4><ul>';
          for (const d of r.details.slice(0, 20)) {
            html += '<li>' + d.batch + ' → ' + d.action + (d.reason ? ' (' + d.reason + ')' : '') + '</li>';
          }
          if (r.details.length > 20) html += '<li>... 还有 ' + (r.details.length - 20) + ' 条</li>';
          html += '</ul></div>';
        }
        html += '</div>';

        document.getElementById('conflictList').innerHTML = html;
        currentPkg = null;
        currentConflicts = [];
        updateMergeButton();
        loadWorkshopInfo();
      } catch (e) {
        alert('合并失败：' + e.message);
      }
    }

    async function loadHistory() {
      const type = document.getElementById('historyTypeFilter').value;
      try {
        const history = await api('/api/sync/history' + (type ? '?type=' + type : ''));
        if (history.length === 0) {
          document.getElementById('historyList').innerHTML = '<div class="empty-state">暂无同步记录</div>';
          return;
        }

        let html = '';
        for (const h of history) {
          const isExport = h.type === 'export';
          html += '<div class="history-card">' +
            '<div class="history-header">' +
            '<span class="history-type-badge ' + (isExport ? 'export' : 'import') + '">' + (isExport ? '📤 导出' : '📥 导入') + '</span>' +
            '<span class="history-time">' + formatDateTime(h.timestamp) + '</span>' +
            (h.remoteWorkshopName ? '<span class="history-workshop">↔ ' + h.remoteWorkshopName + '</span>' : '') +
            '</div>' +
            '<div class="history-result">' +
            (isExport
              ? ('<span>导出批次: ' + (h.result?.itemCount || 0) + '</span><span>事件: ' + (h.result?.eventCount || 0) + '</span>')
              : ('<span>新增: ' + (h.result?.itemsCreated || 0) + '</span><span>更新: ' + (h.result?.itemsUpdated || 0) + '</span><span>事件: ' + (h.result?.eventsAdded || 0) + '</span>')
            ) +
            (h.conflictCount > 0 ? '<span class="warn">冲突: ' + h.conflictCount + ' (已解决 ' + h.resolvedCount + ')</span>' : '') +
            '</div>' +
            '</div>';
        }
        document.getElementById('historyList').innerHTML = html;
      } catch (e) {
        console.error(e);
      }
    }

    function setupConflictFilter() {
      document.querySelectorAll('.conflict-filter .filter-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.conflict-filter .filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderConflicts(currentConflicts, btn.dataset.filter);
        };
      });
    }

    document.getElementById('saveWorkshopBtn').onclick = saveWorkshop;
    document.getElementById('generateExportBtn').onclick = generateExport;
    document.getElementById('previewImportBtn').onclick = previewImport;
    document.getElementById('autoResolveAllBtn').onclick = autoResolveAll;
    document.getElementById('applyMergeBtn').onclick = applyMerge;
    document.getElementById('historyTypeFilter').onchange = loadHistory;
    document.getElementById('reload').onclick = () => location.reload();

    setupTabs();
    setupConflictFilter();
    loadWorkshopInfo();
  </script>
</body>
</html>`;
}
