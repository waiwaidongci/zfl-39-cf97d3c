import { fields, stages, extraFields } from "../lib/db.js";

export function mainPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>古法纸浆发酵记录</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/main.css">
</head>
<body>
  <header><div><h1>古法纸浆发酵记录</h1><div class="meta">纸浆批次、浸泡缸、换水和异常观察 · <a class="nav-link" href="/handover">🤝 交接班记录</a> · <a class="nav-link" href="/report">📋 可抄纸评估报告</a> · <a class="nav-link" href="/experiments">🔬 批次对比实验</a> · <a class="nav-link" href="/rules">⚙️ 发酵判定规则配置</a> · <a class="nav-link" href="/mobile-inspection">📱 现场离线巡检</a> · <a class="nav-link" href="/batch-import">批量导入观察记录</a> · <a class="nav-link" href="/board">浸泡缸容量与排程看板</a> · <a class="nav-link" href="/timeline">批次时间轴与异常复盘 →</a></div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增纸浆批次</h2><div id="fields"></div><label>初始状态</label><select name="status">${stages.map((s) => "<option>" + s + "</option>").join("")}</select><button>保存纸浆批次</button></form>
      <form id="actionForm" class="mt-14"><h2>每日观察记录</h2><label>选择纸浆批次</label><select name="id" id="itemSelect"></select><div id="extraFields"></div><button>提交记录</button></form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stages.map((s) => "<option>" + s + "</option>").join("")}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>每天记录温度、气味、纤维状态和换水情况，系统统计发酵进度与异常次数。</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    const fields = ${JSON.stringify(fields)};
    const stages = ${JSON.stringify(stages)};
    const extraFields = ${JSON.stringify(extraFields)};
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    let items = [];
    let vats = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function renderForms() {
      const fieldsHtml = fields.map(([key,label,type]) => {
        if (key === 'vat') {
          return '<label>'+label+'</label><select name="vat" data-vat-select><option value="">请选择</option>' + vats.map(v => '<option value="'+v.name+'" data-id="'+v.id+'">'+v.name+' (容量:'+v.capacity+')</option>').join('') + '</select>';
        }
        if (key === 'vatId') return '';
        return '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>';
      }).join('');
      document.querySelector('#fields').innerHTML = fieldsHtml;
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
    }
    function render() {
      itemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.name || item.shipType || item.source || item.plateSize || '')+'</option>').join('');
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(item => cardHtml(item)).join('');
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } });
      document.querySelectorAll('[data-report]').forEach(btn => btn.onclick = () => { window.location.href = '/report/' + encodeURIComponent(btn.dataset.report); });
    }
    function formatDateTime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return m + '-' + day + ' ' + hh + ':' + mm;
    }
    function cardHtml(item) {
      const itemCode = item.code || item.id;
      const main = fields.filter(([k]) => k !== 'vatId' && k !== 'startDate' && k !== 'expectedDays').slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const tasks = (item.tasks || []).map(t => '<div class="meta">任务 '+t.position+' · '+t.status+' · '+t.tension+'</div>').join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
      const reportBtn = item.status === '可抄纸' ? '<button class="secondary" data-report="'+itemCode+'">📋 评估报告</button>' : '';
      const handover = item.latestHandover;
      const handoverLink = '/handover?batchCode=' + encodeURIComponent(itemCode);
      const timelineLink = '/timeline?code=' + encodeURIComponent(itemCode);
      const handoverHtml = handover ?
        '<a class="handover-summary" href="' + handoverLink + '" title="点击查看该批次全部交接记录">' +
          '<div class="handover-title">🤝 最近交接 · ' + formatDateTime(handover.createdAt) + ' →</div>' +
          '<div class="handover-line">' + handover.handedOverBy + ' → ' + handover.receivedBy + '</div>' +
          (handover.keyObservations ? '<div class="handover-line meta">观察：' + handover.keyObservations + '</div>' : '') +
          (handover.pendingAbnormalities ? '<div class="handover-line warn">异常：' + handover.pendingAbnormalities + '</div>' : '') +
          (handover.nextWaterChangeReminder ? '<div class="handover-line water">💧 换水提醒：' + handover.nextWaterChangeReminder + '</div>' : '') +
        '</a>' :
        '<a class="handover-summary empty-handover" href="/handover" title="去创建交接记录">' +
          '<div class="handover-title">🤝 暂无交接记录 · 点击去创建</div>' +
        '</a>';
      return '<article class="card"><h3><a class="card-title-link" href="' + timelineLink + '" title="查看该批次时间轴">' + itemCode + '</a></h3><span class="pill">'+item.status+'</span>'+main+tasks+handoverHtml+'<label>状态</label><select data-status="'+itemCode+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+itemCode+'">追加备注</button>'+reportBtn+'<div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }
    async function load() {
      items = await api('/api/items');
      vats = await api('/api/vats');
      renderForms();
      render();
    }
    createForm.onsubmit = async event => {
      event.preventDefault();
      const formData = Object.fromEntries(new FormData(createForm).entries());
      const vatSelect = createForm.querySelector('[data-vat-select]');
      if (vatSelect && vatSelect.value) {
        const selectedOpt = vatSelect.options[vatSelect.selectedIndex];
        formData.vatId = selectedOpt.dataset.id || '';
      }
      await api('/api/items', { method:'POST', body: JSON.stringify(formData) });
      createForm.reset();
      await load();
    };
    actionForm.onsubmit = async event => { event.preventDefault(); await api('/api/items/'+itemSelect.value+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); actionForm.reset(); await load(); };
    document.querySelector('#statusFilter').onchange = render; document.querySelector('#search').oninput = render; document.querySelector('#reload').onclick = load;
    load();
  </script>
</body>
</html>`;
}
