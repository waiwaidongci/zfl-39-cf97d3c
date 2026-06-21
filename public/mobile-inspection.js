const smellOptions = ["正常酸味", "轻微异味", "浓烈酸味", "腐烂味", "其他"];
const fiberOptions = ["松散", "较松散", "一般", "较紧实", "紧实结块"];
const STORAGE_KEYS = {
  batches: "zfl_mobile_batches",
  pending: "zfl_mobile_pending",
};

let activeBatches = [];
let selectedBatch = null;
let pendingRecords = [];
let isOnline = navigator.onLine;

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

function showToast(message, type) {
  type = type || 'info';
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = 'toast toast-' + type;
  setTimeout(function() { toast.classList.add('toast-hidden'); }, 2500);
}

function updateNetworkStatus() {
  isOnline = navigator.onLine;
  const status = $('#network-status');
  const text = $('#network-text');
  if (isOnline) {
    status.className = 'network-online';
    text.textContent = '在线';
  } else {
    status.className = 'network-offline';
    text.textContent = '离线';
  }
  updateSyncBanner();
}

function saveBatchesToLocal(batches) {
  try {
    localStorage.setItem(STORAGE_KEYS.batches, JSON.stringify({
      data: batches,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('缓存批次列表失败', e);
  }
}

function loadBatchesFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.batches);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.data || [];
    }
  } catch (e) {}
  return [];
}

function savePendingToLocal() {
  try {
    localStorage.setItem(STORAGE_KEYS.pending, JSON.stringify(pendingRecords));
  } catch (e) {
    console.warn('保存待同步记录失败', e);
    showToast('本地存储失败，请检查存储空间', 'error');
  }
}

function loadPendingFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pending);
    if (raw) {
      pendingRecords = JSON.parse(raw) || [];
    }
  } catch (e) {
    pendingRecords = [];
  }
}

async function loadBatches() {
  const meta = $('#batch-list-meta');
  try {
    if (!isOnline) {
      activeBatches = loadBatchesFromLocal();
      meta.textContent = activeBatches.length
        ? '离线模式 · 显示本地缓存的 ' + activeBatches.length + ' 个批次'
        : '离线模式 · 本地无缓存数据，请先联网加载';
      renderBatchList();
      return;
    }
    activeBatches = await api('/api/items/active');
    saveBatchesToLocal(activeBatches);
    const ts = new Date();
    meta.textContent = '已加载 ' + activeBatches.length + ' 个活跃批次 · 更新于 ' + ts.toLocaleTimeString();
    renderBatchList();
  } catch (err) {
    activeBatches = loadBatchesFromLocal();
    meta.textContent = '加载失败，显示本地缓存 · ' + activeBatches.length + ' 个批次';
    renderBatchList();
    showToast('加载批次失败: ' + err.message, 'error');
  }
}

function renderBatchList() {
  const list = $('#batch-list');
  if (activeBatches.length === 0) {
    list.innerHTML = '<div class="empty-hint">暂无活跃批次</div>';
    return;
  }
  list.innerHTML = activeBatches.map(function(batch) {
    const days = batch.days || 0;
    const expected = batch.expectedDays || 7;
    const progress = Math.min(100, Math.round((days / expected) * 100));
    const statusClass = 'status-' + (batch.status || '').replace(/\s/g, '-');
    const selected = selectedBatch && (selectedBatch.id === batch.id || selectedBatch.code === batch.code);
    return '<div class="batch-card ' + (selected ? 'batch-selected' : '') + '" data-id="' + batch.id + '" data-code="' + batch.code + '">' +
      '<div class="batch-header">' +
        '<span class="batch-code">' + (batch.code || batch.id) + '</span>' +
        '<span class="status-pill ' + statusClass + '">' + (batch.status || '未知') + '</span>' +
      '</div>' +
      '<div class="batch-source">' + (batch.source || '') + ' · ' + (batch.vat || '') + '</div>' +
      '<div class="batch-progress">' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
        '<span class="progress-text">' + days + '/' + expected + '天</span>' +
      '</div>' +
    '</div>';
  }).join('');
  $$('#batch-list .batch-card').forEach(function(card) {
    card.onclick = function() { selectBatch(card.dataset.id || card.dataset.code); };
  });
}

function selectBatch(identifier) {
  selectedBatch = activeBatches.find(function(b) { return b.id === identifier || b.code === identifier; });
  if (!selectedBatch) return;
  renderBatchList();
  $('#form-section').style.display = 'block';
  $('#selected-batch-name').textContent = (selectedBatch.code || selectedBatch.id) + ' · ' + (selectedBatch.source || '');
  $('#selected-batch-meta').textContent = (selectedBatch.vat || '') + ' · 负责人: ' + (selectedBatch.owner || '未指定') + ' · 状态: ' + (selectedBatch.status || '');
  $('#inspection-form').reset();
  var tempInput = document.querySelector('[name="temperature"]');
  if (tempInput) tempInput.focus();
}

function cancelSelection() {
  selectedBatch = null;
  renderBatchList();
  $('#form-section').style.display = 'none';
}

function collectFormData() {
  const form = $('#inspection-form');
  const fd = new FormData(form);
  const data = {};
  for (const pair of fd.entries()) {
    data[pair[0]] = pair[1];
  }
  return data;
}

function submitInspection(event) {
  event.preventDefault();
  if (!selectedBatch) {
    showToast('请先选择批次', 'error');
    return;
  }
  const data = collectFormData();
  if (!data.temperature && !data.smell && !data.fiber && !data.changedWater && !data.abnormal) {
    showToast('请至少填写一项观察内容', 'warning');
    return;
  }
  const record = {
    localId: 'REC_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    itemId: selectedBatch.id,
    itemCode: selectedBatch.code,
    temperature: data.temperature || '',
    smell: data.smell || '',
    fiber: data.fiber || '',
    changedWater: data.changedWater || '',
    abnormal: data.abnormal || '否',
    abnormalNote: data.abnormalNote || '',
    at: new Date().toISOString(),
    savedAt: Date.now(),
    synced: false,
  };
  pendingRecords.push(record);
  savePendingToLocal();
  updateSyncBanner();
  renderPendingList();
  $('#inspection-form').reset();
  showToast('已保存到本地待同步', 'success');
  if (isOnline) {
    setTimeout(function() { syncRecords(); }, 300);
  }
}

function updateSyncBanner() {
  const banner = $('#sync-banner');
  const countEl = $('#pending-count');
  const pendingUnsynced = pendingRecords.filter(function(r) { return !r.synced; }).length;
  countEl.textContent = pendingUnsynced;
  if (pendingUnsynced > 0) {
    banner.classList.remove('sync-hidden');
    const syncBtn = $('#sync-btn');
    if (isOnline) {
      syncBtn.textContent = pendingUnsynced + '条待同步 · 点击同步';
      syncBtn.disabled = false;
    } else {
      syncBtn.textContent = '离线，恢复网络后可同步';
      syncBtn.disabled = true;
    }
  } else {
    banner.classList.add('sync-hidden');
  }
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
  } catch (e) { return ''; }
}

function renderPendingList() {
  const list = $('#pending-list');
  if (pendingRecords.length === 0) {
    list.innerHTML = '<div class="empty-hint">暂无待同步记录</div>';
    $('#clear-pending').style.display = 'none';
    return;
  }
  $('#clear-pending').style.display = 'block';
  list.innerHTML = pendingRecords.map(function(r, idx) {
    const isAbnormal = r.abnormal === '是';
    var fieldsHtml = '';
    if (r.temperature) fieldsHtml += '<span>温度 ' + r.temperature + '℃</span>';
    if (r.smell) fieldsHtml += '<span>' + r.smell + '</span>';
    if (r.fiber) fieldsHtml += '<span>' + r.fiber + '</span>';
    if (r.changedWater) fieldsHtml += '<span>' + r.changedWater + '</span>';
    if (isAbnormal) fieldsHtml += '<span class="warn">异常: ' + (r.abnormalNote || '有') + '</span>';
    var deleteBtn = r.synced ? '' : '<button class="pending-delete" data-idx="' + idx + '">删除</button>';
    return '<div class="pending-card ' + (r.synced ? 'pending-synced' : '') + '">' +
      '<div class="pending-header">' +
        '<span class="pending-batch">' + (r.itemCode || r.itemId) + '</span>' +
        '<span class="pending-status ' + (r.synced ? 'status-synced' : 'status-pending') + '">' + (r.synced ? '已同步' : '待同步') + '</span>' +
      '</div>' +
      '<div class="pending-time">' + formatTime(r.savedAt) + '</div>' +
      '<div class="pending-fields">' + fieldsHtml + '</div>' +
      deleteBtn +
    '</div>';
  }).join('');
  $$('.pending-delete').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      if (confirm('确定删除这条待同步记录吗？')) {
        pendingRecords.splice(idx, 1);
        savePendingToLocal();
        updateSyncBanner();
        renderPendingList();
      }
    };
  });
}

async function syncRecords() {
  const unsynced = pendingRecords.filter(function(r) { return !r.synced; });
  if (unsynced.length === 0) {
    showToast('没有需要同步的记录', 'info');
    return;
  }
  if (!isOnline) {
    showToast('当前处于离线状态，无法同步', 'error');
    return;
  }
  const syncBtn = $('#sync-btn');
  syncBtn.disabled = true;
  syncBtn.textContent = '同步中...';
  try {
    const result = await api('/api/inspections/batch', {
      method: 'POST',
      body: JSON.stringify({ inspections: unsynced })
    });
    for (const s of result.success) {
      for (let i = 0; i < pendingRecords.length; i++) {
        const r = pendingRecords[i];
        if (!r.synced && (r.itemCode === s.itemCode || r.itemId === s.itemId)) {
          r.synced = true;
          r.syncedAt = Date.now();
          break;
        }
      }
    }
    pendingRecords = pendingRecords.filter(function(r) { return !r.synced; });
    savePendingToLocal();
    updateSyncBanner();
    renderPendingList();
    if (result.failed && result.failed.length > 0) {
      showToast('同步完成: 成功' + result.successCount + '条, 失败' + result.failedCount + '条', 'warning');
    } else {
      showToast('同步成功 ' + result.successCount + ' 条记录', 'success');
    }
    await loadBatches();
  } catch (err) {
    showToast('同步失败: ' + err.message, 'error');
  } finally {
    updateSyncBanner();
  }
}

function clearPending() {
  if (pendingRecords.length === 0) return;
  if (!confirm('确定清空所有待同步记录吗？此操作不可撤销')) return;
  pendingRecords = [];
  savePendingToLocal();
  updateSyncBanner();
  renderPendingList();
}

window.addEventListener('online', function() {
  updateNetworkStatus();
  if (pendingRecords.some(function(r) { return !r.synced; })) {
    showToast('网络已恢复，点击同步按钮上传记录', 'info');
  }
});
window.addEventListener('offline', function() {
  updateNetworkStatus();
  showToast('网络已断开，记录将保存到本地', 'warning');
});

document.addEventListener('DOMContentLoaded', function() {
  $('#refresh-batches').onclick = loadBatches;
  $('#cancel-btn').onclick = cancelSelection;
  $('#inspection-form').onsubmit = submitInspection;
  $('#sync-btn').onclick = syncRecords;
  $('#clear-pending').onclick = clearPending;

  updateNetworkStatus();
  loadPendingFromLocal();
  loadBatches();
  updateSyncBanner();
  renderPendingList();
});
