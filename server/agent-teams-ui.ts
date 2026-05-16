import { getNavCss, getNavHtml, getProcessBarJs } from "./shared-nav";

export function getAgentTeamsHtml(sneeblyKey: string): string {
  const navCss = getNavCss();
  const navHtml = getNavHtml(sneeblyKey, "teams");
  const processBarJs = getProcessBarJs(sneeblyKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Teams — Sneebly</title>
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

    .shell { max-width: 1200px; margin: 0 auto; padding: 24px 20px 60px; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .page-sub { font-size: 12px; color: var(--text-dim); margin-top: 3px; }

    .launch-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 20px 24px; margin-bottom: 28px;
    }
    .launch-title { font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
    .launch-row { display: flex; gap: 10px; }
    .launch-input {
      flex: 1; background: var(--surface-raised); border: 1px solid var(--border-light);
      border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 14px;
      font-family: var(--sans); outline: none; transition: border-color 0.15s;
    }
    .launch-input:focus { border-color: var(--accent); }
    .launch-input::placeholder { color: var(--text-dim); }
    .launch-btn {
      background: var(--accent); color: white; border: none; border-radius: 8px;
      padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s; white-space: nowrap;
    }
    .launch-btn:hover:not(:disabled) { opacity: 0.85; }
    .launch-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .launch-status { font-size: 12px; color: var(--text-dim); margin-top: 8px; min-height: 18px; }

    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .section-title { font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .section-count { font-size: 11px; color: var(--text-dim); background: var(--surface-raised); padding: 2px 8px; border-radius: 10px; }

    .teams-grid { display: flex; flex-direction: column; gap: 14px; margin-bottom: 40px; }

    .team-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
    }
    .team-card-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 16px 20px 12px; border-bottom: 1px solid var(--border);
      gap: 12px;
    }
    .team-goal { font-size: 14px; font-weight: 600; flex: 1; word-break: break-word; }
    .team-meta { font-size: 11px; color: var(--text-dim); margin-top: 3px; }
    .team-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .disband-btn {
      background: var(--red-dim); color: var(--red); border: 1px solid var(--red-border);
      border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600;
      cursor: pointer; transition: background 0.15s;
    }
    .disband-btn:hover { background: rgba(239,68,68,0.2); }

    .team-members { padding: 14px 20px; display: flex; flex-direction: column; gap: 8px; }
    .member-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; border-radius: 8px; background: var(--surface-raised);
      cursor: pointer; transition: background 0.15s;
    }
    .member-row:hover { background: var(--border); }
    .member-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .member-status-dot.pending  { background: var(--text-dim); }
    .member-status-dot.running  { background: var(--blue); animation: pulse 1.2s infinite; }
    .member-status-dot.done     { background: var(--green); }
    .member-status-dot.failed   { background: var(--red); }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
    .member-role { font-size: 13px; font-weight: 600; flex: 1; }
    .member-desc { font-size: 11px; color: var(--text-dim); flex: 2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .member-status-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0; }
    .member-status-label.pending  { color: var(--text-dim); }
    .member-status-label.running  { color: var(--blue); }
    .member-status-label.done     { color: var(--green); }
    .member-status-label.failed   { color: var(--red); }
    .member-expand-icon { color: var(--text-dim); font-size: 11px; flex-shrink: 0; }

    .member-log-panel {
      display: none; padding: 12px 12px 12px 30px;
      border-top: 1px solid var(--border); background: #0d0d14;
    }
    .member-log-panel.open { display: block; }
    .member-log-text {
      font-family: var(--mono); font-size: 11px; color: var(--text-muted);
      white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto;
    }
    .member-log-empty { font-size: 12px; color: var(--text-dim); font-style: italic; }

    .validation-section {
      margin-top: 14px; padding: 12px 20px; border-top: 1px solid var(--border);
    }
    .validation-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.06em; margin-bottom: 6px; }
    .validation-passed { color: var(--green); }
    .validation-failed { color: var(--red); }
    .validation-summary { font-size: 12px; margin-bottom: 4px; }
    .validation-issue { font-size: 11px; color: var(--red); margin-top: 2px; }
    .validation-issue::before { content: '• '; }

    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
      letter-spacing: 0.02em; text-transform: uppercase;
    }
    .badge.assembling { background: var(--yellow-dim); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .badge.running    { background: var(--blue-dim);   color: var(--blue);   border: 1px solid var(--blue-border); }
    .badge.validating { background: var(--purple-dim); color: var(--purple); }
    .badge.disbanded  { background: var(--green-dim);  color: var(--green);  border: 1px solid var(--green-border); }
    .badge.failed     { background: var(--red-dim);    color: var(--red);    border: 1px solid var(--red-border); }

    .empty-state {
      text-align: center; padding: 48px 20px; color: var(--text-dim);
    }
    .empty-icon { font-size: 32px; margin-bottom: 12px; }
    .empty-title { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
    .empty-sub { font-size: 12px; }

    .archive-section { margin-top: 8px; }
  </style>
</head>
<body>
  ${navHtml}
  <div class="shell">
    <div class="page-header">
      <div>
        <div class="page-title">Agent Team Factory</div>
        <div class="page-sub">Spin up a named team of Claude-powered agents to tackle a feature build</div>
      </div>
    </div>

    <div class="launch-card">
      <div class="launch-title">Launch a New Team</div>
      <div class="launch-row">
        <input
          type="text"
          class="launch-input"
          id="goal-input"
          placeholder="Describe the feature to build, e.g. 'Add a notification system with email and in-app alerts'"
          data-testid="input-team-goal"
          onkeydown="if(event.key==='Enter') launchTeam()"
        />
        <button class="launch-btn" id="launch-btn" onclick="launchTeam()" data-testid="button-launch-team">
          Launch Team
        </button>
      </div>
      <div class="launch-status" id="launch-status"></div>
    </div>

    <div id="active-section">
      <div class="section-head">
        <div class="section-title">Active Teams</div>
        <span class="section-count" id="active-count">0</span>
      </div>
      <div class="teams-grid" id="active-teams"></div>
    </div>

    <div class="archive-section" id="archive-section" style="margin-top:32px;">
      <div class="section-head">
        <div class="section-title">Archive</div>
        <span class="section-count" id="archive-count">0</span>
      </div>
      <div class="teams-grid" id="archive-teams"></div>
    </div>
  </div>

  <script>
    ${processBarJs}

    var _key = '${sneeblyKey}';
    var _expandedLogs = {};

    function ts(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    }

    function statusBadge(status) {
      return '<span class="badge ' + status + '">' + status + '</span>';
    }

    function memberStatusDot(status) {
      return '<span class="member-status-dot ' + status + '"></span>';
    }

    function memberStatusLabel(status) {
      return '<span class="member-status-label ' + status + '">' + status + '</span>';
    }

    function renderValidation(vr) {
      if (!vr) return '';
      var cls = vr.passed ? 'validation-passed' : 'validation-failed';
      var issues = (vr.issues || []).map(function(i) { return '<div class="validation-issue">' + escHtml(i) + '</div>'; }).join('');
      return '<div class="validation-section">'
        + '<div class="validation-title ' + cls + '">Validation ' + (vr.passed ? 'Passed ✓' : 'Failed ✗') + '</div>'
        + '<div class="validation-summary">' + escHtml(vr.summary || '') + '</div>'
        + issues
        + '</div>';
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderMember(m, teamId) {
      var logKey = teamId + '__' + m.id;
      var isOpen = _expandedLogs[logKey] ? 'open' : '';
      var hasLog = m.outputLog && m.outputLog.trim().length > 0;
      var logContent = hasLog
        ? '<div class="member-log-text">' + escHtml(m.outputLog) + '</div>'
        : '<div class="member-log-empty">No output yet.</div>';

      return '<div>'
        + '<div class="member-row" onclick="toggleLog(\\'' + escHtml(logKey) + '\\')">'
        + memberStatusDot(m.status)
        + '<div class="member-role">' + escHtml(m.roleName) + '</div>'
        + '<div class="member-desc">' + escHtml(m.roleDescription || '') + '</div>'
        + memberStatusLabel(m.status)
        + '<span class="member-expand-icon">' + (isOpen ? '▲' : '▼') + '</span>'
        + '</div>'
        + '<div class="member-log-panel ' + isOpen + '" id="log-' + escHtml(logKey) + '">'
        + logContent
        + '</div>'
        + '</div>';
    }

    function toggleLog(logKey) {
      _expandedLogs[logKey] = !_expandedLogs[logKey];
      var panel = document.getElementById('log-' + logKey);
      if (panel) panel.classList.toggle('open', !!_expandedLogs[logKey]);
      var rows = document.querySelectorAll('[onclick="toggleLog(\\'' + logKey.replace(/'/g, "\\\\'") + '\\')"]');
      rows.forEach(function(r) {
        var icon = r.querySelector('.member-expand-icon');
        if (icon) icon.textContent = _expandedLogs[logKey] ? '▲' : '▼';
      });
    }

    function renderTeam(t, archived) {
      var members = (t.members || []);
      var membersHtml = members.length > 0
        ? members.map(function(m) { return renderMember(m, t.id); }).join('')
        : '<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">Generating roster...</div>';

      var disbandBtn = (!archived && t.status !== 'disbanded' && t.status !== 'failed')
        ? '<button class="disband-btn" onclick="disbandTeam(\\'' + t.id + '\\')" data-testid="button-disband-' + t.id + '">Disband</button>'
        : '';

      var created = ts(t.createdAt);
      var disbanded = t.disbandedAt ? ' · Disbanded ' + ts(t.disbandedAt) : '';

      return '<div class="team-card" id="team-' + t.id + '">'
        + '<div class="team-card-head">'
        + '<div>'
        + '<div class="team-goal" data-testid="text-team-goal-' + t.id + '">' + escHtml(t.goal) + '</div>'
        + '<div class="team-meta">Created ' + created + disbanded + ' · ' + members.length + ' agent(s)</div>'
        + '</div>'
        + '<div class="team-actions">'
        + statusBadge(t.status)
        + disbandBtn
        + '</div>'
        + '</div>'
        + '<div class="team-members">' + membersHtml + '</div>'
        + (t.validationResult ? renderValidation(t.validationResult) : '')
        + '</div>';
    }

    function renderAll(teams) {
      var active = teams.filter(function(t) { return t.status !== 'disbanded' && t.status !== 'failed'; });
      var archived = teams.filter(function(t) { return t.status === 'disbanded' || t.status === 'failed'; });

      var activeEl = document.getElementById('active-teams');
      var archiveEl = document.getElementById('archive-teams');
      document.getElementById('active-count').textContent = active.length;
      document.getElementById('archive-count').textContent = archived.length;

      if (active.length === 0) {
        activeEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-title">No active teams</div><div class="empty-sub">Launch a team above to get started</div></div>';
      } else {
        activeEl.innerHTML = active.map(function(t) { return renderTeam(t, false); }).join('');
      }

      if (archived.length === 0) {
        archiveEl.innerHTML = '<div class="empty-state" style="padding:24px 20px;"><div class="empty-title">No archived teams yet</div></div>';
      } else {
        archiveEl.innerHTML = archived.map(function(t) { return renderTeam(t, true); }).join('');
      }
    }

    async function loadTeams() {
      try {
        var r = await fetch('/api/sneebly-cc/agent-teams?key=' + _key);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var teams = await r.json();
        renderAll(teams);
      } catch(e) {
        console.error('loadTeams error:', e);
      }
    }

    async function launchTeam() {
      var input = document.getElementById('goal-input');
      var btn = document.getElementById('launch-btn');
      var status = document.getElementById('launch-status');
      var goal = input.value.trim();
      if (!goal) { status.textContent = 'Please enter a build goal.'; return; }

      btn.disabled = true;
      status.textContent = 'Assembling your team...';

      try {
        var r = await fetch('/api/sneebly-cc/agent-teams?key=' + _key, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: goal })
        });
        if (!r.ok) {
          var err = await r.json();
          throw new Error(err.message || 'Failed to create team');
        }
        input.value = '';
        status.textContent = 'Team launched! Agents are assembling...';
        setTimeout(function() { status.textContent = ''; }, 4000);
        loadTeams();
      } catch(e) {
        status.textContent = 'Error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }

    async function disbandTeam(id) {
      if (!confirm('Disband this team? This will stop any running agents.')) return;
      try {
        var r = await fetch('/api/sneebly-cc/agent-teams/' + id + '/disband?key=' + _key, { method: 'POST' });
        if (!r.ok) {
          var err = await r.json();
          alert('Error: ' + (err.message || 'Failed to disband'));
          return;
        }
        loadTeams();
      } catch(e) {
        alert('Error: ' + e.message);
      }
    }

    loadTeams();
    setInterval(loadTeams, 5000);
  </script>
</body>
</html>`;
}
