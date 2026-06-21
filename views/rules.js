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
        <h2>规则匹配测试</h2>
        <label>选择原料来源</label>
        <select id="testSource"></select>
        <div class="grid-2 mt-8">
          <div>
            <label>当前发酵天数</label>
            <input type="number" id="testDays" value="5">
          </div>
          <div>
            <label>温度(℃)</label>
            <input type="number" id="testTemp" value="25">
          </div>
        </div>
        <label class="mt-8">气味/气味描述</label>
        <input id="testSmell" placeholder="例如：正常酸味、霉味、浓烈酸味">
        <label>纤维状态描述</label>
        <input id="testFiber" placeholder="例如：松散、结块、一般">
        <label>异常备注</label>
        <input id="testAbnormalNote" placeholder="例如：发现霉斑、有腐败味">
        <div class="form-actions">
          <button type="button" class="primary" id="testBtn">测试匹配结果</button>
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

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors ? data.errors.join('；') : (data.error || '请求失败'));
      return data;
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

    function renderSourceOptions() {
      const sel = document.getElementById('testSource');
      const uniqueSources = [...new Set(sources)].sort();
      sel.innerHTML = '<option value="">（使用默认规则）</option>' +
        uniqueSources.map(s => '<option value="' + s + '">' + s + '</option>').join('');
    }

    async function doTest() {
      const source = document.getElementById('testSource').value || '';
      const days = Number(document.getElementById('testDays').value) || 0;
      const temp = document.getElementById('testTemp').value;
      const smell = document.getElementById('testSmell').value;
      const fiber = document.getElementById('testFiber').value;
      const abnormalNote = document.getElementById('testAbnormalNote').value;

      const item = { source, days };
      const observation = { temperature: temp, smell, fiber, abnormalNote };
      try {
        const result = await api('/api/rules/evaluate', {
          method: 'POST',
          body: JSON.stringify({ item, observation })
        });
        const el = document.getElementById('testResult');
        el.style.display = 'block';
        el.className = 'test-result ' + (result.isAbnormal ? 'abnormal' : result.willBeReady ? 'ready' : 'normal');
        el.innerHTML =
          '<div class="result-header"><strong>匹配规则：</strong>' + result.rule.name + '（原料：' + (result.rule.source || '*') + '）</div>' +
          '<div><strong>预计发酵天数：</strong>' + result.newDays + ' 天</div>' +
          '<div><strong>预计新状态：</strong><span class="pill ' + (result.isAbnormal ? 'warn' : result.willBeReady ? 'ok' : '') + '">' + result.nextStatus + '</span></div>' +
          '<div><strong>温度检查：</strong>' + (result.temperatureCheck.isMissing ? '未提供' : (result.temperatureCheck.inRange ? '在安全范围内 ✓' : '超出范围 ✗（' + result.temperatureCheck.value + '℃）')) + '</div>' +
          '<div><strong>异常关键词匹配：</strong>' + (result.keywordMatched.length > 0 ? '命中 → ' + result.keywordMatched.join('、') : '未命中') + '</div>' +
          '<div><strong>判定依据：</strong>' + (result.reasons.length > 0 ? result.reasons.join('；') : '继续发酵中') + '</div>';
      } catch (err) {
        alert('测试失败：' + err.message);
      }
    }

    async function load() {
      const data = await api('/api/rules');
      rules = data.rules || [];
      const items = await api('/api/items');
      sources = items.map(i => i.source).filter(Boolean);
      renderRules();
      renderSourceOptions();
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
    document.getElementById('reload').onclick = load;

    renderFields();
    resetForm();
    load();
  </script>
</body>
</html>`;
}
