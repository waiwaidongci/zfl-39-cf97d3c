import { ruleFields, autoStatusOptions, stages } from "../lib/db.js";

export function rulesPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>发酵判定规则配置</title>
  <link rel="stylesheet" href="/public/common.css">
  <link rel="stylesheet" href="/public/main.css">
  <link rel="stylesheet" href="/public/rules.css">
</head>
<body>
  <header>
    <div>
      <h1>发酵判定规则配置</h1>
      <div class="meta">管理员维护不同原料来源的发酵天数阈值、温度安全范围、异常关键词和自动转状态规则 · <a class="nav-link" href="/">← 返回主页</a> · <a class="nav-link" href="/board">浸泡缸看板</a> · <a class="nav-link" href="/timeline">时间轴</a> · <a class="nav-link" href="/batch-import">批量导入</a></div>
    </div>
    <button id="reload">刷新</button>
  </header>

  <main>
    <section>
      <form id="ruleForm" class="panel">
        <h2 id="formTitle">新增规则</h2>
        <input type="hidden" id="ruleId">
        <div id="ruleFields"></div>
        <label>异常关键词（逗号分隔）</label>
        <input id="abnormalKeywords" placeholder="霉,臭,腐,酸败,异味,发黑,结块,霉斑,发霉,腐败">
        <div class="auto-status-section">
          <h3>自动转状态规则</h3>
          <div class="grid-2">
            <div>
              <label>触发异常关键词时</label>
              <select id="onAbnormalKeyword"></select>
            </div>
            <div>
              <label>温度超出安全范围时</label>
              <select id="onTemperatureOutOfRange"></select>
            </div>
            <div>
              <label>达到最短发酵天数时</label>
              <select id="onDaysReachedMin"></select>
            </div>
            <div>
              <label>超过最长发酵天数时</label>
              <select id="onDaysExceedMax"></select>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="primary" id="submitBtn">保存规则</button>
          <button type="button" class="secondary" id="cancelBtn" style="display:none">取消编辑</button>
        </div>
      </form>

      <div class="panel mt-14">
        <div class="panel-header">
          <h2>🧪 规则试算</h2>
          <div class="trial-hint">选择一个现有批次，输入模拟观察记录，即时预览判定结果（不写入真实数据）</div>
        </div>

        <div class="trial-mode-switch">
          <label class="mode-option">
            <input type="radio" name="trialMode" value="saved" checked>
            <span>使用已保存规则</span>
          </label>
          <label class="mode-option">
            <input type="radio" name="trialMode" value="editing">
            <span>使用正在编辑的规则</span>
          </label>
        </div>

        <div id="editingRuleHint" class="editing-rule-hint" style="display:none">
          <span class="hint-icon">💡</span>
          <span>当前使用表单中未保存的规则参数进行试算，请先在上方表单中编辑规则</span>
        </div>

        <label>选择批次</label>
        <select id="testBatch">
          <option value="">请选择一个批次进行试算</option>
        </select>

        <div id="batchInfo" class="batch-info" style="display:none">
          <div class="info-grid">
            <div><b>批次编号：</b><span id="infoCode"></span></div>
            <div><b>原料来源：</b><span id="infoSource"></span></div>
            <div><b>当前状态：</b><span id="infoStatus" class="pill"></span></div>
            <div><b>已发酵天数：</b><span id="infoDays"></span> 天</div>
            <div><b>入缸日期：</b><span id="infoDate"></span></div>
            <div><b>浸泡缸：</b><span id="infoVat"></span></div>
          </div>
        </div>

        <div class="grid-2 mt-8">
          <div>
            <label>温度(℃)</label>
            <input type="number" id="testTemp" value="" placeholder="例如：25">
          </div>
          <div>
            <label>是否异常</label>
            <select id="testAbnormal">
              <option value="">否</option>
              <option value="是">是</option>
            </select>
          </div>
        </div>
        <label class="mt-8">气味描述</label>
        <input id="testSmell" placeholder="例如：正常酸味、霉味、浓烈酸味">
        <label>纤维状态描述</label>
        <input id="testFiber" placeholder="例如：松散、结块、一般">
        <label>异常备注</label>
        <input id="testAbnormalNote" placeholder="例如：发现霉斑、有腐败味">

        <div class="form-actions">
          <button type="button" class="primary" id="testBtn">开始试算</button>
          <button type="button" class="secondary" id="resetTrialBtn">重置</button>
        </div>

        <div id="testResult" class="test-result" style="display:none"></div>
      </div>
    </section>

    <section>
      <div class="stats" id="stats"></div>
      <div class="panel">
        <h2>规则列表</h2>
        <div class="hint">默认规则（标记为 *）会应用于未单独配置规则的原料来源。</div>
        <div class="rules-grid" id="rulesList"></div>
      </div>
    </section>
  </main>

  <script>
    const ruleFields = ${JSON.stringify(ruleFields)};
    const autoStatusOptions = ${JSON.stringify(autoStatusOptions)};
    const stages = ${JSON.stringify(stages)};

    let rules = [];
    let sources = [];
    let items = [];
    let debounceTimer = null;

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors ? data.errors.join('；') : (data.error || '请求失败'));
      return data;
    }

    function getEditingRule() {
      const ruleData = collectFormData();
      return ruleData;
    }

    function getTrialMode() {
      const selected = document.querySelector('input[name="trialMode"]:checked');
      return selected ? selected.value : 'saved';
    }

    function renderBatchOptions() {
      const sel = document.getElementById('testBatch');
      const activeItems = items.filter(i => 
        i.status === '发酵中' || i.status === '入缸' || i.status === '异常观察'
      );
      sel.innerHTML = '<option value="">请选择一个批次进行试算</option>' +
        activeItems.map(item => {
          const label = `${item.code || item.id} · ${item.source || '未知原料'} · ${item.status} · ${item.days || 0}天`;
          return `<option value="${item.id || item.code}">${label}</option>`;
        }).join('');
    }

    function onBatchChange() {
      const batchId = document.getElementById('testBatch').value;
      const infoEl = document.getElementById('batchInfo');
      if (!batchId) {
        infoEl.style.display = 'none';
        return;
      }
      const item = items.find(i => (i.id || i.code) === batchId);
      if (!item) {
        infoEl.style.display = 'none';
        return;
      }
      document.getElementById('infoCode').textContent = item.code || item.id;
      document.getElementById('infoSource').textContent = item.source || '-';
      const statusEl = document.getElementById('infoStatus');
      statusEl.textContent = item.status;
      statusEl.className = 'pill ' + (item.status === '可抄纸' ? 'ok' : item.status === '异常观察' ? 'warn' : '');
      document.getElementById('infoDays').textContent = item.days || 0;
      document.getElementById('infoDate').textContent = item.startDate || '-';
      document.getElementById('infoVat').textContent = item.vat || '-';
      infoEl.style.display = 'block';
      autoTryEvaluate();
    }

    function collectObservation() {
      return {
        temperature: document.getElementById('testTemp').value,
        smell: document.getElementById('testSmell').value,
        fiber: document.getElementById('testFiber').value,
        abnormalNote: document.getElementById('testAbnormalNote').value,
        abnormal: document.getElementById('testAbnormal').value,
      };
    }

    function renderTrialResult(result) {
      const el = document.getElementById('testResult');
      el.style.display = 'block';

      const statusClass = result.isAbnormal ? 'abnormal' : result.willBeReady ? 'ready' : 'normal';
      el.className = 'test-result ' + statusClass;

      const triggeredList = [];
      if (result.triggered?.abnormalCheckbox) triggeredList.push('<span class="trigger-badge warn">异常标记</span>');
      if (result.triggered?.abnormalKeyword) triggeredList.push('<span class="trigger-badge warn">关键词异常</span>');
      if (result.triggered?.temperatureOutOfRange) triggeredList.push('<span class="trigger-badge warn">温度越界</span>');
      if (result.triggered?.daysReachedMin) triggeredList.push('<span class="trigger-badge ok">天数达标</span>');
      if (result.triggered?.daysExceedMax) triggeredList.push('<span class="trigger-badge warn">超时超限</span>');
      if (triggeredList.length === 0) triggeredList.push('<span class="trigger-badge">无触发</span>');

      const keywordHtml = result.keywordMatched && result.keywordMatched.length > 0
        ? '<span class="kw-hit">' + result.keywordMatched.map(k => `<span class="kw-tag">${k}</span>`).join('') + '</span>'
        : '<span class="kw-none">未命中</span>';

      const tempInfo = result.temperatureCheck?.isMissing
        ? '未提供'
        : result.temperatureCheck?.inRange
          ? `<span class="temp-ok">${result.temperatureCheck.value}℃ ✓ 在安全范围内</span>`
          : `<span class="temp-bad">${result.temperatureCheck.value}℃ ✗ 超出范围</span>`;

      const statusChangeHtml = result.statusChanged
        ? `<span class="status-change">
             <span class="old-status">${result.currentStatus}</span>
             <span class="arrow">→</span>
             <span class="new-status pill ${result.isAbnormal ? 'warn' : result.willBeReady ? 'ok' : ''}">${result.nextStatus}</span>
           </span>`
        : `<span class="status-no-change">保持 <span class="pill">${result.currentStatus}</span></span>`;

      const daysChangeHtml = result.daysChanged
        ? `<span class="days-change">${result.currentDays} 天 → <strong>${result.newDays}</strong> 天</span>`
        : `<span>${result.currentDays} 天</span>`;

      el.innerHTML = `
        <div class="result-header">
          <div class="result-title">
            <span class="result-icon">${result.isAbnormal ? '⚠️' : result.willBeReady ? '✅' : '🔄'}</span>
            <strong>试算结果</strong>
            ${result.customRuleUsed ? '<span class="custom-rule-badge">使用编辑中规则</span>' : ''}
          </div>
          <div class="rule-info">
            命中规则：<strong>${result.ruleName}</strong>（原料：${result.ruleSource}）
          </div>
        </div>

        <div class="result-grid">
          <div class="result-card">
            <div class="result-label">状态变化</div>
            <div class="result-value">${statusChangeHtml}</div>
          </div>
          <div class="result-card">
            <div class="result-label">天数变化</div>
            <div class="result-value">${daysChangeHtml}</div>
          </div>
          <div class="result-card">
            <div class="result-label">温度检查</div>
            <div class="result-value">${tempInfo}</div>
          </div>
          <div class="result-card">
            <div class="result-label">关键词命中</div>
            <div class="result-value">${keywordHtml}</div>
          </div>
        </div>

        <div class="result-section">
          <div class="result-section-title">触发项</div>
          <div class="trigger-list">${triggeredList.join('')}</div>
        </div>

        <div class="result-section">
          <div class="result-section-title">判定依据</div>
          <div class="reasons-list">
            ${result.reasons && result.reasons.length > 0
              ? result.reasons.map(r => `<div class="reason-item">• ${r}</div>`).join('')
              : '<div class="reason-item none">继续发酵中，暂无触发项</div>'
            }
          </div>
        </div>

        <div class="result-footer">
          <span class="meta">试算模式：${getTrialMode() === 'saved' ? '已保存规则' : '编辑中规则'}</span>
          <span class="meta">批次：${result.item?.code || result.item?.id}</span>
        </div>
      `;
    }

    async function doTest() {
      const batchId = document.getElementById('testBatch').value;
      if (!batchId) {
        alert('请先选择一个批次');
        return;
      }

      const observation = collectObservation();
      const trialMode = getTrialMode();
      const customRule = trialMode === 'editing' ? getEditingRule() : null;

      try {
        const result = await api('/api/rules/try-evaluate', {
          method: 'POST',
          body: JSON.stringify({ itemId: batchId, observation, customRule })
        });
        renderTrialResult(result);
      } catch (err) {
        alert('试算失败：' + err.message);
      }
    }

    function autoTryEvaluate() {
      const batchId = document.getElementById('testBatch').value;
      if (!batchId) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doTest, 300);
    }

    function resetTrial() {
      document.getElementById('testBatch').value = '';
      document.getElementById('testTemp').value = '';
      document.getElementById('testSmell').value = '';
      document.getElementById('testFiber').value = '';
      document.getElementById('testAbnormalNote').value = '';
      document.getElementById('testAbnormal').value = '';
      document.getElementById('batchInfo').style.display = 'none';
      document.getElementById('testResult').style.display = 'none';
    }

    function onTrialModeChange() {
      const mode = getTrialMode();
      const hintEl = document.getElementById('editingRuleHint');
      hintEl.style.display = mode === 'editing' ? 'block' : 'none';
      autoTryEvaluate();
    }

    function onFormInput() {
      if (getTrialMode() === 'editing') {
        autoTryEvaluate();
      }
    }

    function renderFields() {
      const html = ruleFields.map(([key,label,type]) => {
        if (key === 'source') {
          return '<label>'+label+'</label><input name="'+key+'" type="'+type+'" placeholder="例如：构树皮、桑树皮、竹浆，或 * 表示默认" required>';
        }
        return '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(type==='number'?'step="any"':'')+' required>';
      }).join('');
      document.getElementById('ruleFields').innerHTML = html;

      const fills = ['onAbnormalKeyword', 'onTemperatureOutOfRange', 'onDaysReachedMin', 'onDaysExceedMax'];
      fills.forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = autoStatusOptions.map(s => '<option>' + s + '</option>').join('');
      });
    }

    function resetForm() {
      document.getElementById('ruleForm').reset();
      document.getElementById('ruleId').value = '';
      document.getElementById('formTitle').textContent = '新增规则';
      document.getElementById('submitBtn').textContent = '保存规则';
      document.getElementById('cancelBtn').style.display = 'none';
      document.getElementById('onAbnormalKeyword').value = '异常观察';
      document.getElementById('onTemperatureOutOfRange').value = '异常观察';
      document.getElementById('onDaysReachedMin').value = '可抄纸';
      document.getElementById('onDaysExceedMax').value = '异常观察';
    }

    function editRule(rule) {
      document.getElementById('ruleId').value = rule.id;
      document.getElementById('formTitle').textContent = '编辑规则：' + rule.name;
      document.getElementById('submitBtn').textContent = '更新规则';
      document.getElementById('cancelBtn').style.display = 'inline-block';

      ruleFields.forEach(([key]) => {
        const input = document.querySelector('#ruleForm [name="'+key+'"]');
        if (input) input.value = rule[key] ?? '';
      });
      document.getElementById('abnormalKeywords').value = (rule.abnormalKeywords || []).join(',');
      document.getElementById('onAbnormalKeyword').value = rule.autoStatusRules?.onAbnormalKeyword || '异常观察';
      document.getElementById('onTemperatureOutOfRange').value = rule.autoStatusRules?.onTemperatureOutOfRange || '异常观察';
      document.getElementById('onDaysReachedMin').value = rule.autoStatusRules?.onDaysReachedMin || '可抄纸';
      document.getElementById('onDaysExceedMax').value = rule.autoStatusRules?.onDaysExceedMax || '异常观察';
    }

    function collectFormData() {
      const form = document.getElementById('ruleForm');
      const data = {};
      ruleFields.forEach(([key]) => {
        const input = form.querySelector('[name="'+key+'"]');
        if (input) data[key] = input.value;
      });
      data.abnormalKeywords = document.getElementById('abnormalKeywords').value.split(',').map(s => s.trim()).filter(Boolean);
      data.autoStatusRules = {
        onAbnormalKeyword: document.getElementById('onAbnormalKeyword').value,
        onTemperatureOutOfRange: document.getElementById('onTemperatureOutOfRange').value,
        onDaysReachedMin: document.getElementById('onDaysReachedMin').value,
        onDaysExceedMax: document.getElementById('onDaysExceedMax').value,
      };
      return data;
    }

    function renderRules() {
      const statsEl = document.getElementById('stats');
      const defaultCount = rules.filter(r => r.isDefault).length;
      const customCount = rules.filter(r => !r.isDefault).length;
      statsEl.innerHTML =
        '<div class="stat"><span>规则总数</span><strong>' + rules.length + '</strong></div>' +
        '<div class="stat"><span>默认规则</span><strong>' + defaultCount + '</strong></div>' +
        '<div class="stat"><span>自定义规则</span><strong>' + customCount + '</strong></div>';

      const list = document.getElementById('rulesList');
      list.innerHTML = rules.map(rule => {
        const keywords = (rule.abnormalKeywords || []).slice(0, 6).join('、') + ((rule.abnormalKeywords || []).length > 6 ? ' ...' : '');
        const asr = rule.autoStatusRules || {};
        return '<article class="rule-card' + (rule.isDefault ? ' default' : '') + '">' +
          '<div class="rule-header">' +
            '<h3>' + rule.name + (rule.isDefault ? ' <span class="pill default-pill">默认</span>' : '') + '</h3>' +
            '<div class="rule-source">原料：' + (rule.source || '-') + '</div>' +
          '</div>' +
          '<div class="rule-body">' +
            '<div><b>发酵天数范围：</b>' + rule.minDays + ' ~ ' + rule.maxDays + ' 天</div>' +
            '<div><b>温度安全范围：</b>' + rule.temperatureMin + ' ~ ' + rule.temperatureMax + ' ℃</div>' +
            '<div class="keywords-row"><b>异常关键词：</b>' + (keywords || '无') + '</div>' +
            '<div class="auto-rules"><b>自动状态：</b>' +
              '关键词→' + (asr.onAbnormalKeyword || '-') + '，' +
              '超温→' + (asr.onTemperatureOutOfRange || '-') + '，' +
              '达标→' + (asr.onDaysReachedMin || '-') + '，' +
              '超时→' + (asr.onDaysExceedMax || '-') +
            '</div>' +
          '</div>' +
          '<div class="rule-footer">' +
            '<span class="meta">更新于 ' + (rule.updatedAt || rule.createdAt || '').slice(0, 10) + '</span>' +
            '<div class="actions">' +
              '<button class="secondary" data-edit="' + rule.id + '">编辑</button>' +
              (rule.isDefault ? '' : '<button class="danger" data-delete="' + rule.id + '">删除</button>') +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('');

      document.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
          const rule = rules.find(r => r.id === btn.dataset.edit);
          if (rule) editRule(rule);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };
      });
      document.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('确定要删除这条规则吗？删除后该原料来源将使用默认规则。')) return;
          try {
            await api('/api/rules/' + btn.dataset.delete, { method: 'DELETE' });
            await load();
          } catch (err) {
            alert('删除失败：' + err.message);
          }
        };
      });
    }

    async function load() {
      const data = await api('/api/rules');
      rules = data.rules || [];
      items = await api('/api/items');
      sources = items.map(i => i.source).filter(Boolean);
      renderRules();
      renderBatchOptions();
    }

    document.getElementById('ruleForm').onsubmit = async event => {
      event.preventDefault();
      const id = document.getElementById('ruleId').value;
      const data = collectFormData();
      try {
        if (id) {
          await api('/api/rules/' + id, { method: 'PATCH', body: JSON.stringify(data) });
        } else {
          await api('/api/rules', { method: 'POST', body: JSON.stringify(data) });
        }
        resetForm();
        await load();
      } catch (err) {
        alert('保存失败：' + err.message);
      }
    };

    document.getElementById('cancelBtn').onclick = resetForm;
    document.getElementById('testBtn').onclick = doTest;
    document.getElementById('resetTrialBtn').onclick = resetTrial;
    document.getElementById('reload').onclick = load;

    document.getElementById('testBatch').onchange = onBatchChange;
    document.querySelectorAll('input[name="trialMode"]').forEach(radio => {
      radio.onchange = onTrialModeChange;
    });

    const trialInputs = ['testTemp', 'testSmell', 'testFiber', 'testAbnormalNote', 'testAbnormal'];
    trialInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = autoTryEvaluate;
        el.onchange = autoTryEvaluate;
      }
    });

    const ruleFormInputs = document.querySelectorAll('#ruleForm input, #ruleForm select');
    ruleFormInputs.forEach(input => {
      input.oninput = onFormInput;
      input.onchange = onFormInput;
    });

    renderFields();
    resetForm();
    load();
  </script>
</body>
</html>`;
}
