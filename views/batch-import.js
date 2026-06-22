import { extraFields } from "../lib/db.js";

export function batchImportPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>观察记录批量导入预检</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/batch-import.css">
</head>
<body>
  <header>
    <div>
      <h1>观察记录批量导入预检</h1>
      <div class="meta">从CSV文件或粘贴文本批量导入每日观察记录，导入前可预览字段识别、批次匹配和异常预警 · <a class="nav-link" href="/">← 返回主页</a> · <a class="nav-link" href="/board">浸泡缸看板</a> · <a class="nav-link" href="/timeline">时间轴</a></div>
    </div>
    <button id="reload">刷新</button>
  </header>

  <div class="content">
    <div class="import-section">
      <div class="panel">
        <h2>导入数据</h2>
        <div class="import-tabs">
          <button class="tab-btn active" data-tab="paste">粘贴文本</button>
          <button class="tab-btn" data-tab="file">CSV文件</button>
        </div>
        <div id="pasteTab" class="tab-content active">
          <label>粘贴CSV格式文本（第一行为表头）</label>
          <textarea id="pasteText" placeholder="批次编号,温度,气味,纤维松散度,是否换水,异常
PF-001,25.1,微酸,松散,是,否
PF-002,26.3,酸香,适中,否,否
PF-003,24.8,霉味,结块,否,是"></textarea>
          <div class="hint">支持字段：批次编号、温度、气味、纤维松散度、是否换水、异常、日期</div>
        </div>
        <div id="fileTab" class="tab-content">
          <label>选择CSV文件</label>
          <input type="file" id="fileInput" accept=".csv,.txt">
          <div class="hint">文件编码建议使用UTF-8，第一行为表头</div>
        </div>
        <div class="import-actions">
          <button id="previewBtn" class="primary">预览导入结果</button>
          <button id="clearBtn" class="secondary">清空</button>
        </div>
      </div>

      <div class="panel" id="fieldPanel" style="display:none">
        <h2>字段识别结果</h2>
        <div id="fieldDetect"></div>
      </div>
    </div>

    <div class="preview-section" id="previewSection" style="display:none">
      <div class="stats-bar" id="statsBar"></div>

      <div class="preview-panels">
        <div class="panel corrected-panel" id="correctedPanel" style="display:none">
          <h2>🔧 可自动修正项 <span class="count-badge corrected" id="correctedCount">0</span></h2>
          <div class="table-wrapper">
            <table id="correctedTable">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>字段</th>
                  <th>原始值</th>
                  <th>修正后</th>
                  <th>修正说明</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <div class="correction-hint">以上字段将在确认导入时自动按修正后的值写入</div>
        </div>

        <div class="panel matched-panel">
          <h2>匹配成功的记录 <span class="count-badge" id="matchedCount">0</span></h2>
          <div class="table-wrapper">
            <table id="matchedTable">
              <thead>
                <tr>
                  <th>修正</th>
                  <th>批次编号</th>
                  <th>原料/缸</th>
                  <th>当前状态</th>
                  <th>温度</th>
                  <th>气味</th>
                  <th>纤维</th>
                  <th>换水</th>
                  <th>异常</th>
                  <th>导入后状态</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="panel warn-panel" id="unmatchedPanel" style="display:none">
          <h2>无法匹配的记录 <span class="count-badge warn" id="unmatchedCount">0</span></h2>
          <div class="table-wrapper">
            <table id="unmatchedTable">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>原始内容</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <div class="panel abnormal-panel" id="abnormalPanel" style="display:none">
          <h2>⚠️ 可能触发异常状态 <span class="count-badge warn" id="abnormalCount">0</span></h2>
          <div class="table-wrapper">
            <table id="abnormalTable">
              <thead>
                <tr>
                  <th>批次编号</th>
                  <th>原料/缸</th>
                  <th>当前状态</th>
                  <th>异常描述</th>
                  <th>导入后状态</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="confirm-section">
        <button id="confirmBtn" class="primary large">确认导入以上 <span id="confirmCount">0</span> 条记录</button>
        <button id="cancelBtn" class="secondary">取消</button>
      </div>
    </div>

    <div class="result-section" id="resultSection" style="display:none">
      <div class="panel result-panel">
        <h2>导入结果</h2>
        <div id="resultStats"></div>
        <div class="table-wrapper" id="resultTableWrap" style="display:none">
          <table id="resultTable">
            <thead>
              <tr>
                <th>批次编号</th>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="result-actions">
          <button id="continueBtn" class="primary">继续导入</button>
          <button id="backHomeBtn" class="secondary">返回主页</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentPreview = null;
    let currentTab = 'paste';

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }

    function initTabs() {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
          currentTab = btn.dataset.tab;
        };
      });
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
      });
    }

    async function getImportText() {
      if (currentTab === 'paste') {
        return document.getElementById('pasteText').value;
      } else {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput.files || fileInput.files.length === 0) {
          throw new Error('请先选择CSV文件');
        }
        return await readFileAsText(fileInput.files[0]);
      }
    }

    async function doPreview() {
      try {
        const text = await getImportText();
        if (!text.trim()) {
          alert('请输入或选择要导入的数据');
          return;
        }
        const result = await api('/api/import/preview', {
          method: 'POST',
          body: JSON.stringify({ text })
        });
        currentPreview = result.preview;
        renderPreview(result);
      } catch (err) {
        alert('预览失败：' + err.message);
      }
    }

    function renderFieldDetect(parsed) {
      const panel = document.getElementById('fieldPanel');
      panel.style.display = 'block';

      const fields = parsed.detectedFields || [];
      const fieldLabels = {
        code: '批次编号',
        temperature: '温度',
        smell: '气味',
        fiber: '纤维松散度',
        changedWater: '是否换水',
        abnormal: '异常',
        at: '日期'
      };

      const html = '<div class="field-chips">' +
        fields.map(f => '<span class="field-chip ok">' + (fieldLabels[f] || f) + '</span>').join('') +
        '</div>' +
        '<div class="field-summary">识别到 ' + fields.length + ' 个字段，共 ' + parsed.rowCount + ' 行数据</div>';

      document.getElementById('fieldDetect').innerHTML = html;
    }

    function renderPreview(result) {
      const { parsed, preview } = result;

      renderFieldDetect(parsed);

      document.getElementById('previewSection').style.display = 'block';
      document.getElementById('resultSection').style.display = 'none';

      const statsBar = document.getElementById('statsBar');
      statsBar.innerHTML =
        '<div class="stat-chip"><span>总行数</span><strong>' + preview.totalRows + '</strong></div>' +
        '<div class="stat-chip corrected"><span>自动修正</span><strong>' + (preview.correctedCount || 0) + '</strong></div>' +
        '<div class="stat-chip ok"><span>匹配成功</span><strong>' + preview.matchedCount + '</strong></div>' +
        '<div class="stat-chip warn"><span>无法匹配</span><strong>' + preview.unmatchedCount + '</strong></div>' +
        '<div class="stat-chip warn"><span>异常预警</span><strong>' + preview.abnormalCount + '</strong></div>';

      const correctedPanel = document.getElementById('correctedPanel');
      if (preview.correctedCount > 0) {
        correctedPanel.style.display = 'block';
        document.getElementById('correctedCount').textContent = preview.correctedCount;
        const correctedTbody = document.querySelector('#correctedTable tbody');
        const rows = [];
        (preview.allCorrections || []).forEach(item => {
          item.corrections.forEach(c => {
            rows.push('<tr>' +
              '<td>' + item.rowIndex + '</td>' +
              '<td><strong>' + c.label + '</strong></td>' +
              '<td class="raw-cell original-value">' + c.original + '</td>' +
              '<td class="corrected-value">→ ' + c.corrected + '</td>' +
              '<td class="correction-reason">' + c.reason + '</td>' +
              '</tr>');
          });
        });
        correctedTbody.innerHTML = rows.join('');
      } else {
        correctedPanel.style.display = 'none';
      }

      const matchedTbody = document.querySelector('#matchedTable tbody');
      matchedTbody.innerHTML = preview.matched.map(m => {
        const obs = m.observation;
        const hasCorrection = m.corrections && m.corrections.length > 0;
        const correctionBadge = hasCorrection
          ? '<span class="correction-badge" title="' + m.corrections.map(c => c.label + ': ' + c.original + ' → ' + c.corrected).join('; ') + '">🔧 ' + m.corrections.length + '</span>'
          : '<span class="correction-badge none">-</span>';
        return '<tr>' +
          '<td>' + correctionBadge + '</td>' +
          '<td><strong>' + m.itemCode + '</strong></td>' +
          '<td>' + (m.itemName || '-') + ' / ' + (m.vat || '-') + '</td>' +
          '<td><span class="pill">' + m.currentStatus + '</span></td>' +
          '<td>' + (obs.temperature || '-') + '</td>' +
          '<td>' + (obs.smell || '-') + '</td>' +
          '<td>' + (obs.fiber || '-') + '</td>' +
          '<td>' + (obs.changedWater || '-') + '</td>' +
          '<td>' + (obs.abnormal || '-') + '</td>' +
          '<td><span class="pill ' + (m.abnormal ? 'warn' : m.willBeReady ? 'ok' : '') + '">' + m.newStatus + '</span></td>' +
          '</tr>';
      }).join('');

      document.getElementById('matchedCount').textContent = preview.matchedCount;

      const unmatchedPanel = document.getElementById('unmatchedPanel');
      if (preview.unmatchedCount > 0) {
        unmatchedPanel.style.display = 'block';
        document.getElementById('unmatchedCount').textContent = preview.unmatchedCount;
        const unmatchedTbody = document.querySelector('#unmatchedTable tbody');
        unmatchedTbody.innerHTML = preview.unmatched.map(u => {
          return '<tr>' +
            '<td>' + (u.row._rowIndex || '-') + '</td>' +
            '<td class="raw-cell">' + (u.row._raw || '') + '</td>' +
            '<td class="warn">' + u.reason + '</td>' +
            '</tr>';
        }).join('');
      } else {
        unmatchedPanel.style.display = 'none';
      }

      const abnormalPanel = document.getElementById('abnormalPanel');
      if (preview.abnormalCount > 0) {
        abnormalPanel.style.display = 'block';
        document.getElementById('abnormalCount').textContent = preview.abnormalCount;
        const abnormalTbody = document.querySelector('#abnormalTable tbody');
        abnormalTbody.innerHTML = preview.abnormalWarnings.map(a => {
          return '<tr>' +
            '<td><strong>' + a.itemCode + '</strong></td>' +
            '<td>' + (a.itemName || '-') + ' / ' + (a.vat || '-') + '</td>' +
            '<td><span class="pill">' + a.currentStatus + '</span></td>' +
            '<td class="warn">' + (a.observation.abnormal || '异常') + '</td>' +
            '<td><span class="pill warn">异常观察</span></td>' +
            '</tr>';
        }).join('');
      } else {
        abnormalPanel.style.display = 'none';
      }

      document.getElementById('confirmCount').textContent = preview.matchedCount;

      document.getElementById('confirmBtn').disabled = preview.matchedCount === 0;
    }

    async function doConfirm() {
      if (!currentPreview || currentPreview.matchedCount === 0) {
        alert('没有可导入的匹配记录');
        return;
      }
      if (!confirm('确定要导入 ' + currentPreview.matchedCount + ' 条观察记录吗？导入后将更新对应批次的状态和天数。')) {
        return;
      }
      try {
        const result = await api('/api/import/apply', {
          method: 'POST',
          body: JSON.stringify({ previewData: currentPreview })
        });
        renderResult(result);
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    }

    function renderResult(result) {
      document.getElementById('previewSection').style.display = 'none';
      document.getElementById('resultSection').style.display = 'block';

      const successCount = (result.success || []).length;
      const failedCount = (result.failed || []).length;

      const resultStats = document.getElementById('resultStats');
      resultStats.innerHTML =
        '<div class="result-stats">' +
        '<div class="result-stat ok"><span>成功导入</span><strong>' + successCount + ' 条</strong></div>' +
        '<div class="result-stat warn"><span>失败</span><strong>' + failedCount + ' 条</strong></div>' +
        '</div>';

      if (successCount > 0) {
        document.getElementById('resultTableWrap').style.display = 'block';
        const tbody = document.querySelector('#resultTable tbody');
        tbody.innerHTML = result.success.map(s => {
          return '<tr>' +
            '<td><strong>' + s.itemCode + '</strong></td>' +
            '<td><span class="pill ok">成功</span></td>' +
            '<td>状态更新为' + s.newStatus + '，已发酵 ' + s.newDays + ' 天</td>' +
            '</tr>';
        }).join('') + (result.failed || []).map(f => {
          return '<tr>' +
            '<td><strong>' + (f.match?.itemCode || '未知') + '</strong></td>' +
            '<td><span class="pill warn">失败</span></td>' +
            '<td class="warn">' + f.reason + '</td>' +
            '</tr>';
        }).join('');
      }
    }

    function doClear() {
      document.getElementById('pasteText').value = '';
      document.getElementById('fileInput').value = '';
      document.getElementById('fieldPanel').style.display = 'none';
      document.getElementById('previewSection').style.display = 'none';
      document.getElementById('resultSection').style.display = 'none';
      currentPreview = null;
    }

    function doContinue() {
      document.getElementById('resultSection').style.display = 'none';
      document.getElementById('previewSection').style.display = 'none';
      document.getElementById('fieldPanel').style.display = 'none';
      currentPreview = null;
    }

    function goHome() {
      window.location.href = '/';
    }

    function bindEvents() {
      document.getElementById('previewBtn').onclick = doPreview;
      document.getElementById('clearBtn').onclick = doClear;
      document.getElementById('confirmBtn').onclick = doConfirm;
      document.getElementById('cancelBtn').onclick = doClear;
      document.getElementById('continueBtn').onclick = doContinue;
      document.getElementById('backHomeBtn').onclick = goHome;
      document.getElementById('reload').onclick = () => location.reload();
    }

    initTabs();
    bindEvents();
  </script>
</body>
</html>`;
}
