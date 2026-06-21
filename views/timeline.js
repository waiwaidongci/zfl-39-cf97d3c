export function timelinePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>批次时间轴与异常复盘</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --warn-bg:#fdf0ed; --warn-border:#e8a598; --obs-bg:#f0f5ee; --obs-border:#b5c9ab; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
    h1 { margin:0; font-size:24px; }
    .nav-link { color:var(--accent); text-decoration:none; font-size:14px; }
    .meta { color:var(--muted); font-size:13px; }
    .content { padding:22px 28px; max-width:960px; margin:0 auto; }

    .filters { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    .filters label { display:block; margin:0 0 4px; color:var(--muted); font-size:12px; }
    .filters input, .filters select { width:180px; border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; background:#fff; }
    .filters button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:8px 16px; font-weight:700; cursor:pointer; align-self:flex-end; }
    .filters button.reset { background:#69736a; }

    .summary { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
    .summary .chip { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:10px 16px; font-size:14px; }
    .summary .chip strong { font-size:20px; display:block; margin-bottom:2px; }
    .summary .chip.warn-chip { border-color:var(--warn-border); background:var(--warn-bg); }
    .summary .chip.warn-chip strong { color:var(--warn); }

    .timeline { position:relative; padding-left:32px; }
    .timeline::before { content:''; position:absolute; left:11px; top:0; bottom:0; width:2px; background:var(--line); }
    .tl-event { position:relative; margin-bottom:18px; }
    .tl-dot { position:absolute; left:-27px; top:6px; width:14px; height:14px; border-radius:50%; background:var(--accent); border:2px solid #fff; box-shadow:0 0 0 2px var(--accent); }
    .tl-event.abnormal .tl-dot { background:var(--warn); box-shadow:0 0 0 2px var(--warn); }
    .tl-card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
    .tl-event.abnormal .tl-card { border-color:var(--warn-border); background:var(--warn-bg); }
    .tl-event.observation .tl-card { border-left:3px solid var(--obs-border); }
    .tl-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
    .tl-step { font-weight:700; font-size:15px; }
    .tl-event.abnormal .tl-step { color:var(--warn); }
    .tl-time { color:var(--muted); font-size:12px; white-space:nowrap; }
    .tl-batch { font-size:12px; color:var(--muted); }
    .tl-batch span { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 7px; margin-right:4px; background:#f6f8f4; }
    .tl-note { font-size:14px; line-height:1.5; }
    .tl-badge { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; margin-left:6px; vertical-align:middle; }
    .tl-badge.abnormal-badge { background:var(--warn); color:#fff; }
    .tl-badge.obs-badge { background:var(--obs-border); color:var(--ink); }

    .empty { text-align:center; color:var(--muted); padding:60px 20px; font-size:15px; }

    @media (max-width:700px) {
      .content { padding:16px; }
      .filters input, .filters select { width:100%; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>批次时间轴与异常复盘</h1>
      <div class="meta">按批次查看建档、观察、状态变更、备注与异常的完整时间线 · <a class="nav-link" href="/">← 返回主页</a></div>
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
