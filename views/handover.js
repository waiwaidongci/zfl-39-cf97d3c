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
      <div id="prefillNotice" class="prefill-notice" style="display:none"></div>
      <form id="handoverForm">
        <div class="form-row">
          <div class="form-col">
            <label>交出人</label>
            <input name="handedOverBy" id="handedOverBy" required>
          </div>
          <div class="form-col">
            <label>接收人</label>
            <input name="receivedBy" id="receivedBy" required>
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
            <textarea name="keyObservations" id="keyObservations" placeholder="温度、气味、纤维状态等需要注意的事项"></textarea>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>未处理异常</label>
            <textarea name="pendingAbnormalities" id="pendingAbnormalities" placeholder="尚未处理的异常情况"></textarea>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>下一次换水提醒</label>
            <input name="nextWaterChangeReminder" id="nextWaterChangeReminder" type="date">
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>备注</label>
            <textarea name="note" id="note" placeholder="其他需要说明的事项"></textarea>
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
    let prefilledBatchIds = [];

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
      box.innerHTML = activeBatches.map(b => {
        const batchKey = b.id || b.code;
        const isPrefilled = prefilledBatchIds.includes(batchKey) || prefilledBatchIds.includes(b.code);
        const checkedAttr = isPrefilled ? ' checked' : '';
        const highlightClass = isPrefilled ? ' batch-item-prefilled' : '';
        return '<label class="batch-item' + highlightClass + '">' +
          '<input type="checkbox" name="batchIds" value="' + batchKey + '"' + checkedAttr + '>' +
          '<span class="batch-code">' + b.code + '</span>' +
          '<span class="batch-meta">' + (b.source || '') + ' · ' + (b.vat || '') + ' · ' + b.status + '</span>' +
          (isPrefilled ? '<span class="prefill-tag">已预填</span>' : '') +
        '</label>';
      }).join('');
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

    function getBatchInfo(codeOrId) {
      return batches.find(b => b.id === codeOrId || b.code === codeOrId) || null;
    }
    function getStatusClass(status) {
      if (status === '可抄纸') return 'status-ready';
      if (status === '异常观察') return 'status-abnormal';
      if (status === '发酵中') return 'status-fermenting';
      if (status === '入缸') return 'status-started';
      return '';
    }
    function renderList() {
      const list = getFilteredHandovers();
      const container = document.getElementById('handoverList');
      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🤝</div><h3>暂无交接记录</h3><p>请从左侧表单创建新的交接记录</p></div>';
        return;
      }
      container.innerHTML = list.map(h => {
        const codes = h.batchCodes || [];
        const batchesHtml = codes.map(c => {
          const info = getBatchInfo(c);
          const status = info ? info.status : '';
          const statusCls = status ? getStatusClass(status) : '';
          const vat = info ? (info.vat || '') : '';
          const owner = info ? (info.owner || '') : '';
          const source = info ? (info.source || '') : '';
          return '<a class="batch-tag ' + statusCls + '" href="/?code=' + encodeURIComponent(c) + '#openDrawer=' + encodeURIComponent(c) + '" title="原料:' + source + ' · 缸:' + vat + ' · 负责人:' + owner + ' · 状态:' + status + '">' +
            '<span class="bt-code">' + c + '</span>' +
            (status ? '<span class="bt-status">' + status + '</span>' : '') +
          '</a>';
        }).join('');

        const batchDetailHtml = (codes.length > 0) ?
          '<div class="batch-details">' +
          codes.map(c => {
            const info = getBatchInfo(c);
            if (!info) return '';
            return '<div class="bd-item">' +
              '<a class="bd-code" href="/?code=' + encodeURIComponent(c) + '#openDrawer=' + encodeURIComponent(c) + '">' + c + '</a>' +
              '<span class="bd-source">' + (info.source || '-') + '</span>' +
              '<span class="bd-vat">' + (info.vat || '-') + '</span>' +
              '<span class="bd-owner">' + (info.owner || '-') + '</span>' +
              '<span class="bd-status ' + getStatusClass(info.status) + '">' + info.status + '</span>' +
            '</div>';
          }).join('') +
          '</div>' : '';

        return '<div class="handover-card">' +
          '<div class="handover-head">' +
            '<span class="handover-time">' + formatDateTime(h.createdAt) + '</span>' +
            '<span class="handover-arrow">' + h.handedOverBy + ' → ' + h.receivedBy + '</span>' +
          '</div>' +
          '<div class="handover-batches">' + batchesHtml + '</div>' +
          batchDetailHtml +
          (h.keyObservations ? '<div class="handover-row"><b>重点观察：</b><span>' + h.keyObservations + '</span></div>' : '') +
          (h.pendingAbnormalities ? '<div class="handover-row warn"><b>未处理异常：</b><span>' + h.pendingAbnormalities + '</span></div>' : '') +
          (h.nextWaterChangeReminder ? '<div class="handover-row water"><b>换水提醒：</b><span>' + h.nextWaterChangeReminder + '</span></div>' : '') +
          (h.note ? '<div class="handover-row"><b>备注：</b><span>' + h.note + '</span></div>' : '') +
        '</div>';
      }).join('');
    }

    function applyUrlPrefill() {
      const params = new URLSearchParams(window.location.search);
      const batchCodeParam = params.get('batchCode') || params.get('batchId') || '';
      const batchCodesParam = params.get('batchCodes') || '';
      const autoSelect = params.get('autoSelect') === '1' || !!batchCodeParam || !!batchCodesParam;
      const notice = document.getElementById('prefillNotice');
      prefilledBatchIds = [];

      let codes = [];
      if (batchCodesParam) {
        codes = batchCodesParam.split(',').map(c => c.trim()).filter(Boolean);
      } else if (batchCodeParam) {
        codes = [batchCodeParam];
      }

      if (autoSelect && codes.length > 0) {
        prefilledBatchIds = codes;
        const matchedBatches = codes.map(c => batches.find(b =>
          (b.id && b.id === c) || (b.code && b.code === c)
        )).filter(Boolean);

        if (matchedBatches.length > 0) {
          const codesStr = matchedBatches.map(b => b.code).join('、');
          notice.style.display = 'block';
          notice.innerHTML = '📌 已从主页预填批次：<strong>' + codesStr + '</strong>，请确认并填写其他信息后提交。' +
            ' <a href="/handover" class="prefill-clear">清除预填</a>';
          if (matchedBatches.length === 1) {
            const batch = matchedBatches[0];
            if (batch.owner) {
              const handedOverInput = document.getElementById('handedOverBy');
              if (handedOverInput && !handedOverInput.value) {
                handedOverInput.value = batch.owner;
              }
            }
            try {
              api('/api/items/' + encodeURIComponent(batch.id || batch.code) + '/handover-details').then(details => {
                if (details && details.pendingAbnormalitiesList && details.pendingAbnormalitiesList.length > 0) {
                  const latestPending = details.pendingAbnormalitiesList[0];
                  const abnormalInput = document.getElementById('pendingAbnormalities');
                  if (abnormalInput && !abnormalInput.value) {
                    abnormalInput.value = latestPending.content;
                  }
                }
                if (details && details.latestWaterChangeReminder) {
                  const waterInput = document.getElementById('nextWaterChangeReminder');
                  if (waterInput && !waterInput.value) {
                    waterInput.value = details.latestWaterChangeReminder;
                  }
                }
                if (details && details.handovers && details.handovers.length > 0) {
                  const latest = details.handovers[0];
                  if (latest.keyObservations) {
                    const obsInput = document.getElementById('keyObservations');
                    if (obsInput && !obsInput.value) {
                      obsInput.value = latest.keyObservations;
                    }
                  }
                }
              }).catch(() => {});
            } catch (e) {}
          }
        }
      }
    }

    function applyUrlFilters() {
      const params = new URLSearchParams(window.location.search);
      const batchCode = params.get('batchCode') || params.get('batchId') || '';
      const person = params.get('person') || '';
      if (batchCode) {
        const batchSel = document.getElementById('filterBatch');
        if (Array.from(batchSel.options).some(o => o.value === batchCode)) {
          batchSel.value = batchCode;
        }
      }
      if (person) {
        const personSel = document.getElementById('filterPerson');
        if (Array.from(personSel.options).some(o => o.value === person)) {
          personSel.value = person;
        }
      }
      renderList();
    }

    async function loadData() {
      const data = await api('/api/handovers');
      handovers = data.handovers || [];
      batches = data.batches || [];
      owners = data.owners || [];
      applyUrlPrefill();
      renderBatchSelect();
      renderFilterOptions();
      applyUrlFilters();
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
