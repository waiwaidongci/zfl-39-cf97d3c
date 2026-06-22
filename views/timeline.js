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
      <div class="meta">按批次查看建档、观察、状态变更、备注与异常的完整时间线 · <a class="nav-link" href="/batch-import">批量导入观察记录</a> · <a class="nav-link" href="/board">浸泡缸容量与排程看板</a> · <a class="nav-link" href="/">← 返回主页</a></div>
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
    <div class="batch-toolbar" id="batchToolbar" style="display:none"></div>
    <div class="timeline" id="timeline"></div>
  </div>

  <div class="drawer-overlay" id="drawerOverlay"></div>
  <aside class="drawer" id="handoverDrawer" aria-hidden="true">
    <div class="drawer-header">
      <h2 id="drawerTitle">交接历史</h2>
      <div class="drawer-actions">
        <button class="secondary" id="drawerCreateHandover">🤝 新建交接</button>
        <button class="drawer-close" id="drawerClose" aria-label="关闭">×</button>
      </div>
    </div>
    <div class="drawer-body" id="drawerBody">
      <div class="drawer-loading">加载中...</div>
    </div>
  </aside>

  <script>
    let data = { events: [], vats: [], owners: [] };
    let pendingFilter = { code: '', vat: '', owner: '' };
    let currentDrawerBatchCode = null;
    let itemsCache = [];

    const drawer = document.getElementById('handoverDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawerClose = document.getElementById('drawerClose');
    const drawerBody = document.getElementById('drawerBody');
    const drawerTitle = document.getElementById('drawerTitle');
    const drawerCreateHandover = document.getElementById('drawerCreateHandover');

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }

    async function loadItemsCache() {
      try {
        itemsCache = await api('/api/items');
      } catch (e) {
        itemsCache = [];
      }
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

    function formatDateTime(isoStr) {
      return formatTime(isoStr);
    }

    function formatDateOnly(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    function getWaterChangeStatus(dateStr) {
      if (!dateStr) return { cls: '', label: '' };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      target.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { cls: 'water-overdue', label: '已逾期 ' + Math.abs(diffDays) + ' 天' };
      if (diffDays === 0) return { cls: 'water-today', label: '今天需要换水' };
      if (diffDays <= 2) return { cls: 'water-soon', label: '还有 ' + diffDays + ' 天' };
      return { cls: 'water-ok', label: '还有 ' + diffDays + ' 天' };
    }

    async function loadTimeline() {
      const code = pendingFilter.code || document.getElementById('fCode').value.trim();
      const vat = pendingFilter.vat || document.getElementById('fVat').value;
      const owner = pendingFilter.owner || document.getElementById('fOwner').value;
      const params = new URLSearchParams();
      if (code) params.set('code', code);
      if (vat) params.set('vat', vat);
      if (owner) params.set('owner', owner);
      pendingFilter = { code: '', vat: '', owner: '' };
      const res = await fetch('/api/timeline?' + params.toString());
      data = await res.json();
      renderFilters(code, vat, owner);
      render();
    }

    function renderFilters(presetCode, presetVat, presetOwner) {
      const vatSel = document.getElementById('fVat');
      vatSel.innerHTML = '<option value="">全部</option>' + data.vats.map(v => '<option value="'+v+'" '+(v===presetVat?'selected':'')+'>'+v+'</option>').join('');
      const ownerSel = document.getElementById('fOwner');
      ownerSel.innerHTML = '<option value="">全部</option>' + data.owners.map(o => '<option value="'+o+'" '+(o===presetOwner?'selected':'')+'>'+o+'</option>').join('');
      if (presetCode) document.getElementById('fCode').value = presetCode;
    }

    function openHandoverDrawer(batchCode) {
      currentDrawerBatchCode = batchCode;
      drawerTitle.textContent = '交接历史 · ' + batchCode;
      drawerBody.innerHTML = '<div class="drawer-loading">加载中...</div>';
      drawer.classList.add('open');
      drawerOverlay.classList.add('show');
      drawer.setAttribute('aria-hidden', 'false');
      drawerCreateHandover.onclick = () => {
        window.location.href = '/handover?batchCode=' + encodeURIComponent(batchCode) + '&autoSelect=1';
      };
      loadDrawerContent(batchCode);
    }

    function closeHandoverDrawer() {
      drawer.classList.remove('open');
      drawerOverlay.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      currentDrawerBatchCode = null;
    }

    async function loadDrawerContent(batchCode) {
      try {
        const details = await api('/api/items/' + encodeURIComponent(batchCode) + '/handover-details');
        renderDrawerContent(details);
      } catch (err) {
        drawerBody.innerHTML = '<div class="drawer-error">加载失败：' + err.message + '</div>';
      }
    }

    function renderDrawerContent(details) {
      const { batch, handovers, pendingAbnormalitiesList, latestWaterChangeReminder, latestAbnormalObservations, handoverCount, lastHandoverAt } = details;
      const waterStatus = getWaterChangeStatus(latestWaterChangeReminder);
      const batchInfoHtml = '<div class="drawer-section">' +
        '<div class="drawer-section-title">📦 批次信息</div>' +
        '<div class="batch-info-grid">' +
          '<div><b>编号：</b>' + batch.code + '</div>' +
          '<div><b>原料：</b>' + (batch.source || '-') + '</div>' +
          '<div><b>缸：</b>' + (batch.vat || '-') + '</div>' +
          '<div><b>负责人：</b>' + (batch.owner || '-') + '</div>' +
          '<div><b>状态：</b><span class="pill">' + batch.status + '</span></div>' +
          '<div><b>发酵天数：</b>' + (batch.days || 0) + ' / ' + (batch.expectedDays || 0) + ' 天</div>' +
        '</div>' +
      '</div>';
      const waterHtml = '<div class="drawer-section">' +
        '<div class="drawer-section-title">💧 下次换水提醒</div>' +
        (latestWaterChangeReminder ?
          '<div class="water-reminder ' + waterStatus.cls + '">' +
            '<div class="water-date">📅 ' + latestWaterChangeReminder + '</div>' +
            '<div class="water-status">' + waterStatus.label + '</div>' +
          '</div>' :
          '<div class="empty-inline">暂无换水提醒</div>'
        ) +
      '</div>';
      const pendingHtml = '<div class="drawer-section">' +
        '<div class="drawer-section-title">⚠️ 待处理异常 ' + (pendingAbnormalitiesList.length > 0 ? '<span class="badge badge-warn">' + pendingAbnormalitiesList.length + '</span>' : '') + '</div>' +
        (pendingAbnormalitiesList.length > 0 ?
          '<div class="pending-list">' +
            pendingAbnormalitiesList.map(p =>
              '<div class="pending-item">' +
                '<div class="pending-head"><span class="pending-who">' + p.handedOverBy + ' → ' + p.receivedBy + '</span><span class="pending-when">' + formatDateTime(p.createdAt) + '</span></div>' +
                '<div class="pending-content">' + p.content + '</div>' +
              '</div>'
            ).join('') +
          '</div>' :
          '<div class="empty-inline">暂无待处理异常</div>'
        ) +
      '</div>';
      const obsHtml = latestAbnormalObservations && latestAbnormalObservations.length > 0 ?
        ('<div class="drawer-section">' +
          '<div class="drawer-section-title">🔴 最近异常观察记录</div>' +
          '<div class="obs-list">' +
            latestAbnormalObservations.map(o =>
              '<div class="obs-item warn">' +
                '<div class="obs-head">' + formatDateTime(o.at) + '</div>' +
                '<div class="obs-body">' +
                  (o.temperature ? '温度:' + o.temperature + '℃ ' : '') +
                  (o.smell ? '气味:' + o.smell + ' ' : '') +
                  (o.fiber ? '纤维:' + o.fiber + ' ' : '') +
                  (o.abnormalNote ? '<br><b>异常备注:</b> ' + o.abnormalNote : '') +
                '</div>' +
              '</div>'
            ).join('') +
          '</div>' +
        '</div>') : '';
      const handoversHtml = '<div class="drawer-section">' +
        '<div class="drawer-section-title">📋 全部交接记录 <span class="badge">' + handoverCount + ' 条</span>' +
          (lastHandoverAt ? '<span class="drawer-section-sub"> 最近：' + formatDateTime(lastHandoverAt) + '</span>' : '') +
        '</div>' +
        (handovers.length > 0 ?
          '<div class="handover-history-list">' +
            handovers.map((h, idx) =>
              '<div class="handover-history-item">' +
                '<div class="hhi-head">' +
                  '<span class="hhi-index">#' + (handovers.length - idx) + '</span>' +
                  '<span class="hhi-time">' + formatDateTime(h.createdAt) + '</span>' +
                  '<span class="hhi-arrow">' + h.handedOverBy + ' → ' + h.receivedBy + '</span>' +
                '</div>' +
                (h.keyObservations ? '<div class="hhi-row"><b>观察：</b><span>' + h.keyObservations + '</span></div>' : '') +
                (h.pendingAbnormalities ? '<div class="hhi-row warn"><b>异常：</b><span>' + h.pendingAbnormalities + '</span></div>' : '') +
                (h.nextWaterChangeReminder ? '<div class="hhi-row water"><b>换水提醒：</b><span>' + h.nextWaterChangeReminder + '</span></div>' : '') +
                (h.note ? '<div class="hhi-row"><b>备注：</b><span>' + h.note + '</span></div>' : '') +
              '</div>'
            ).join('') +
          '</div>' :
          '<div class="empty-inline">暂无交接记录，点击右上角"新建交接"按钮创建</div>'
        ) +
      '</div>';
      drawerBody.innerHTML = batchInfoHtml + waterHtml + pendingHtml + obsHtml + handoversHtml;
    }

    function getBatchInfo(code) {
      if (!itemsCache || itemsCache.length === 0) return null;
      return itemsCache.find(b => b.code === code || b.id === code) || null;
    }

    function render() {
      const events = data.events;
      const total = events.length;
      const abnormalCount = events.filter(e => e.abnormal).length;
      const batches = new Set(events.map(e => e.code)).size;
      const uniqueBatchCodes = [...new Set(events.map(e => e.code))];

      document.getElementById('summary').innerHTML =
        '<div class="chip"><strong>'+batches+'</strong>涉及批次</div>' +
        '<div class="chip"><strong>'+total+'</strong>时间线事件</div>' +
        '<div class="chip warn-chip"><strong>'+abnormalCount+'</strong>异常事件</div>';

      const toolbar = document.getElementById('batchToolbar');
      if (uniqueBatchCodes.length > 0) {
        let toolbarHtml = '<div class="batches-bar">';
        toolbarHtml += '<span class="batches-label">涉及批次：</span>';
        uniqueBatchCodes.forEach(code => {
          const info = getBatchInfo(code);
          const status = info ? info.status : '';
          const statusCls = status ? 'batch-tag-' + status : '';
          toolbarHtml += '<a class="batch-tag ' + statusCls + '" href="javascript:void(0)" data-open-handover="' + code + '" title="点击查看该批次交接历史">' +
            '<span class="bt-code">' + code + '</span>' +
            (status ? '<span class="bt-status">' + status + '</span>' : '') +
            '<span class="bt-handover-icon">🤝</span>' +
          '</a>';
        });
        toolbarHtml += '</div>';
        toolbar.innerHTML = toolbarHtml;
        toolbar.style.display = 'block';

        toolbar.querySelectorAll('[data-open-handover]').forEach(btn => {
          btn.onclick = (e) => {
            e.preventDefault();
            openHandoverDrawer(btn.dataset.openHandover);
          };
        });
      } else {
        toolbar.style.display = 'none';
      }

      if (total === 0) {
        document.getElementById('timeline').innerHTML = '<div class="empty">暂无匹配的时间线事件，请调整筛选条件</div>';
        return;
      }

      document.getElementById('timeline').innerHTML = events.map(ev => {
        const isAbnormal = ev.abnormal;
        const isObs = ev.type === 'observation';
        const isHandover = ev.type === 'handover';
        const cls = ['tl-event'];
        if (isAbnormal) cls.push('abnormal');
        if (isObs) cls.push('observation');
        if (isHandover) cls.push('handover');

        let badges = '';
        if (isAbnormal) badges += '<span class="tl-badge abnormal-badge">异常</span>';
        if (isObs) badges += '<span class="tl-badge obs-badge">观察</span>';
        if (isHandover) badges += '<span class="tl-badge handover-badge">交接</span>';

        let detailHtml = '';
        if (isHandover) {
          detailHtml = '<div class="handover-detail">';
          detailHtml += '<div class="hd-row"><b>交出人：</b><span>' + (ev.handedOverBy || '-') + '</span> <b>接收人：</b><span>' + (ev.receivedBy || '-') + '</span></div>';
          if (ev.keyObservations) detailHtml += '<div class="hd-row"><b>重点观察：</b><span>' + ev.keyObservations + '</span></div>';
          if (ev.pendingAbnormalities) detailHtml += '<div class="hd-row warn"><b>未处理异常：</b><span>' + ev.pendingAbnormalities + '</span></div>';
          if (ev.nextWaterChangeReminder) detailHtml += '<div class="hd-row water"><b>换水提醒：</b><span>' + ev.nextWaterChangeReminder + '</span></div>';
          detailHtml += '</div>';
        }

        const batchInfo = getBatchInfo(ev.code);
        const handoverBtn = '<a class="tl-handover-btn" href="javascript:void(0)" data-open-handover="' + ev.code + '" title="查看' + ev.code + '的交接历史">🤝 交接历史</a>';

        const batchLink = '<a class="tl-batch-link" href="/?code=' + encodeURIComponent(ev.code) + '#openDrawer=' + encodeURIComponent(ev.code) + '" title="在主页打开抽屉">' + ev.code + '</a>';

        return '<div class="'+cls.join(' ')+'">' +
          '<div class="tl-dot"></div>' +
          '<div class="tl-card">' +
            '<div class="tl-head"><span class="tl-step">'+ev.step+badges+'</span><span class="tl-time">'+formatTime(ev.at)+'</span></div>' +
            '<div class="tl-batch"><span>'+batchLink+'</span> 缸: '+(ev.vat||'-')+' · 负责人: '+(ev.owner||'-')+' ' + handoverBtn + '</div>' +
            '<div class="tl-note">'+ev.note+'</div>' +
            detailHtml +
          '</div>' +
        '</div>';
      }).join('');

      document.querySelectorAll('[data-open-handover]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openHandoverDrawer(btn.dataset.openHandover);
        };
      });
    }

    document.getElementById('btnFilter').onclick = loadTimeline;
    document.getElementById('btnReset').onclick = () => {
      document.getElementById('fCode').value = '';
      document.getElementById('fVat').value = '';
      document.getElementById('fOwner').value = '';
      window.history.pushState({}, '', '/timeline');
      loadTimeline();
    };
    document.getElementById('fCode').onkeydown = (e) => { if (e.key === 'Enter') loadTimeline(); };

    drawerClose.onclick = closeHandoverDrawer;
    drawerOverlay.onclick = closeHandoverDrawer;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        closeHandoverDrawer();
      }
    });

    function applyUrlFilters() {
      const params = new URLSearchParams(window.location.search);
      pendingFilter = {
        code: params.get('code') || '',
        vat: params.get('vat') || '',
        owner: params.get('owner') || '',
      };
      return Promise.all([loadTimeline(), loadItemsCache()]);
    }

    applyUrlFilters();
  </script>
</body>
</html>`;
}
