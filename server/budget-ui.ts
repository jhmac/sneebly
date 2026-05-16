import { getNavCss, getNavHtml, getProcessBarJs } from "./shared-nav";

export function getBudgetHtml(sneeblyKey: string): string {
  const navCss = getNavCss();
  const navHtml = getNavHtml(sneeblyKey, "budget");
  const processBarJs = getProcessBarJs(sneeblyKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sneebly Budget</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f; --surface: #12121a; --surface-raised: #1a1a25; --surface-hover: #20202d;
      --border: #252530; --border-light: #2a2a38;
      --text: #e8e8ed; --text-muted: #8888a0; --text-dim: #55556a;
      --accent: #6366f1; --accent-glow: rgba(99,102,241,0.15); --accent-hover: #5558e6;
      --green: #22c55e; --green-dim: rgba(34,197,94,0.12); --green-border: rgba(34,197,94,0.25);
      --red: #ef4444; --red-dim: rgba(239,68,68,0.12); --red-border: rgba(239,68,68,0.25);
      --yellow: #eab308; --yellow-dim: rgba(234,179,8,0.12); --yellow-border: rgba(234,179,8,0.25);
      --blue: #3b82f6; --blue-dim: rgba(59,130,246,0.12); --blue-border: rgba(59,130,246,0.25);
      --purple: #a855f7; --purple-dim: rgba(168,85,247,0.12);
      --orange: #f97316; --orange-dim: rgba(249,115,22,0.12);
      --mono: 'JetBrains Mono', monospace;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    html, body { min-height: 100vh; }
    body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.5; }

    ${navCss}

    .container { max-width: 1200px; margin: 0 auto; padding: 24px 20px; }
    .page-header { margin-bottom: 32px; }
    .page-title { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px; }
    .page-subtitle { font-size: 14px; color: var(--text-muted); }

    .gauge-section {
      display: flex; align-items: center; gap: 40px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 32px; margin-bottom: 24px;
    }
    .gauge-container { position: relative; width: 200px; height: 200px; flex-shrink: 0; }
    .gauge-svg { width: 200px; height: 200px; transform: rotate(-90deg); }
    .gauge-bg { fill: none; stroke: var(--border); stroke-width: 12; }
    .gauge-fill { fill: none; stroke-width: 12; stroke-linecap: round; transition: stroke-dashoffset 1s ease, stroke 0.5s; }
    .gauge-center {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      text-align: center;
    }
    .gauge-amount { font-size: 32px; font-weight: 900; font-family: var(--mono); letter-spacing: -0.03em; }
    .gauge-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }

    .gauge-details { flex: 1; }
    .gauge-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .stat-box {
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px;
    }
    .stat-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 2px; }
    .stat-value { font-size: 22px; font-weight: 800; font-family: var(--mono); letter-spacing: -0.02em; }
    .stat-sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .stat-value.green { color: var(--green); }
    .stat-value.yellow { color: var(--yellow); }
    .stat-value.red { color: var(--red); }
    .stat-value.blue { color: var(--blue); }

    .budget-controls {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 24px; margin-bottom: 24px;
    }
    .controls-header { font-size: 16px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .controls-header-icon { font-size: 18px; }
    .controls-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; align-items: end; }
    .control-group { display: flex; flex-direction: column; gap: 6px; }
    .control-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .control-input {
      padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font-size: 15px; font-family: var(--mono);
      font-weight: 600; outline: none; transition: border-color 0.2s; width: 100%;
    }
    .control-input:focus { border-color: var(--accent); }
    .control-select {
      padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font-size: 13px; font-family: var(--sans);
      outline: none; cursor: pointer; width: 100%; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238888a0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
    }
    .control-select:focus { border-color: var(--accent); }
    .btn-primary {
      padding: 10px 20px; border-radius: 8px; border: none;
      background: var(--accent); color: white; font-size: 13px; font-weight: 600;
      font-family: var(--sans); cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; gap: 6px; justify-content: center;
    }
    .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
    .btn-primary:active { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-secondary {
      padding: 10px 20px; border-radius: 8px;
      border: 1px solid var(--border); background: transparent;
      color: var(--text-muted); font-size: 13px; font-weight: 600;
      font-family: var(--sans); cursor: pointer; transition: all 0.2s;
    }
    .btn-secondary:hover { color: var(--text); border-color: var(--border-light); background: var(--surface-raised); }

    .quick-add {
      display: flex; gap: 8px; margin-top: 16px; padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .quick-label { font-size: 12px; color: var(--text-dim); display: flex; align-items: center; margin-right: 4px; }
    .quick-btn {
      padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);
      background: transparent; color: var(--text-muted); font-size: 12px;
      font-family: var(--mono); font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    .quick-btn:hover { color: var(--green); border-color: var(--green-border); background: var(--green-dim); }

    .breakdown-section { margin-bottom: 24px; }
    .section-header {
      font-size: 16px; font-weight: 700; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-icon { font-size: 18px; }

    .breakdown-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    .breakdown-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; overflow: hidden;
    }
    .breakdown-card-title {
      font-size: 13px; font-weight: 700; margin-bottom: 12px;
      display: flex; align-items: center; gap: 6px;
    }
    .breakdown-card-title .dot {
      width: 8px; height: 8px; border-radius: 50%;
    }

    .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bar-label { font-size: 11px; color: var(--text-muted); width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
    .bar-track { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
    .bar-value { font-size: 11px; font-family: var(--mono); font-weight: 600; color: var(--text); width: 60px; text-align: right; flex-shrink: 0; }

    .timeline-section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-bottom: 24px;
    }
    .timeline-header { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
    .timeline-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 0;
      border-bottom: 1px solid var(--border); font-size: 12px;
    }
    .timeline-row:last-child { border-bottom: none; }
    .timeline-date { color: var(--text-dim); width: 100px; font-family: var(--mono); font-size: 11px; flex-shrink: 0; }
    .timeline-bar-wrap { flex: 1; }
    .timeline-bar { height: 16px; border-radius: 4px; min-width: 4px; transition: width 0.6s ease; display: flex; align-items: center; padding: 0 6px; }
    .timeline-bar span { font-size: 10px; font-weight: 600; color: white; white-space: nowrap; }
    .timeline-cost { font-family: var(--mono); font-weight: 600; width: 60px; text-align: right; flex-shrink: 0; }
    .timeline-calls { font-size: 10px; color: var(--text-dim); width: 70px; text-align: right; flex-shrink: 0; }

    .top-expenses {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-bottom: 24px;
    }
    .top-expenses-header { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
    .expense-row {
      display: grid; grid-template-columns: 1fr 100px 80px 60px;
      gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border);
      font-size: 11px; align-items: center;
    }
    .expense-row:last-child { border-bottom: none; }
    .expense-row-head { color: var(--text-dim); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    .expense-agent { font-weight: 600; color: var(--accent); }
    .expense-model { color: var(--text-muted); font-family: var(--mono); font-size: 10px; }
    .expense-cost { font-family: var(--mono); font-weight: 600; text-align: right; }
    .expense-time { color: var(--text-dim); font-size: 10px; text-align: right; }

    .mode-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.03em;
    }
    .mode-badge.notify { background: var(--yellow-dim); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .mode-badge.stop { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border); }

    .toast {
      position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
      border-radius: 10px; font-size: 13px; font-weight: 600;
      transform: translateY(100px); opacity: 0; transition: all 0.3s ease;
      z-index: 1000;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { background: var(--green); color: white; }
    .toast.error { background: var(--red); color: white; }

    @media (max-width: 768px) {
      .gauge-section { flex-direction: column; }
      .controls-grid { grid-template-columns: 1fr; }
      .breakdown-grid { grid-template-columns: 1fr; }
      .gauge-stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${navHtml}

  <div class="container">
    <div class="page-header">
      <div class="page-title">Budget & Expenses</div>
      <div class="page-subtitle">Monitor AI spending, set limits, and control how Sneebly uses your budget</div>
    </div>

    <div class="gauge-section" id="gauge-section">
      <div class="gauge-container">
        <svg class="gauge-svg" viewBox="0 0 200 200">
          <circle class="gauge-bg" cx="100" cy="100" r="85"></circle>
          <circle class="gauge-fill" id="gauge-fill" cx="100" cy="100" r="85"
            stroke-dasharray="534" stroke-dashoffset="534"></circle>
        </svg>
        <div class="gauge-center">
          <div class="gauge-amount" id="gauge-amount">$0</div>
          <div class="gauge-label">spent</div>
        </div>
      </div>
      <div class="gauge-details">
        <div class="gauge-stats">
          <div class="stat-box">
            <div class="stat-label">Budget Limit</div>
            <div class="stat-value" id="stat-limit">$0</div>
            <div class="stat-sub" id="stat-mode"></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Remaining</div>
            <div class="stat-value green" id="stat-remaining">$0</div>
            <div class="stat-sub" id="stat-pct"></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Burn Rate</div>
            <div class="stat-value blue" id="stat-burn">$0</div>
            <div class="stat-sub">per hour</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Projected Runway</div>
            <div class="stat-value" id="stat-runway">--</div>
            <div class="stat-sub" id="stat-runway-sub"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="budget-controls">
      <div class="controls-header"><span class="controls-header-icon">&#9881;</span> Budget Settings</div>
      <div class="controls-grid">
        <div class="control-group">
          <label class="control-label">Budget Limit ($)</label>
          <input type="number" class="control-input" id="input-limit" min="1" step="10" placeholder="100">
        </div>
        <div class="control-group">
          <label class="control-label">Enforcement Mode</label>
          <select class="control-select" id="input-mode">
            <option value="notify">Notify Only (keep working, send alerts)</option>
            <option value="stop">Hard Stop (pause all work at limit)</option>
          </select>
        </div>
        <div class="control-group">
          <button class="btn-primary" id="save-btn" onclick="saveBudget()">Save Settings</button>
        </div>
      </div>
      <div class="quick-add">
        <span class="quick-label">Quick add:</span>
        <button class="quick-btn" onclick="addToBudget(10)">+$10</button>
        <button class="quick-btn" onclick="addToBudget(25)">+$25</button>
        <button class="quick-btn" onclick="addToBudget(50)">+$50</button>
        <button class="quick-btn" onclick="addToBudget(100)">+$100</button>
        <button class="quick-btn" onclick="addToBudget(250)">+$250</button>
      </div>
    </div>

    <div class="breakdown-section">
      <div class="section-header"><span class="section-icon">&#128202;</span> Cost Breakdown</div>
      <div class="breakdown-grid">
        <div class="breakdown-card">
          <div class="breakdown-card-title"><span class="dot" style="background:var(--accent)"></span> By Agent</div>
          <div id="breakdown-agent"></div>
        </div>
        <div class="breakdown-card">
          <div class="breakdown-card-title"><span class="dot" style="background:var(--purple)"></span> By Feature</div>
          <div id="breakdown-feature"></div>
        </div>
        <div class="breakdown-card">
          <div class="breakdown-card-title"><span class="dot" style="background:var(--green)"></span> By Model</div>
          <div id="breakdown-model"></div>
        </div>
        <div class="breakdown-card">
          <div class="breakdown-card-title"><span class="dot" style="background:var(--orange)"></span> Today's Summary</div>
          <div id="breakdown-today"></div>
        </div>
      </div>
    </div>

    <div class="timeline-section">
      <div class="timeline-header">Daily Spend Timeline</div>
      <div id="timeline-content"></div>
    </div>

    <div class="top-expenses">
      <div class="top-expenses-header">Recent Expensive Calls</div>
      <div class="expense-row expense-row-head">
        <span>Agent / Action</span>
        <span>Model</span>
        <span>Time</span>
        <span style="text-align:right">Cost</span>
      </div>
      <div id="top-expenses-content"></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var KEY = '${sneeblyKey}';
    var CC = '/api/sneebly-cc';
    var H = { 'x-sneebly-key': KEY, 'Content-Type': 'application/json' };

    function fmt$(n) { return '$' + (n || 0).toFixed(2); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function showToast(msg, type) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast ' + type + ' show';
      setTimeout(function() { t.className = 'toast'; }, 3000);
    }

    function timeAgo(d) {
      if (!d) return '--';
      var diff = (Date.now() - new Date(d).getTime()) / 1000;
      if (diff < 60) return Math.floor(diff) + 's ago';
      if (diff < 3600) return Math.floor(diff/60) + 'm ago';
      if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
      return Math.floor(diff/86400) + 'd ago';
    }

    function shortTime(d) {
      if (!d) return '--';
      return new Date(d).toLocaleTimeString('en', {hour:'numeric',minute:'2-digit',hour12:true});
    }

    async function loadData() {
      try {
        var results = await Promise.all([
          fetch(CC + '/expenses', { headers: H }).then(function(r) { return r.json(); }),
          fetch(CC + '/budget', { headers: H }).then(function(r) { return r.json(); }),
        ]);
        var exp = results[0] || {};
        var budget = results[1] || {};
        renderGauge(exp, budget);
        renderControls(budget);
        renderBreakdowns(exp);
        renderTimeline(exp);
        renderTopExpenses(exp);
      } catch(e) {
        console.error('Failed to load data:', e);
        showToast('Failed to load expense data', 'error');
      }
    }

    function renderGauge(exp, budget) {
      var spent = exp.totalSpent || 0;
      var limit = budget.limit || 100;
      var remaining = Math.max(0, limit - spent);
      var pct = limit > 0 ? Math.min((spent/limit)*100, 100) : 0;

      var circumference = 534;
      var offset = circumference - (pct / 100) * circumference;
      var fill = document.getElementById('gauge-fill');
      fill.style.strokeDashoffset = offset;
      fill.style.stroke = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : pct > 50 ? 'var(--orange)' : 'var(--green)';

      document.getElementById('gauge-amount').textContent = fmt$(spent);
      document.getElementById('stat-limit').textContent = fmt$(limit);
      document.getElementById('stat-mode').innerHTML = '<span class="mode-badge ' + (budget.mode || 'notify') + '">' + (budget.mode === 'stop' ? 'Hard Stop' : 'Notify Only') + '</span>';

      var remEl = document.getElementById('stat-remaining');
      remEl.textContent = fmt$(remaining);
      remEl.className = 'stat-value ' + (remaining < limit * 0.1 ? 'red' : remaining < limit * 0.3 ? 'yellow' : 'green');

      document.getElementById('stat-pct').textContent = pct.toFixed(1) + '% used';

      var burnPerHour = exp.burnRate ? exp.burnRate.perHour : 0;
      document.getElementById('stat-burn').textContent = fmt$(burnPerHour) + '/hr';

      if (burnPerHour > 0 && remaining > 0) {
        var hoursLeft = remaining / burnPerHour;
        var runwayEl = document.getElementById('stat-runway');
        if (hoursLeft > 48) {
          runwayEl.textContent = (hoursLeft / 24).toFixed(1) + 'd';
        } else {
          runwayEl.textContent = hoursLeft.toFixed(1) + 'h';
        }
        runwayEl.className = 'stat-value ' + (hoursLeft < 2 ? 'red' : hoursLeft < 8 ? 'yellow' : 'green');
        document.getElementById('stat-runway-sub').textContent = 'at current burn rate';
      } else if (remaining <= 0) {
        document.getElementById('stat-runway').textContent = 'Depleted';
        document.getElementById('stat-runway').className = 'stat-value red';
        document.getElementById('stat-runway-sub').textContent = 'budget exceeded';
      } else {
        document.getElementById('stat-runway').textContent = '\\u221E';
        document.getElementById('stat-runway').className = 'stat-value green';
        document.getElementById('stat-runway-sub').textContent = 'no active burn';
      }
    }

    function renderControls(budget) {
      document.getElementById('input-limit').value = budget.limit || 100;
      document.getElementById('input-mode').value = budget.mode || 'notify';
    }

    function renderBreakdowns(exp) {
      renderBarChart('breakdown-agent', exp.byAgent || [], 'agent', 'var(--accent)');
      renderBarChart('breakdown-feature', exp.byFeature || [], 'feature', 'var(--purple)');
      renderBarChart('breakdown-model', exp.byModel || [], 'model', 'var(--green)');

      var todayEl = document.getElementById('breakdown-today');
      var html = '';
      html += '<div class="bar-row"><span class="bar-label">Spent today</span><span class="bar-value">' + fmt$(exp.spentToday || 0) + '</span></div>';
      html += '<div class="bar-row"><span class="bar-label">This hour</span><span class="bar-value">' + fmt$(exp.spentThisHour || 0) + '</span></div>';
      html += '<div class="bar-row"><span class="bar-label">Last 24h</span><span class="bar-value">' + fmt$(exp.spent24h || 0) + '</span></div>';
      html += '<div class="bar-row"><span class="bar-label">Projected total</span><span class="bar-value">' + fmt$(exp.projectedTotal || 0) + '</span></div>';
      var burnPerDay = exp.burnRate ? exp.burnRate.perDay : 0;
      html += '<div class="bar-row"><span class="bar-label">Daily burn rate</span><span class="bar-value">' + fmt$(burnPerDay) + '</span></div>';
      todayEl.innerHTML = html;
    }

    function renderBarChart(containerId, data, keyField, color) {
      var el = document.getElementById(containerId);
      if (!data.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:8px">No data yet</div>'; return; }
      var maxCost = 0;
      for (var i = 0; i < data.length; i++) { if (data[i].cost > maxCost) maxCost = data[i].cost; }
      var html = '';
      var shown = data.slice(0, 8);
      for (var i = 0; i < shown.length; i++) {
        var item = shown[i];
        var label = item[keyField] || 'unknown';
        var pct = maxCost > 0 ? (item.cost / maxCost) * 100 : 0;
        html += '<div class="bar-row">';
        html += '<span class="bar-label" title="' + esc(label) + '">' + esc(label) + '</span>';
        html += '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
        html += '<span class="bar-value">' + fmt$(item.cost) + '</span>';
        html += '</div>';
      }
      el.innerHTML = html;
    }

    function renderTimeline(exp) {
      var el = document.getElementById('timeline-content');
      var timeline = exp.timeline || [];
      if (!timeline.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:8px">No daily data yet</div>'; return; }
      var maxCost = 0;
      for (var i = 0; i < timeline.length; i++) { if (timeline[i].cost > maxCost) maxCost = timeline[i].cost; }
      var html = '';
      for (var i = 0; i < timeline.length; i++) {
        var day = timeline[i];
        var pct = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;
        var barColor = day.cost > (exp.budget ? exp.budget.limit * 0.3 : 30) ? 'var(--red)' : day.cost > (exp.budget ? exp.budget.limit * 0.15 : 15) ? 'var(--yellow)' : 'var(--accent)';
        html += '<div class="timeline-row">';
        html += '<span class="timeline-date">' + esc(day.date) + '</span>';
        html += '<div class="timeline-bar-wrap"><div class="timeline-bar" style="width:' + Math.max(pct, 5) + '%;background:' + barColor + '"><span>' + fmt$(day.cost) + '</span></div></div>';
        html += '<span class="timeline-calls">' + (day.calls || 0) + ' calls</span>';
        html += '</div>';
      }
      el.innerHTML = html;
    }

    function renderTopExpenses(exp) {
      var el = document.getElementById('top-expenses-content');
      var top = exp.topExpenses || [];
      if (!top.length) { el.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:8px">No expensive calls yet</div>'; return; }
      var html = '';
      var shown = top.slice(0, 10);
      for (var i = 0; i < shown.length; i++) {
        var e = shown[i];
        html += '<div class="expense-row">';
        html += '<span><span class="expense-agent">' + esc(e.agent || '') + '</span> <span style="color:var(--text-dim);font-size:10px">' + esc(e.action || '') + '</span></span>';
        html += '<span class="expense-model">' + esc(e.model || '') + '</span>';
        html += '<span class="expense-time">' + (e.timestamp ? shortTime(e.timestamp) : '--') + '</span>';
        html += '<span class="expense-cost">' + fmt$(e.cost) + '</span>';
        html += '</div>';
      }
      el.innerHTML = html;
    }

    async function saveBudget() {
      var limit = parseFloat(document.getElementById('input-limit').value);
      var mode = document.getElementById('input-mode').value;
      if (isNaN(limit) || limit <= 0) { showToast('Enter a valid budget amount', 'error'); return; }
      var btn = document.getElementById('save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        var res = await fetch(CC + '/budget', {
          method: 'POST', headers: H,
          body: JSON.stringify({ limit: limit, mode: mode }),
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Budget updated to ' + fmt$(limit) + ' (' + mode + ' mode)', 'success');
        await loadData();
      } catch(e) {
        showToast('Failed to save budget', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Settings';
      }
    }

    async function addToBudget(amount) {
      var current = parseFloat(document.getElementById('input-limit').value) || 0;
      var newLimit = current + amount;
      document.getElementById('input-limit').value = newLimit;
      var mode = document.getElementById('input-mode').value;
      try {
        var res = await fetch(CC + '/budget', {
          method: 'POST', headers: H,
          body: JSON.stringify({ limit: newLimit, mode: mode }),
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Added ' + fmt$(amount) + ' — new limit: ' + fmt$(newLimit), 'success');
        await loadData();
      } catch(e) {
        showToast('Failed to update budget', 'error');
      }
    }

    ${processBarJs}
    loadData();
    setInterval(loadData, 15000);
  </script>
</body>
</html>`;
}
