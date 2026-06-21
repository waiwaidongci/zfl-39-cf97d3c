export function handoverPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>交接班记录</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/handover.css">
</head>
<body>
  <header>
    <div>
      <h1>交接班记录</h1>
      <div class="meta">记录不同负责人之间对纸浆批次的交接 · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
  </header>
  <main>
    <section class="form-section">
      <h2>新增交接记录</h2>
      <form id="handoverForm">
        <div class="form-row">
          <div class="form-col">
            <label>交出人</label>
            <input name="handedOverBy" required>
          </div>
          <div class="form-col">
            <label>接收人</label>
            <input name="receivedBy" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col full">
            <label>涉及批次（可多选）</label>
            <div class="batch-select-box" id="batchSelectBox"></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>重点观察事项</label>
            <textarea name="keyObservations" placeholder="温度、气味、纤维状态等需要注意的事项"></textarea>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>未处理异常</label>
            <textarea name="pendingAbnormalities" placeholder="尚未处理的异常情况"></textarea>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>下一次换水提醒</label>
            <input name="nextWaterChangeReminder" type="date">
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>备注</label>
            <textarea name="note" placeholder="其他需要说明的事项"></textarea>
          </div>
        </div>
        <button type="submit">提交交接记录</button>
      </form>
    </section>
    <section class="list-section">
      <div class="toolbar">
        <h2>交接记录列表</h2>
        <div class="filters">
          <select id="filterPerson">
            <option value="">全部人员</option>
          </select>
          <select id="filterBatch">
            <option value="">全部批次</option>
          </select>
        </div>
      </div>
      <div id="handoverList" class="handover-list"></div>
    </section>
  </main>
  <script>
    let handovers = [];
    let batches = [];
    let owners = [];

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

    function renderBatchSelect() {
      const box = document.getElementById('batchSelectBox');
      const activeBatches = batches.filter(b =>
        b.status === '发酵中' || b.status === '入缸' || b.status === '异常观察'
      );
      if (activeBatches.length === 0) {
        box.innerHTML = '<div class="meta">暂无进行中的批次</div>';
        return;
      }
      box.innerHTML = activeBatches.map(b =>
        '<label class="batch-item">' +
          '<input type="checkbox" name="batchIds" value="' + b.id + '">' +
          '<span class="batch-code">' + b.code + '</span>' +
          '<span class="batch-meta">' + (b.source || '') + ' · ' + (b.vat || '') + ' · ' + b.status + '</span>' +
        '</label>'
      ).join('');
    }

    function renderFilterOptions() {
      const personSel = document.getElementById('filterPerson');
      personSel.innerHTML = '<option value="">全部人员</option>' +
        owners.map(o => '<option value="' + o + '">' + o + '</option>').join('');

      const batchSel = document.getElementById('filterBatch');
      batchSel.innerHTML = '<option value="">全部批次</option>' +
        batches.map(b => '<option value="' + b.code + '">' + b.code + ' · ' + (b.source || '') + '</option>').join('');
    }

    function getFilteredHandovers() {
      const person = document.getElementById('filterPerson').value;
      const batch = document.getElementById('filterBatch').value;
      return handovers.filter(h => {
        if (person && h.handedOverBy !== person && h.receivedBy !== person) return false;
        if (batch && !(h.batchCodes || []).includes(batch)) return false;
        return true;
      });
    }

    function renderList() {
      const list = getFilteredHandovers();
      const container = document.getElementById('handoverList');
      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🤝</div><h3>暂无交接记录</h3><p>请从左侧表单创建新的交接记录</p></div>';
        return;
      }
      container.innerHTML = list.map(h => {
        const batchesHtml = (h.batchCodes || []).map(c =>
          '<span class="batch-tag">' + c + '</span>'
        ).join('');
        return '<div class="handover-card">' +
          '<div class="handover-head">' +
            '<span class="handover-time">' + formatDateTime(h.createdAt) + '</span>' +
            '<span class="handover-arrow">' + h.handedOverBy + ' → ' + h.receivedBy + '</span>' +
          '</div>' +
          '<div class="handover-batches">' + batchesHtml + '</div>' +
          (h.keyObservations ? '<div class="handover-row"><b>重点观察：</b><span>' + h.keyObservations + '</span></div>' : '') +
          (h.pendingAbnormalities ? '<div class="handover-row warn"><b>未处理异常：</b><span>' + h.pendingAbnormalities + '</span></div>' : '') +
          (h.nextWaterChangeReminder ? '<div class="handover-row water"><b>换水提醒：</b><span>' + h.nextWaterChangeReminder + '</span></div>' : '') +
          (h.note ? '<div class="handover-row"><b>备注：</b><span>' + h.note + '</span></div>' : '') +
        '</div>';
      }).join('');
    }

    async function loadData() {
      const data = await api('/api/handovers');
      handovers = data.handovers || [];
      batches = data.batches || [];
      owners = data.owners || [];
      renderBatchSelect();
      renderFilterOptions();
      renderList();
    }

    document.getElementById('handoverForm').onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const batchIds = Array.from(formData.getAll('batchIds'));
      const data = {
        handedOverBy: formData.get('handedOverBy') || '',
        receivedBy: formData.get('receivedBy') || '',
        batchIds,
        keyObservations: formData.get('keyObservations') || '',
        pendingAbnormalities: formData.get('pendingAbnormalities') || '',
        nextWaterChangeReminder: formData.get('nextWaterChangeReminder') || '',
        note: formData.get('note') || '',
      };
      try {
        await api('/api/handovers', { method: 'POST', body: JSON.stringify(data) });
        e.target.reset();
        await loadData();
        alert('交接记录创建成功！');
      } catch (err) {
        alert('创建失败：' + err.message);
      }
    };

    document.getElementById('filterPerson').onchange = renderList;
    document.getElementById('filterBatch').onchange = renderList;

    loadData();
  </script>
</body>
</html>`;
}
