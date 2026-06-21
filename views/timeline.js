export function timelinePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>批次时间轴与异常复盘</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/timeline.css">
</head>
<body>
  <header>
    <div>
      <h1>批次时间轴与异常复盘</h1>
      <div class="meta">按批次查看建档、观察、状态变更、备注与异常的完整时间线 · <a class="nav-link" href="/board">浸泡缸容量与排程看板</a> · <a class="nav-link" href="/">← 返回主页</a></div>
    </div>
  </header>
  <div class="content">
    <div class="filters" id="filters">
      <div><label>批次编号</label><input id="fCode" placeholder="搜索批次编号"></div>
      <div><label>浸泡缸</label><select id="fVat"><option value="">全部</option></select></div>
      <div><label>负责人</label><select id="fOwner"><option value="">全部</option></select></div>
      <button id="btnFilter">筛选</button>
      <button class="reset" id="btnReset">重置</button>
    </div>
    <div class="summary" id="summary"></div>
    <div class="timeline" id="timeline"></div>
  </div>
  <script>
    let data = { events: [], vats: [], owners: [] };

    async function loadTimeline() {
      const code = document.getElementById('fCode').value.trim();
      const vat = document.getElementById('fVat').value;
      const owner = document.getElementById('fOwner').value;
      const params = new URLSearchParams();
      if (code) params.set('code', code);
      if (vat) params.set('vat', vat);
      if (owner) params.set('owner', owner);
      const res = await fetch('/api/timeline?' + params.toString());
      data = await res.json();
      renderFilters();
      render();
    }

    function renderFilters() {
      const vatSel = document.getElementById('fVat');
      const curVat = vatSel.value;
      vatSel.innerHTML = '<option value="">全部</option>' + data.vats.map(v => '<option value="'+v+'" '+(v===curVat?'selected':'')+'>'+v+'</option>').join('');
      const ownerSel = document.getElementById('fOwner');
      const curOwner = ownerSel.value;
      ownerSel.innerHTML = '<option value="">全部</option>' + data.owners.map(o => '<option value="'+o+'" '+(o===curOwner?'selected':'')+'>'+o+'</option>').join('');
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
      return y+'-'+m+'-'+day+' '+h+':'+min;
    }

    function render() {
      const events = data.events;
      const total = events.length;
      const abnormalCount = events.filter(e => e.abnormal).length;
      const batches = new Set(events.map(e => e.code)).size;

      document.getElementById('summary').innerHTML =
        '<div class="chip"><strong>'+batches+'</strong>涉及批次</div>' +
        '<div class="chip"><strong>'+total+'</strong>时间线事件</div>' +
        '<div class="chip warn-chip"><strong>'+abnormalCount+'</strong>异常事件</div>';

      if (total === 0) {
        document.getElementById('timeline').innerHTML = '<div class="empty">暂无匹配的时间线事件，请调整筛选条件</div>';
        return;
      }

      document.getElementById('timeline').innerHTML = events.map(ev => {
        const isAbnormal = ev.abnormal;
        const isObs = ev.type === 'observation';
        const cls = ['tl-event'];
        if (isAbnormal) cls.push('abnormal');
        if (isObs) cls.push('observation');

        let badges = '';
        if (isAbnormal) badges += '<span class="tl-badge abnormal-badge">异常</span>';
        if (isObs) badges += '<span class="tl-badge obs-badge">观察</span>';

        return '<div class="'+cls.join(' ')+'">' +
          '<div class="tl-dot"></div>' +
          '<div class="tl-card">' +
            '<div class="tl-head"><span class="tl-step">'+ev.step+badges+'</span><span class="tl-time">'+formatTime(ev.at)+'</span></div>' +
            '<div class="tl-batch"><span>'+ev.code+'</span> 缸: '+(ev.vat||'-')+' · 负责人: '+(ev.owner||'-')+'</div>' +
            '<div class="tl-note">'+ev.note+'</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    document.getElementById('btnFilter').onclick = loadTimeline;
    document.getElementById('btnReset').onclick = () => {
      document.getElementById('fCode').value = '';
      document.getElementById('fVat').value = '';
      document.getElementById('fOwner').value = '';
      loadTimeline();
    };
    document.getElementById('fCode').onkeydown = (e) => { if (e.key === 'Enter') loadTimeline(); };

    loadTimeline();
  </script>
</body>
</html>`;
}
