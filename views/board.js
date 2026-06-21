import { vatFields, stages } from "../lib/db.js";

export function boardPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>浸泡缸容量与排程看板</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/board.css">
</head>
<body>
  <header>
    <div>
      <h1>浸泡缸容量与排程看板</h1>
      <div class="meta">管理浸泡缸容量、发酵批次排程与超期预警 · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
    <div>
      <button id="addVatBtn" class="secondary">新增浸泡缸</button>
      <button id="reload">刷新</button>
    </div>
  </header>

  <div class="content">
    <div class="board-stats" id="boardStats"></div>

    <div class="board-filters">
      <div class="filter-group">
        <label>状态筛选</label>
        <select id="statusFilter">
          <option value="">全部状态</option>
          ${stages.map((s) => "<option>" + s + "</option>").join("")}
        </select>
      </div>
      <div class="filter-group">
        <label>风险筛选</label>
        <select id="riskFilter">
          <option value="">全部</option>
          <option value="overdue">有超期批次</option>
          <option value="overload">容量过载</option>
          <option value="risk">有风险</option>
        </select>
      </div>
      <div class="filter-group">
        <input id="search" placeholder="搜索缸名或批次">
      </div>
    </div>

    <div class="board-grid" id="boardGrid"></div>
  </div>

  <div class="modal" id="vatModal" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modalTitle">新增浸泡缸</h2>
        <button class="modal-close" id="modalClose">&times;</button>
      </div>
      <form id="vatForm">
        <div id="vatFields"></div>
        <div class="modal-actions">
          <button type="button" class="secondary" id="cancelVat">取消</button>
          <button type="submit" id="saveVat">保存</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const vatFields = ${JSON.stringify(vatFields)};
    const stages = ${JSON.stringify(stages)};
    let boardData = { vats: [], stats: {} };
    let editingVatId = null;

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }

    function renderStats() {
      const vats = boardData.vats || [];
      const totalCapacity = vats.reduce((sum, v) => sum + (v.capacity || 0), 0);
      const totalOccupied = vats.reduce((sum, v) => sum + (v.occupied || 0), 0);
      const totalOverdue = vats.reduce((sum, v) => sum + (v.overdueCount || 0), 0);
      const riskVats = vats.filter(v => v.hasRisk).length;

      document.getElementById('boardStats').innerHTML =
        '<div class="bstat"><span>浸泡缸总数</span><strong>' + vats.length + '</strong></div>' +
        '<div class="bstat"><span>总容量</span><strong>' + totalCapacity + ' 批次</strong></div>' +
        '<div class="bstat"><span>已占用</span><strong>' + totalOccupied + ' 批次</strong></div>' +
        '<div class="bstat warn"><span>超期批次</span><strong>' + totalOverdue + '</strong></div>' +
        '<div class="bstat warn"><span>有风险缸</span><strong>' + riskVats + '</strong></div>';
    }

    function vatCardHtml(vat) {
      const items = vat.items || [];
      const cls = ['vat-card'];
      if (vat.hasRisk) cls.push('risk');
      if (vat.overload) cls.push('overload');
      if (vat.overdueCount > 0) cls.push('has-overdue');

      let badges = '';
      if (vat.overload) badges += '<span class="vat-badge overload-badge">容量过载</span>';
      if (vat.overdueCount > 0) badges += '<span class="vat-badge overdue-badge">' + vat.overdueCount + ' 批超期</span>';

      const itemsHtml = items.length ? items.map(item => batchCardHtml(item)).join('') : '<div class="empty-batch">暂无发酵中批次</div>';

      return '<div class="' + cls.join(' ') + '">' +
        '<div class="vat-header">' +
          '<div class="vat-title">' +
            '<h3>' + vat.name + '</h3>' +
            badges +
          '</div>' +
          '<div class="vat-capacity-bar">' +
            '<div class="vat-capacity-fill" style="width:' + Math.min(100, (vat.occupied / vat.capacity) * 100) + '%"></div>' +
          '</div>' +
          '<div class="vat-capacity-text">' + vat.occupied + ' / ' + vat.capacity + ' 批次 · 剩余 ' + vat.remaining + '</div>' +
          '<div class="vat-meta">' +
            (vat.location ? '<span>位置：' + vat.location + '</span>' : '') +
            (vat.material ? '<span>材质：' + vat.material + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="vat-batches">' + itemsHtml + '</div>' +
        '<div class="vat-actions">' +
          '<button class="secondary small" data-edit="' + vat.id + '">编辑缸</button>' +
          '<button class="danger small" data-delete="' + vat.id + '">删除</button>' +
        '</div>' +
      '</div>';
    }

    function batchCardHtml(item) {
      const cls = ['batch-card'];
      if (item.isOverdue) cls.push('overdue');
      if (item.status === '异常观察') cls.push('abnormal');

      let badges = '';
      if (item.isOverdue) badges += '<span class="batch-badge overdue-badge">超期 ' + item.overdueDays + ' 天</span>';
      if (item.status === '异常观察') badges += '<span class="batch-badge abnormal-badge">异常观察</span>';

      return '<div class="' + cls.join(' ') + '">' +
        '<div class="batch-head">' +
          '<span class="batch-code">' + (item.code || item.id) + '</span>' +
          '<span class="batch-status pill">' + item.status + '</span>' +
        '</div>' +
        badges +
        '<div class="batch-info">' +
          '<div>原料：' + (item.source || '-') + '</div>' +
          '<div>负责人：' + (item.owner || '-') + '</div>' +
          '<div>已发酵：' + (item.days || 0) + ' 天 / 预计 ' + (item.expectedDays || 7) + ' 天</div>' +
        '</div>' +
        '<div class="batch-progress">' +
          '<div class="batch-progress-bar">' +
            '<div class="batch-progress-fill" style="width:' + item.progress + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="batch-dates">' +
          (item.startDate ? '<span>入缸：' + item.startDate + '</span>' : '') +
          (item.expectedEndDate ? '<span>预计可抄纸：' + item.expectedEndDate + '</span>' : '') +
        '</div>' +
      '</div>';
    }

    function render() {
      const status = document.getElementById('statusFilter').value;
      const risk = document.getElementById('riskFilter').value;
      const q = document.getElementById('search').value.trim().toLowerCase();

      let vats = boardData.vats || [];

      if (q) {
        vats = vats.filter(v =>
          v.name.toLowerCase().includes(q) ||
          (v.items || []).some(i => (i.code || '').toLowerCase().includes(q) || (i.source || '').toLowerCase().includes(q))
        );
      }

      if (risk === 'overdue') {
        vats = vats.filter(v => v.overdueCount > 0);
      } else if (risk === 'overload') {
        vats = vats.filter(v => v.overload);
      } else if (risk === 'risk') {
        vats = vats.filter(v => v.hasRisk);
      }

      if (status) {
        vats = vats.map(v => ({
          ...v,
          items: (v.items || []).filter(i => i.status === status)
        }));
      }

      const grid = document.getElementById('boardGrid');
      if (vats.length === 0) {
        grid.innerHTML = '<div class="empty-board">暂无匹配的浸泡缸，请调整筛选条件</div>';
      } else {
        grid.innerHTML = vats.map(v => vatCardHtml(v)).join('');
      }

      document.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => openEditVat(btn.dataset.edit);
      });
      document.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = () => deleteVat(btn.dataset.delete);
      });
    }

    function renderVatForm() {
      document.getElementById('vatFields').innerHTML = vatFields.map(([key, label, type]) =>
        '<label>' + label + '</label><input name="' + key + '" type="' + type + '" ' + (key === 'name' ? 'required' : '') + '>'
      ).join('');
    }

    function openAddVat() {
      editingVatId = null;
      document.getElementById('modalTitle').textContent = '新增浸泡缸';
      document.getElementById('vatForm').reset();
      document.getElementById('vatModal').style.display = 'flex';
    }

    function openEditVat(id) {
      const vat = (boardData.vats || []).find(v => v.id === id);
      if (!vat) return;
      editingVatId = id;
      document.getElementById('modalTitle').textContent = '编辑浸泡缸';
      const form = document.getElementById('vatForm');
      vatFields.forEach(([key]) => {
        const input = form.querySelector('[name="' + key + '"]');
        if (input) input.value = vat[key] || '';
      });
      document.getElementById('vatModal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('vatModal').style.display = 'none';
      editingVatId = null;
    }

    async function saveVat(e) {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(document.getElementById('vatForm')).entries());
      try {
        if (editingVatId) {
          await api('/api/vats/' + editingVatId, { method: 'PATCH', body: JSON.stringify(formData) });
        } else {
          await api('/api/vats', { method: 'POST', body: JSON.stringify(formData) });
        }
        closeModal();
        await load();
      } catch (err) {
        alert(err.message);
      }
    }

    async function deleteVat(id) {
      const vat = (boardData.vats || []).find(v => v.id === id);
      if (!confirm('确定要删除浸泡缸「' + vat.name + '」吗？')) return;
      try {
        await api('/api/vats/' + id, { method: 'DELETE' });
        await load();
      } catch (err) {
        alert(err.message);
      }
    }

    async function load() {
      boardData = await api('/api/board');
      renderStats();
      render();
    }

    document.getElementById('addVatBtn').onclick = openAddVat;
    document.getElementById('reload').onclick = load;
    document.getElementById('modalClose').onclick = closeModal;
    document.getElementById('cancelVat').onclick = closeModal;
    document.getElementById('vatForm').onsubmit = saveVat;
    document.getElementById('statusFilter').onchange = render;
    document.getElementById('riskFilter').onchange = render;
    document.getElementById('search').oninput = render;

    renderVatForm();
    load();
  </script>
</body>
</html>`;
}
