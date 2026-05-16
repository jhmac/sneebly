import { getNavCss, getNavHtml, getProcessBarJs } from "./shared-nav";

export function getUiHealthHtml(sneeblyKey: string): string {
  const navCss = getNavCss();
  const navHtml = getNavHtml(sneeblyKey, "ui-health");
  const processBarJs = getProcessBarJs(sneeblyKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sneebly UI Health</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f; --surface: #12121a; --surface-raised: #1a1a25;
      --border: #252530; --border-light: #2a2a38;
      --text: #e8e8ed; --text-muted: #8888a0; --text-dim: #55556a;
      --accent: #6366f1; --accent-glow: rgba(99,102,241,0.15);
      --green: #22c55e; --green-dim: rgba(34,197,94,0.12); --green-border: rgba(34,197,94,0.25);
      --red: #ef4444; --red-dim: rgba(239,68,68,0.12); --red-border: rgba(239,68,68,0.25);
      --yellow: #eab308; --yellow-dim: rgba(234,179,8,0.12); --yellow-border: rgba(234,179,8,0.25);
      --blue: #3b82f6; --blue-dim: rgba(59,130,246,0.12); --blue-border: rgba(59,130,246,0.25);
      --purple: #a855f7; --purple-dim: rgba(168,85,247,0.12);
      --orange: #f97316;
      --mono: 'JetBrains Mono', monospace;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.5; min-height: 100vh; }

    ${navCss}

    .shell { max-width: 1200px; margin: 0 auto; padding: 20px 24px; }

    .hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .hero-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 18px; position: relative; overflow: hidden;
    }
    .hero-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .hero-card.green::before { background: var(--green); }
    .hero-card.red::before { background: var(--red); }
    .hero-card.blue::before { background: var(--blue); }
    .hero-card.yellow::before { background: var(--yellow); }
    .hero-label { font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .hero-value { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; }
    .hero-sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; margin-bottom: 16px;
    }
    .card-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px; border-bottom: 1px solid var(--border);
    }
    .card-title { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
    .card-body { padding: 16px 18px; }

    .toolbar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
    .btn {
      padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.15s; font-family: var(--sans);
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: #5457e5; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--surface-raised); color: var(--text); border: 1px solid var(--border-light); }
    .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
    .scan-status { font-size: 12px; color: var(--text-muted); margin-left: 8px; }

    .route-table { width: 100%; border-collapse: collapse; }
    .route-table th {
      text-align: left; font-size: 11px; font-weight: 600; color: var(--text-dim);
      text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 12px;
      border-bottom: 1px solid var(--border);
    }
    .route-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
    .route-table tr:last-child td { border-bottom: none; }
    .route-table tr.clickable { cursor: pointer; }
    .route-table tr.clickable:hover td { background: var(--surface-raised); }

    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .badge-pass { background: var(--green-dim); color: var(--green); border: 1px solid var(--green-border); }
    .badge-fail { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border); }
    .badge-skip { background: var(--yellow-dim); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .badge-error { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border); }
    .badge-running { background: var(--blue-dim); color: var(--blue); border: 1px solid var(--blue-border); }
    .badge-unknown { background: rgba(100,100,120,0.1); color: var(--text-muted); border: 1px solid var(--border); }

    .mono { font-family: var(--mono); font-size: 12px; }
    .text-muted { color: var(--text-muted); }
    .text-dim { color: var(--text-dim); }

    .detail-panel {
      display: none; background: var(--bg); border: 1px solid var(--border-light);
      border-radius: 8px; padding: 14px 16px; margin-top: 8px;
    }
    .detail-panel.open { display: block; }

    .error-list { list-style: none; padding: 0; margin: 0; }
    .error-list li {
      font-size: 12px; font-family: var(--mono);
      color: var(--red); padding: 3px 0;
      border-bottom: 1px solid rgba(239,68,68,0.1);
    }
    .error-list li:last-child { border-bottom: none; }
    .error-list li.warn { color: var(--yellow); }

    .el-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; margin-top: 10px; }
    .el-item {
      background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
      padding: 8px 10px; font-size: 12px;
    }
    .el-item.found { border-color: var(--green-border); }
    .el-item.missing { border-color: var(--red-border); }
    .el-testid { font-family: var(--mono); font-size: 11px; color: var(--accent); margin-bottom: 2px; }
    .el-purpose { color: var(--text-muted); font-size: 11px; }
    .el-errors { margin-top: 4px; }
    .el-error { font-size: 11px; color: var(--red); }

    .empty-state {
      text-align: center; padding: 60px 20px; color: var(--text-dim);
    }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    .empty-state h3 { font-size: 16px; color: var(--text-muted); margin-bottom: 6px; }
    .empty-state p { font-size: 13px; }

    .spec-info { font-size: 12px; color: var(--text-dim); }
    .critical-list { list-style: none; padding: 0; }
    .critical-list li {
      padding: 8px 12px; background: var(--red-dim); border: 1px solid var(--red-border);
      border-radius: 6px; font-size: 12px; font-family: var(--mono); color: var(--red);
      margin-bottom: 6px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border-light); border-top-color: var(--blue); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
  </style>
</head>
<body>
${navHtml}

<div class="shell">
  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
    <div>
      <h1 style="font-size:20px;font-weight:800;letter-spacing:-0.03em;">UI Health</h1>
      <div class="spec-info" id="spec-info">Loading spec info...</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" id="btn-gen-spec" onclick="genSpec()">Regenerate Spec</button>
      <button class="btn btn-primary" id="btn-scan" onclick="runScan()">&#9654; Run Scan Now</button>
    </div>
  </div>

  <div class="hero" id="hero">
    <div class="hero-card blue">
      <div class="hero-label">Status</div>
      <div class="hero-value" id="hero-status">—</div>
      <div class="hero-sub" id="hero-run-at">Not yet run</div>
    </div>
    <div class="hero-card green">
      <div class="hero-label">Passed</div>
      <div class="hero-value" id="hero-passed">—</div>
      <div class="hero-sub">routes</div>
    </div>
    <div class="hero-card red">
      <div class="hero-label">Failed</div>
      <div class="hero-value" id="hero-failed">—</div>
      <div class="hero-sub">routes</div>
    </div>
    <div class="hero-card yellow">
      <div class="hero-label">Total Errors</div>
      <div class="hero-value" id="hero-errors">—</div>
      <div class="hero-sub">console + network + exceptions</div>
    </div>
  </div>

  <div id="critical-section" style="display:none;" class="card" style="border-color:var(--red-border);">
    <div class="card-head"><span class="card-title" style="color:var(--red);">&#9888; Critical Failures</span></div>
    <div class="card-body">
      <ul class="critical-list" id="critical-list"></ul>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <span class="card-title">Route Results</span>
      <span class="text-dim" style="font-size:12px;" id="routes-summary">Click a row to expand details</span>
    </div>
    <div class="card-body" style="padding:0;">
      <div id="routes-container">
        <div class="empty-state">
          <div class="icon">&#128269;</div>
          <h3>No scan results yet</h3>
          <p>Click "Run Scan Now" to crawl all routes and check for errors.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">UI Spec</span><span class="text-dim" style="font-size:12px;" id="spec-summary">—</span></div>
    <div class="card-body" style="padding:0;">
      <div id="spec-container">
        <div class="empty-state">
          <div class="icon">&#128196;</div>
          <h3>No spec generated yet</h3>
          <p>Click "Regenerate Spec" to scan routes and data-testid attributes.</p>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
  var KEY = '${sneeblyKey}';
  var scanInterval = null;
  var reportData = null;
  var specData = null;
  var openRows = new Set();

  function api(url, method, body) {
    var sep = url.includes('?') ? '&' : '?';
    return fetch(url + sep + 'key=' + KEY, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-sneebly-key': KEY },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  function badge(status) {
    var map = { pass: 'pass', fail: 'fail', skip: 'skip', error: 'error', running: 'running' };
    var cls = map[status] || 'unknown';
    return '<span class="badge badge-' + cls + '">' + (status || '?') + '</span>';
  }

  function timeAgo(iso) {
    if (!iso) return 'never';
    var d = new Date(iso);
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return d.toLocaleDateString();
  }

  function renderReport(report) {
    reportData = report;
    document.getElementById('hero-status').textContent = report.status ? report.status.toUpperCase() : '—';
    document.getElementById('hero-run-at').textContent = 'Last run: ' + timeAgo(report.runAt);
    document.getElementById('hero-passed').textContent = report.routesPassed !== undefined ? report.routesPassed : '—';
    document.getElementById('hero-failed').textContent = report.routesFailed !== undefined ? report.routesFailed : '—';
    document.getElementById('hero-errors').textContent = report.totalErrors !== undefined ? report.totalErrors : '—';

    var critSec = document.getElementById('critical-section');
    var critList = document.getElementById('critical-list');
    if (report.criticalFailures && report.criticalFailures.length > 0) {
      critSec.style.display = '';
      critList.innerHTML = report.criticalFailures.map(function(f) {
        return '<li>' + escHtml(f) + '</li>';
      }).join('');
    } else {
      critSec.style.display = 'none';
    }

    var routes = report.routes || [];
    document.getElementById('routes-summary').textContent = routes.length + ' routes tested, ' + timeAgo(report.runAt);

    if (routes.length === 0) {
      document.getElementById('routes-container').innerHTML = '<div class="empty-state"><div class="icon">&#10003;</div><h3>No routes found</h3><p>Generate the UI spec first.</p></div>';
      return;
    }

    var html = '<table class="route-table"><thead><tr>';
    html += '<th>Route</th><th>Status</th><th>Elements Found</th><th>Elements Tested</th><th>Errors</th><th>Duration</th>';
    html += '</tr></thead><tbody>';

    routes.forEach(function(r, i) {
      var rowId = 'row-' + i;
      var detailId = 'detail-' + i;
      html += '<tr class="clickable" data-testid="route-row-' + escHtml(r.path) + '" onclick="toggleRow(' + i + ')">';
      html += '<td><span class="mono">' + escHtml(r.path) + '</span><br><span class="text-dim" style="font-size:11px;">' + escHtml(r.component) + '</span></td>';
      html += '<td>' + badge(r.status) + (r.skipReason ? '<br><span class="text-dim" style="font-size:11px;">' + escHtml(r.skipReason) + '</span>' : '') + '</td>';
      html += '<td>' + (r.elementsFound || 0) + ' / ' + ((r.elementResults || []).length) + '</td>';
      html += '<td>' + (r.elementsTested || 0) + '</td>';
      html += '<td>' + (r.errorCount > 0 ? '<span style="color:var(--red);font-weight:600;">' + r.errorCount + '</span>' : '<span style="color:var(--green);">0</span>') + '</td>';
      html += '<td class="text-dim">' + (r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '—') + '</td>';
      html += '</tr>';
      html += '<tr id="detail-row-' + i + '" style="display:none;"><td colspan="6">';
      html += renderRouteDetail(r);
      html += '</td></tr>';
    });

    html += '</tbody></table>';
    document.getElementById('routes-container').innerHTML = html;
  }

  function renderRouteDetail(r) {
    var html = '<div style="padding:12px 0;">';

    var allErrors = (r.consoleErrors || []).concat(r.networkErrors || []).concat(r.uncaughtExceptions || []);
    if (allErrors.length > 0) {
      html += '<div style="margin-bottom:12px;"><strong style="font-size:12px;color:var(--text-muted);">Errors (' + allErrors.length + ')</strong>';
      html += '<ul class="error-list" style="margin-top:6px;">';
      (r.consoleErrors || []).forEach(function(e) { html += '<li>&#9888; ' + escHtml(e) + '</li>'; });
      (r.networkErrors || []).forEach(function(e) { html += '<li class="warn">&#127760; ' + escHtml(e) + '</li>'; });
      (r.uncaughtExceptions || []).forEach(function(e) { html += '<li>&#10060; ' + escHtml(e) + '</li>'; });
      html += '</ul></div>';
    }

    var els = r.elementResults || [];
    if (els.length > 0) {
      html += '<div><strong style="font-size:12px;color:var(--text-muted);">Elements (' + els.length + ')</strong>';
      html += '<div class="el-grid">';
      els.forEach(function(el) {
        var cls = el.found ? 'found' : 'missing';
        html += '<div class="el-item ' + cls + '">';
        html += '<div class="el-testid">' + escHtml(el.testId) + '</div>';
        html += '<div class="el-purpose">' + escHtml(el.inferredPurpose) + '</div>';
        html += '<div style="margin-top:4px;font-size:11px;">';
        html += (el.found ? '<span style="color:var(--green)">&#10003; found</span>' : '<span style="color:var(--red)">&#10007; missing</span>');
        if (el.interacted) html += ' &middot; <span style="color:var(--text-muted)">interacted</span>';
        html += '</div>';
        if (el.errors && el.errors.length > 0) {
          html += '<div class="el-errors">';
          el.errors.forEach(function(e) { html += '<div class="el-error">&#9888; ' + escHtml(e) + '</div>'; });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    } else if (r.status === 'skip') {
      html += '<div class="text-dim" style="font-size:12px;">Route skipped: ' + escHtml(r.skipReason || '') + '</div>';
    } else {
      html += '<div class="text-dim" style="font-size:12px;">No elements defined in spec for this route.</div>';
    }

    html += '</div>';
    return html;
  }

  function toggleRow(i) {
    var row = document.getElementById('detail-row-' + i);
    if (!row) return;
    var isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : '';
  }

  function renderSpec(spec) {
    specData = spec;
    document.getElementById('spec-summary').textContent = spec.routes ? (spec.routes.length + ' routes, ' + (spec.totalElements || 0) + ' elements') : '—';
    document.getElementById('spec-info').textContent = 'Spec generated: ' + timeAgo(spec.generatedAt);

    if (!spec.routes || spec.routes.length === 0) {
      document.getElementById('spec-container').innerHTML = '<div class="empty-state"><h3>No routes in spec</h3><p>Regenerate the spec to scan for routes.</p></div>';
      return;
    }

    var html = '<table class="route-table"><thead><tr>';
    html += '<th>Route</th><th>Component</th><th>Auth Required</th><th>Elements</th><th>File</th>';
    html += '</tr></thead><tbody>';
    spec.routes.forEach(function(r) {
      html += '<tr>';
      html += '<td class="mono">' + escHtml(r.path) + '</td>';
      html += '<td>' + escHtml(r.component) + '</td>';
      html += '<td>' + (r.requiresAuth ? '<span style="color:var(--yellow)">Yes</span>' : '<span class="text-dim">No</span>') + '</td>';
      html += '<td>' + (r.elements ? r.elements.length : 0) + '</td>';
      html += '<td class="mono text-dim" style="font-size:11px;">' + escHtml(r.filePath || '—') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('spec-container').innerHTML = html;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function setScanning(scanning) {
    var btn = document.getElementById('btn-scan');
    var genBtn = document.getElementById('btn-gen-spec');
    if (scanning) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Scanning...';
      genBtn.disabled = true;
    } else {
      btn.disabled = false;
      btn.innerHTML = '&#9654; Run Scan Now';
      genBtn.disabled = false;
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      await api('/api/sneebly/ui-health/scan', 'POST', { regenerateSpec: false });
      if (scanInterval) clearInterval(scanInterval);
      scanInterval = setInterval(pollStatus, 2000);
    } catch(e) {
      setScanning(false);
      alert('Failed to start scan: ' + e.message);
    }
  }

  async function genSpec() {
    var btn = document.getElementById('btn-gen-spec');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      var result = await api('/api/sneebly/ui-spec/generate', 'POST');
      btn.disabled = false;
      btn.textContent = 'Regenerate Spec';
      if (result && result.success) {
        loadSpec();
      } else {
        alert('Spec generation failed: ' + (result.error || 'unknown error'));
      }
    } catch(e) {
      btn.disabled = false;
      btn.textContent = 'Regenerate Spec';
      alert('Failed: ' + e.message);
    }
  }

  async function pollStatus() {
    try {
      var data = await api('/api/sneebly/ui-health/status', 'GET');
      if (!data.running) {
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        setScanning(false);
        if (data.lastReport) {
          loadReport();
        }
      }
    } catch(e) {}
  }

  async function loadReport() {
    try {
      var data = await api('/api/sneebly/ui-health', 'GET');
      if (data && data.routes) {
        renderReport(data);
      }
    } catch(e) {}
  }

  async function loadSpec() {
    try {
      var data = await api('/api/sneebly/ui-spec', 'GET');
      if (data && data.routes) {
        renderSpec(data);
      }
    } catch(e) {}
  }

  async function checkRunning() {
    try {
      var data = await api('/api/sneebly/ui-health/status', 'GET');
      if (data.running) {
        setScanning(true);
        scanInterval = setInterval(pollStatus, 2000);
      } else {
        setScanning(false);
      }
    } catch(e) {}
  }

  loadReport();
  loadSpec();
  checkRunning();

  ${processBarJs}
</script>
</body>
</html>`;
}
