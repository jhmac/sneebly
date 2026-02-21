export function getCommandCenterHtml(sneeblyKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sneebly Command Center</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #fafafa; --surface: #fff; --border: #e5e5e5;
      --text: #111; --text-muted: #666; --text-dim: #999;
      --accent: #111; --accent-hover: #333;
      --green: #16a34a; --green-bg: #f0fdf4; --green-border: #bbf7d0;
      --red: #dc2626; --red-bg: #fef2f2; --red-border: #fecaca;
      --yellow: #ca8a04; --yellow-bg: #fefce8; --yellow-border: #fef08a;
      --blue: #2563eb; --blue-bg: #eff6ff; --blue-border: #bfdbfe;
      --purple: #7c3aed; --purple-bg: #f5f3ff;
    }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .header-logo { width: 20px; height: 20px; background: var(--accent); border-radius: 50%; }
    .header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
    
    /* Sneebly Nav Styles */
    .sneebly-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; font-size: 12px; }
    .nav-item { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; text-decoration: none; color: var(--text-muted); border: 1px solid transparent; transition: all 0.2s; }
    .nav-item:hover { background: #f0f0f0; color: var(--text); }
    .nav-item.active { background: #fff; border-color: var(--border); color: var(--text); font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .nav-sep { color: var(--text-dim); }
    .nav-icon { width: 4px; height: 4px; border-radius: 50%; background: currentColor; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .grid-full { grid-column: 1 / -1; }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .card-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .card-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }

    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .status-dot.active { background: var(--green); animation: pulse 2s infinite; }
    .status-dot.idle { background: var(--text-dim); }
    .status-dot.error { background: var(--red); }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .toggle-row:last-child { border-bottom: none; }
    .toggle-label { font-size: 13px; font-weight: 500; }
    .toggle-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .toggle-switch { position: relative; width: 40px; height: 22px; cursor: pointer; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: #ddd; border-radius: 11px; transition: 0.2s; }
    .toggle-slider:before { content: ''; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; }
    .toggle-switch input:checked + .toggle-slider { background: var(--green); }
    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); }

    .activity-list { max-height: 400px; overflow-y: auto; }
    .activity-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .activity-item:last-child { border-bottom: none; }
    .activity-time { color: var(--text-dim); white-space: nowrap; min-width: 70px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
    .activity-msg { flex: 1; word-break: break-word; }
    .activity-type { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 500; text-transform: uppercase; white-space: nowrap; }
    .type-success { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
    .type-error { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
    .type-warning { background: var(--yellow-bg); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .type-info { background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border); }
    .type-heartbeat { background: var(--purple-bg); color: var(--purple); border: 1px solid #ddd6fe; }
    .type-thinking { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }

    .progress-bar { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin: 8px 0; }
    .progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.5s; }

    .alert-card { padding: 12px 16px; border-radius: 6px; margin-bottom: 8px; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; }
    .alert-card.pending { background: var(--yellow-bg); border: 1px solid var(--yellow-border); }
    .alert-card.critical { background: var(--red-bg); border: 1px solid var(--red-border); }
    .alert-card.verified { background: var(--green-bg); border: 1px solid var(--green-border); opacity: 0.7; }
    .alert-content { flex: 1; }
    .alert-feature { font-weight: 600; font-size: 13px; }
    .alert-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .alert-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
    .alert-actions { display: flex; gap: 6px; margin-top: 6px; }

    .btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface); font-size: 11px; cursor: pointer; font-weight: 500; transition: all 0.15s; }
    .btn:hover { background: #f5f5f5; }
    .btn-sm { padding: 2px 8px; font-size: 10px; }
    .btn-green { background: var(--green); color: white; border-color: var(--green); }
    .btn-green:hover { background: #15803d; }
    .btn-red { background: var(--red); color: white; border-color: var(--red); }
    .btn-red:hover { background: #b91c1c; }
    .btn-accent { background: var(--accent); color: white; border-color: var(--accent); }
    .btn-accent:hover { background: var(--accent-hover); }

    .phase-indicator { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 13px; }
    .phase-label { font-weight: 600; }
    .phase-detail { color: var(--text-muted); }

    .constraint-box { background: #f9fafb; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin: 8px 0; font-size: 12px; }
    .constraint-title { font-weight: 600; margin-bottom: 4px; }
    .constraint-detail { color: var(--text-muted); }

    .stat-row { display: flex; gap: 16px; margin: 12px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .stat-label { font-size: 11px; color: var(--text-muted); }

    .empty-state { text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px; }

    .steps-timeline { max-height: 300px; overflow-y: auto; }
    .step-item { padding: 6px 0; border-left: 2px solid var(--border); margin-left: 6px; padding-left: 12px; font-size: 12px; }
    .step-item.success { border-color: var(--green); }
    .step-item.error { border-color: var(--red); }
    .step-item.thinking { border-color: var(--purple); }
    .step-msg { margin-bottom: 2px; }
    .step-time { font-size: 10px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; }

    .md-changelog { max-height: 200px; overflow-y: auto; }
    .md-entry { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
    .md-entry:last-child { border-bottom: none; }
    .md-entry-id { font-weight: 600; color: var(--blue); }
    .md-entry-date { color: var(--text-dim); font-size: 11px; }

    .refresh-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 12px; }
    .refresh-btn:hover { color: var(--text); }
    .spinning { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .prompt-box { background: #111; color: #e5e5e5; border-radius: 6px; padding: 14px 16px; font-size: 12px; line-height: 1.6; font-family: 'Inter', sans-serif; position: relative; margin-top: 8px; white-space: pre-wrap; word-break: break-word; }
    .prompt-box .copy-btn { position: absolute; top: 8px; right: 8px; background: #333; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 500; transition: background 0.15s; }
    .prompt-box .copy-btn:hover { background: #555; }
    .prompt-box .copy-btn.copied { background: var(--green); }
    .need-card { padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--border); background: var(--surface); }
    .need-card.pending { border-left: 4px solid var(--yellow); }
    .need-card.fulfilled { border-left: 4px solid var(--green); opacity: 0.6; }
    .need-type-badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; }
    .need-type-database-table, .need-type-schema-change, .need-type-database-push { background: var(--purple-bg); color: var(--purple); border: 1px solid #ddd6fe; }
    .need-type-package-install { background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border); }
    .need-type-secret-setup { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
    .need-type-file-creation, .need-type-api-route { background: var(--yellow-bg); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .need-type-unknown { background: #f5f5f5; color: #666; border: 1px solid #ddd; }

    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo"></div>
      <h1>Sneebly Command Center</h1>
      <div style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
        <span class="subtitle" id="status-text" style="font-size: 13px; color: var(--text-muted);"><span class="status-dot idle"></span>Loading...</span>
        <a href="/" style="font-size: 13px; color: var(--text-muted); text-decoration: none; border: 1px solid var(--border); padding: 4px 10px; border-radius: 4px;">Exit to App</a>
      </div>
    </div>

    <nav class="sneebly-nav">
      <a href="/sneebly/dashboard?key=${sneeblyKey}" class="nav-item">
        <span class="nav-icon"></span>
        Dashboard
      </a>
      <span class="nav-sep">/</span>
      <a href="/sneebly/command-center?key=${sneeblyKey}" class="nav-item active">
        <span class="nav-icon"></span>
        Command Center
      </a>
      <span class="nav-sep">/</span>
      <a href="/sneebly/logs?key=${sneeblyKey}" class="nav-item" onclick="alert('Logs feature coming soon'); return false;">
        <span class="nav-icon"></span>
        System Logs
      </a>
    </nav>

    <div class="grid">
      <!-- ELON Status & Progress -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">ELON Status</span>
          <button class="refresh-btn" onclick="refreshAll()" id="refresh-btn">Refresh</button>
        </div>
        <div id="elon-status">
          <div class="phase-indicator">
            <span class="status-dot idle" id="elon-dot"></span>
            <span class="phase-label" id="elon-phase">Idle</span>
            <span class="phase-detail" id="elon-detail"></span>
          </div>
          <div class="stat-row">
            <div class="stat"><div class="stat-value" id="stat-cycle">0</div><div class="stat-label">Cycle</div></div>
            <div class="stat"><div class="stat-value" id="stat-budget">$0</div><div class="stat-label">Budget</div></div>
            <div class="stat"><div class="stat-value" id="stat-pending">0</div><div class="stat-label">Pending</div></div>
            <div class="stat"><div class="stat-value" id="stat-alerts">0</div><div class="stat-label">Test Alerts</div></div>
            <div class="stat"><div class="stat-value" id="stat-blockers" style="color:var(--red);">0</div><div class="stat-label">Blockers</div></div>
          </div>
          <div id="constraint-box" class="constraint-box" style="display:none;">
            <div class="constraint-title" id="constraint-title"></div>
            <div class="constraint-detail" id="constraint-detail"></div>
          </div>
          <div class="progress-bar" id="budget-bar-container" style="display:none;">
            <div class="progress-fill" id="budget-fill" style="width:0%"></div>
          </div>
          <div style="font-size:11px; color:var(--text-dim); text-align:right;" id="budget-label"></div>
        </div>
      </div>

      <!-- Autonomy System -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Autonomy System</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="card-badge" id="autonomy-badge" style="background:var(--yellow-bg); color:var(--yellow); border:1px solid var(--yellow-border);">Idle</span>
            <button class="btn btn-sm btn-accent" id="autonomy-toggle-btn" onclick="toggleAutonomy()">Start</button>
            <button class="btn btn-sm" onclick="triggerCycle()">Run 1 Cycle</button>
          </div>
        </div>
        <div class="stat-row" style="justify-content:space-around;">
          <div class="stat"><div class="stat-value" id="auto-progress">0%</div><div class="stat-label">Progress</div></div>
          <div class="stat"><div class="stat-value" id="auto-cycle">0</div><div class="stat-label">Cycle</div></div>
          <div class="stat"><div class="stat-value" id="auto-files">0</div><div class="stat-label">Files Changed</div></div>
          <div class="stat"><div class="stat-value" id="auto-errors" style="color:var(--red);">0</div><div class="stat-label">Errors</div></div>
        </div>
        <div id="auto-last-result" style="font-size:12px; color:var(--text-muted); margin-top:8px;"></div>
        <div id="auto-plan-info" style="font-size:12px; margin-top:8px; padding:8px 12px; border-radius:4px; background:var(--blue-bg); border:1px solid var(--blue-border); display:none;"></div>
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Memory (excerpt)</div>
          <pre id="auto-memory" style="font-size:11px; max-height:120px; overflow-y:auto; padding:8px; background:#f5f5f5; border-radius:4px; white-space:pre-wrap; color:var(--text-muted);">Loading...</pre>
        </div>
      </div>

      <!-- LLM Cost Tracking -->
      <div class="card grid-full">
        <div class="card-header">
          <span class="card-title">AI Cost Tracking (Real Token Pricing)</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm" onclick="syncCosts()">Sync Legacy</button>
            <button class="btn btn-sm" onclick="recalcCosts()">Recalculate</button>
          </div>
        </div>
        <div class="stat-row" style="justify-content: space-around;">
          <div class="stat"><div class="stat-value" id="cost-today" style="color:var(--green);">$0.00</div><div class="stat-label">Today</div></div>
          <div class="stat"><div class="stat-value" id="cost-hour">$0.00</div><div class="stat-label">Last Hour</div></div>
          <div class="stat"><div class="stat-value" id="cost-24h">$0.00</div><div class="stat-label">Last 24h</div></div>
          <div class="stat"><div class="stat-value" id="cost-alltime">$0.00</div><div class="stat-label">All Time</div></div>
          <div class="stat"><div class="stat-value" id="cost-actions">0</div><div class="stat-label">API Calls</div></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px;">
          <div>
            <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Cost by Feature</div>
            <div id="cost-by-feature" style="font-size:12px; max-height:140px; overflow-y:auto;">
              <div class="empty-state">No data</div>
            </div>
          </div>
          <div>
            <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Cost by Agent</div>
            <div id="cost-by-agent" style="font-size:12px; max-height:140px; overflow-y:auto;">
              <div class="empty-state">No data</div>
            </div>
          </div>
        </div>
        <div id="cost-by-model" style="margin-top:12px; font-size:12px;"></div>
        <div style="margin-top:12px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Recent AI Calls (with real token counts)</div>
          <div id="cost-entries" style="max-height:250px; overflow-y:auto;">
            <div class="empty-state">No cost data yet</div>
          </div>
        </div>
      </div>

      <!-- Auto-Approval Toggles -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Auto-Approval Settings</span>
          <span class="card-badge" style="background:var(--yellow-bg); color:var(--yellow); border:1px solid var(--yellow-border);">Build Mode</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Toggle which code categories ELON can change without your approval. Useful during early build stages.</p>
        <div id="toggles-container">
          <div class="empty-state">Loading settings...</div>
        </div>
      </div>

      <!-- Skills Manager -->
      <div class="card grid-full">
        <div class="card-header">
          <span class="card-title">Skills Manager</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="card-badge" id="skills-count-badge" style="background:var(--green-bg); color:var(--green); border:1px solid var(--green-border);">0 installed</span>
            <button class="btn btn-sm btn-accent" onclick="showSkillInput()">+ Add Skill</button>
            <button class="btn btn-sm" onclick="refreshSkills()">Refresh</button>
          </div>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Install executable skills that bundle guidance rules + build specs. Skills are reviewed by AI for security before installation.</p>

        <div id="skill-input-area" style="display:none; margin-bottom:16px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:6px;">Paste skill package (JSON or Markdown with \`\`\`spec blocks):</div>
          <textarea id="skill-content-input" style="width:100%; min-height:200px; font-family:'JetBrains Mono',monospace; font-size:12px; padding:12px; border:1px solid var(--border); border-radius:6px; resize:vertical; background:#fafafa;" placeholder='Paste a skill package here. Example JSON format:
{
  "name": "Add User Profiles",
  "version": "1.0.0",
  "author": "you",
  "description": "Adds user profile table and API routes",
  "riskLevel": "medium",
  "guidance": "# User Profiles\\nkeywords: user, profile...",
  "specs": [
    {
      "filePath": "shared/schema.ts",
      "description": "Add profiles table to schema",
      "action": "change",
      "successCriteria": ["profiles table exists in schema.ts"]
    }
  ]
}'></textarea>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn btn-accent" onclick="submitSkill()">Submit for Review</button>
            <button class="btn" onclick="hideSkillInput()">Cancel</button>
          </div>
        </div>

        <div id="skills-container">
          <div class="empty-state">No skills installed yet. Add a skill to get started.</div>
        </div>
      </div>

      <!-- Blocker Alerts -->
      <div class="card grid-full" id="blockers-section" style="display:none;">
        <div class="card-header">
          <span class="card-title">Action Required</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="card-badge" style="background:var(--red-bg); color:var(--red); border:1px solid var(--red-border);" id="blocker-count-badge">0 active</span>
            <button class="btn btn-sm" id="copy-all-blockers-btn" style="display:none; background:var(--red-bg); color:var(--red); border:1px solid var(--red-border);" onclick="copyAllBlockers()">Copy All Instructions</button>
            <button class="btn btn-sm" onclick="refreshBlockers()">Refresh</button>
          </div>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Sneebly got stuck on these tasks and needs your help to continue. Follow the instructions below for each item.</p>
        <div id="blockers-container">
          <div class="empty-state">No blockers</div>
        </div>
      </div>

      <!-- Sneebly Needs Help -->
      <div class="card grid-full" id="needs-section" style="display:none;">
        <div class="card-header">
          <span class="card-title">&#x1F4CB; Sneebly Needs Your Help</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="card-badge" style="background:var(--yellow-bg); color:var(--yellow); border:1px solid var(--yellow-border);" id="needs-count-badge">0 pending</span>
            <button class="btn btn-sm" id="copy-all-needs-btn" style="display:none; background:var(--yellow-bg); color:var(--yellow); border:1px solid var(--yellow-border);" onclick="copyAllNeeds()">Copy All Needs</button>
            <button class="btn btn-sm" onclick="refreshNeeds()">Refresh</button>
          </div>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Sneebly detected it needs something it can't do itself. Copy the prompt below and paste it into <strong>Replit Agent</strong> to get exactly what Sneebly needs.</p>
        <div id="needs-container">
          <div class="empty-state">No pending needs</div>
        </div>
      </div>

      <!-- Human Testing Alerts -->
      <div class="card grid-full">
        <div class="card-header">
          <span class="card-title">Human Testing Required</span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-sm" onclick="addTestAlert()">+ Add Alert</button>
            <button class="btn btn-sm" onclick="refreshAlerts()">Refresh</button>
          </div>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Features and sections that should be manually verified by a human. ELON logs fixes here when it identifies areas needing manual testing.</p>
        <div id="alerts-container">
          <div class="empty-state">No testing alerts yet</div>
        </div>
      </div>

      <!-- ELON Activity Timeline -->
      <div class="card grid-full">
        <div class="card-header">
          <span class="card-title">ELON Activity Timeline</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="activity-filter" onchange="renderActivity()" style="font-size:11px; padding:2px 6px; border:1px solid var(--border); border-radius:4px;">
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="heartbeat">ELON</option>
            </select>
            <span style="font-size:11px; color:var(--text-dim);" id="activity-count"></span>
          </div>
        </div>
        <div class="activity-list" id="activity-list">
          <div class="empty-state">No activity yet</div>
        </div>
      </div>

      <!-- MD File Changelogs -->
      <div class="card grid-full">
        <div class="card-header">
          <span class="card-title">MD File Change History</span>
          <button class="btn btn-sm" onclick="refreshChangelogs()">Refresh</button>
        </div>
        <div id="changelogs-container">
          <div class="empty-state">No MD file changes tracked yet</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_KEY = '${sneeblyKey}';
    const BASE = '/sneebly';
    const CC_BASE = '/api/sneebly-cc';

    const headers = { 'x-sneebly-key': API_KEY, 'Content-Type': 'application/json' };
    let activityData = [];
    let alertsData = [];

    async function apiFetch(url, opts = {}) {
      try {
        const res = await fetch(url, { headers, ...opts });
        if (!res.ok) throw new Error(res.statusText);
        return await res.json();
      } catch (e) {
        console.error('API error:', url, e);
        return null;
      }
    }

    async function refreshElonStatus() {
      const [progress, buildState, pending] = await Promise.all([
        apiFetch(BASE + '/api/elon/progress'),
        apiFetch(BASE + '/api/build-state'),
        apiFetch(BASE + '/api/elon/pending'),
      ]);

      const dot = document.getElementById('elon-dot');
      const phase = document.getElementById('elon-phase');
      const detail = document.getElementById('elon-detail');
      const statusText = document.getElementById('status-text');

      if (progress) {
        dot.className = 'status-dot ' + (progress.running ? 'active' : 'idle');
        phase.textContent = progress.phase || 'idle';
        detail.textContent = progress.running ? 'Cycle ' + progress.cycle + '/' + progress.maxCycles : '';
        statusText.innerHTML = '<span class="status-dot ' + (progress.running ? 'active' : 'idle') + '"></span>' + (progress.running ? 'ELON Running' : 'Idle');

        document.getElementById('stat-cycle').textContent = progress.cycle || '0';
        const spent = progress.budget?.spent || 0;
        const max = progress.budget?.max || 0;
        document.getElementById('stat-budget').textContent = '$' + spent.toFixed(2);

        if (max > 0) {
          document.getElementById('budget-bar-container').style.display = '';
          document.getElementById('budget-fill').style.width = Math.min(100, (spent / max) * 100) + '%';
          document.getElementById('budget-label').textContent = '$' + spent.toFixed(2) + ' / $' + max.toFixed(2);
        }

        if (progress.currentConstraint) {
          document.getElementById('constraint-box').style.display = '';
          document.getElementById('constraint-title').textContent = 'Current Constraint';
          document.getElementById('constraint-detail').textContent = progress.currentConstraint;
        } else if (buildState?.currentConstraint) {
          document.getElementById('constraint-box').style.display = '';
          document.getElementById('constraint-title').textContent = 'Current Constraint';
          document.getElementById('constraint-detail').textContent = buildState.currentConstraint;
        } else {
          document.getElementById('constraint-box').style.display = 'none';
        }

        if (progress.steps && progress.steps.length > 0) {
          renderSteps(progress.steps);
        }
      }

      if (pending) {
        document.getElementById('stat-pending').textContent = (pending.specs || []).length;
      }
    }

    function renderSteps(steps) {
      // Steps are shown in the activity timeline
    }

    async function refreshToggles() {
      const data = await apiFetch(BASE + '/api/elon/settings');
      if (!data || !data.categories) return;

      const container = document.getElementById('toggles-container');
      container.innerHTML = data.categories.map(cat => {
        const descriptions = {
          auth: 'Login, logout, session, OAuth changes',
          security: 'Security, vulnerability, XSS/CSRF fixes',
          permissions: 'Roles, access control, admin privileges',
          database: 'Schema migrations, table changes, indexes',
          payments: 'Stripe, billing, subscriptions, charges',
          deletions: 'Delete, remove, purge operations',
          credentials: 'API keys, secrets, passwords, env vars',
        };
        return '<div class="toggle-row">' +
          '<div><div class="toggle-label">' + cat.label + '</div>' +
          '<div class="toggle-desc">' + (descriptions[cat.id] || cat.keywords.join(', ')) + '</div></div>' +
          '<label class="toggle-switch"><input type="checkbox" ' + (cat.autoApprove ? 'checked' : '') +
          ' onchange="toggleSetting(\\'' + cat.id + '\\', this.checked)"><span class="toggle-slider"></span></label>' +
          '</div>';
      }).join('');
    }

    async function toggleSetting(category, enabled) {
      const body = {};
      body[category] = enabled;
      await apiFetch(BASE + '/api/elon/settings', { method: 'POST', body: JSON.stringify(body) });
    }

    async function refreshAlerts() {
      const data = await apiFetch(CC_BASE + '/human-testing');
      if (!data) return;
      alertsData = data.alerts || [];
      document.getElementById('stat-alerts').textContent = alertsData.filter(a => a.status === 'pending').length;
      renderAlerts();
    }

    function renderAlerts() {
      const container = document.getElementById('alerts-container');
      if (alertsData.length === 0) {
        container.innerHTML = '<div class="empty-state">No testing alerts. ELON will add items here when features need manual verification.</div>';
        return;
      }

      const pendingFirst = [...alertsData].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      container.innerHTML = pendingFirst.map(a => {
        const severityClass = a.severity === 'critical' ? 'critical' : a.status === 'verified' ? 'verified' : 'pending';
        const timeAgo = formatTimeAgo(a.createdAt);
        return '<div class="alert-card ' + severityClass + '">' +
          '<div class="alert-content">' +
          '<div class="alert-feature">' + escHtml(a.feature) + '</div>' +
          '<div class="alert-desc">' + escHtml(a.description) + '</div>' +
          '<div class="alert-meta">' + a.severity.toUpperCase() + ' | ' + a.category + ' | ' + timeAgo + (a.specId ? ' | Spec: ' + a.specId : '') + '</div>' +
          (a.status === 'pending' ? '<div class="alert-actions">' +
            '<button class="btn btn-sm btn-green" onclick="updateAlert(\\'' + a.id + '\\', \\'verified\\')">Verified OK</button>' +
            '<button class="btn btn-sm btn-red" onclick="updateAlert(\\'' + a.id + '\\', \\'failed\\')">Found Issue</button>' +
            '<button class="btn btn-sm" onclick="updateAlert(\\'' + a.id + '\\', \\'dismissed\\')">Dismiss</button>' +
          '</div>' : '<div style="font-size:11px; margin-top:4px; color:var(--text-dim);">Status: ' + a.status + (a.verifiedAt ? ' at ' + new Date(a.verifiedAt).toLocaleString() : '') + '</div>') +
          '</div></div>';
      }).join('');
    }

    async function updateAlert(id, status) {
      await apiFetch(CC_BASE + '/human-testing/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      refreshAlerts();
    }

    async function addTestAlert() {
      const feature = prompt('Feature name (e.g., "User Login Flow"):');
      if (!feature) return;
      const description = prompt('What should be tested?');
      if (!description) return;
      const severity = prompt('Severity (critical/high/medium/low):', 'medium') || 'medium';
      const category = prompt('Category (e.g., auth, ui, database):', 'general') || 'general';

      await apiFetch(CC_BASE + '/human-testing', {
        method: 'POST',
        body: JSON.stringify({ feature, description, severity, category }),
      });
      refreshAlerts();
    }

    async function refreshActivity() {
      const data = await apiFetch(BASE + '/api/live-activity?limit=100');
      if (!data) return;
      activityData = data.activity || [];
      renderActivity();
    }

    function renderActivity() {
      const filter = document.getElementById('activity-filter').value;
      let items = activityData;
      if (filter !== 'all') {
        items = items.filter(a => a.type === filter);
      }

      document.getElementById('activity-count').textContent = items.length + ' entries';
      const container = document.getElementById('activity-list');

      if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">No activity matching filter</div>';
        return;
      }

      container.innerHTML = items.slice(0, 80).map(a => {
        const time = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '--';
        const typeClass = 'type-' + (a.type || 'info');
        return '<div class="activity-item">' +
          '<span class="activity-time">' + time + '</span>' +
          '<span class="activity-type ' + typeClass + '">' + (a.type || 'info') + '</span>' +
          '<span class="activity-msg">' + escHtml(a.message || '') + '</span>' +
          '</div>';
      }).join('');
    }

    async function refreshChangelogs() {
      const data = await apiFetch(CC_BASE + '/changelogs');
      if (!data) return;

      const container = document.getElementById('changelogs-container');
      const files = data.files || {};
      const fileNames = Object.keys(files);

      if (fileNames.length === 0 || fileNames.every(f => files[f].length === 0)) {
        container.innerHTML = '<div class="empty-state">No MD file changes tracked yet. Changes will appear here when ELON specs that modify identity files are approved.</div>';
        return;
      }

      container.innerHTML = fileNames.filter(f => files[f].length > 0).map(fileName => {
        const entries = files[fileName];
        return '<div style="margin-bottom:16px;">' +
          '<div style="font-size:13px; font-weight:600; margin-bottom:6px;">' + escHtml(fileName) + '</div>' +
          '<div class="md-changelog">' + entries.map(e =>
            '<div class="md-entry"><span class="md-entry-id">[' + escHtml(e.specId) + ']</span> ' +
            '<span class="md-entry-date">' + escHtml(e.date) + '</span> - ' + escHtml(e.summary) +
            ' <span style="color:var(--text-dim);">[' + escHtml(e.category) + ']</span></div>'
          ).join('') + '</div></div>';
      }).join('');
    }

    function formatTimeAgo(dateStr) {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hours = Math.floor(mins / 60);
      if (hours < 24) return hours + 'h ago';
      return Math.floor(hours / 24) + 'd ago';
    }

    let costData = null;

    function fmtTokens(n) {
      if (!n) return '0';
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return n.toString();
    }

    function renderBreakdown(containerId, data) {
      var container = document.getElementById(containerId);
      if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<div class="empty-state">No data yet</div>';
        return;
      }
      var sorted = Object.entries(data).sort(function(a, b) { return b[1].cost - a[1].cost; });
      container.innerHTML = sorted.map(function(pair) {
        var name = pair[0]; var info = pair[1];
        var tokens = (info.inputTokens || info.outputTokens)
          ? ' (' + fmtTokens(info.inputTokens) + ' in / ' + fmtTokens(info.outputTokens) + ' out)'
          : '';
        return '<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #f0f0f0;">' +
          '<span style="color:var(--text-muted); max-width:60%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escHtml(name) + '">' + escHtml(name) + '</span>' +
          '<span style="font-weight:600; color:var(--green);">$' + info.cost.toFixed(4) + '<span style="font-weight:400; color:var(--text-dim); font-size:10px;"> ' + info.count + 'x' + tokens + '</span></span>' +
          '</div>';
      }).join('');
    }

    async function refreshCosts() {
      var data = await apiFetch(CC_BASE + '/costs');
      if (!data) return;
      costData = data;

      document.getElementById('cost-today').textContent = '$' + (data.totalToday || 0).toFixed(4);
      document.getElementById('cost-hour').textContent = '$' + (data.totalThisHour || 0).toFixed(4);
      document.getElementById('cost-24h').textContent = '$' + (data.last24h || 0).toFixed(4);
      document.getElementById('cost-alltime').textContent = '$' + (data.totalAllTime || 0).toFixed(4);
      document.getElementById('cost-actions').textContent = data.entriesCount || '0';

      renderBreakdown('cost-by-feature', data.byFeature);
      renderBreakdown('cost-by-agent', data.byAgent);

      var modelContainer = document.getElementById('cost-by-model');
      if (data.byModel && Object.keys(data.byModel).length > 0) {
        modelContainer.innerHTML = '<div style="font-size:12px; font-weight:600; margin-bottom:4px;">Cost by Model</div>' +
          '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
          Object.entries(data.byModel).map(function(pair) {
            var model = pair[0]; var info = pair[1];
            return '<span style="padding:3px 8px; background:#f5f5f5; border-radius:4px; font-size:11px;">' +
              escHtml(model) + ': ' + info.count + ' calls, $' + info.cost.toFixed(4) +
              ' (' + fmtTokens(info.inputTokens) + ' in / ' + fmtTokens(info.outputTokens) + ' out)</span>';
          }).join('') + '</div>';
      }

      var entriesContainer = document.getElementById('cost-entries');
      if (data.recentEntries && data.recentEntries.length > 0) {
        entriesContainer.innerHTML = data.recentEntries.slice(0, 30).map(function(e) {
          var time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '--';
          var tokens = (e.inputTokens || e.outputTokens)
            ? fmtTokens(e.inputTokens) + '/' + fmtTokens(e.outputTokens)
            : 'est.';
          var isReal = (e.inputTokens && e.inputTokens > 0);
          var costColor = isReal ? 'var(--green)' : 'var(--yellow)';
          var label = isReal ? '' : ' (est)';
          return '<div class="activity-item">' +
            '<span class="activity-time">' + time + '</span>' +
            '<span style="font-size:11px; color:' + costColor + '; font-weight:600; min-width:60px;">$' + (e.cost || 0).toFixed(4) + label + '</span>' +
            '<span style="font-size:10px; color:var(--text-dim); min-width:55px;">' + tokens + '</span>' +
            '<span style="font-size:11px; color:var(--text-dim); min-width:50px;">' + escHtml(e.model || '') + '</span>' +
            '<span class="activity-msg">' + escHtml(e.agent || '') + ': ' + escHtml(e.action || '') +
            (e.feature ? ' [' + escHtml(e.feature) + ']' : '') + '</span>' +
            '</div>';
        }).join('');
      } else {
        entriesContainer.innerHTML = '<div class="empty-state">No cost data yet. Costs will appear when AI calls are made with real token tracking.</div>';
      }
    }

    async function syncCosts() {
      await apiFetch(CC_BASE + '/costs/sync', { method: 'POST' });
      refreshCosts();
    }

    async function recalcCosts() {
      var data = await apiFetch(CC_BASE + '/costs/recalculate', { method: 'POST' });
      if (data) {
        alert('Recalculated: ' + data.updated + ' entries updated. Old total: $' + (data.oldTotal || 0).toFixed(4) + ' -> New total: $' + (data.newTotal || 0).toFixed(4));
      }
      refreshCosts();
    }

    let blockersData = [];

    async function refreshBlockers() {
      const data = await apiFetch(CC_BASE + '/blockers');
      if (!data) return;
      blockersData = data.blockers || [];
      const section = document.getElementById('blockers-section');
      const badge = document.getElementById('blocker-count-badge');
      const activeCount = data.activeCount || 0;

      document.getElementById('stat-blockers').textContent = activeCount;
      document.getElementById('stat-blockers').style.color = activeCount > 0 ? 'var(--red)' : 'var(--green)';

      var copyBtn = document.getElementById('copy-all-blockers-btn');
      if (blockersData.length > 0) {
        section.style.display = '';
        badge.textContent = activeCount + ' active';
        badge.style.background = activeCount > 0 ? 'var(--red-bg)' : 'var(--green-bg)';
        badge.style.color = activeCount > 0 ? 'var(--red)' : 'var(--green)';
        badge.style.borderColor = activeCount > 0 ? 'var(--red-border)' : 'var(--green-border)';
        copyBtn.style.display = activeCount > 0 ? '' : 'none';
      } else {
        section.style.display = 'none';
        copyBtn.style.display = 'none';
      }
      renderBlockers();
    }

    function renderBlockers() {
      const container = document.getElementById('blockers-container');
      const active = blockersData.filter(b => b.status === 'active');
      const resolved = blockersData.filter(b => b.status !== 'active');

      if (active.length === 0 && resolved.length === 0) {
        container.innerHTML = '<div class="empty-state">No blockers</div>';
        return;
      }

      let html = '';
      for (const b of active) {
        html += '<div class="alert-card critical" style="flex-direction:column;">';
        html += '<div style="display:flex; align-items:flex-start; gap:10px; width:100%;">';
        html += '<div style="font-size:18px;">&#x1F6D1;</div>';
        html += '<div class="alert-content" style="flex:1;">';
        html += '<div class="alert-feature">' + escHtml(b.targetFile || b.specId) + '</div>';
        html += '<div class="alert-desc">' + escHtml(b.description) + '</div>';
        html += '<div class="alert-meta">Failed ' + b.attempts + ' times | ' + escHtml(b.createdAt?.split('T')[0] || '') + '</div>';
        html += '</div>';
        html += '<div class="alert-actions">';
        html += '<button class="btn btn-green btn-sm" onclick="resolveBlocker(\\'' + b.id + '\\')">Mark Resolved</button>';
        html += '<button class="btn btn-sm" onclick="dismissBlocker(\\'' + b.id + '\\')">Dismiss</button>';
        html += '</div></div>';

        if (b.userInstructions && b.userInstructions.length > 0) {
          html += '<div style="margin-top:10px; padding:10px 14px; background:white; border:1px solid var(--red-border); border-radius:6px; width:100%;">';
          html += '<div style="font-size:12px; font-weight:600; margin-bottom:6px; color:var(--red);">What you need to do:</div>';
          html += '<ol style="font-size:12px; padding-left:18px; margin:0;">';
          for (const inst of b.userInstructions) {
            html += '<li style="margin-bottom:4px;">' + escHtml(inst) + '</li>';
          }
          html += '</ol>';
          if (b.suggestedSkill) {
            html += '<div style="font-size:11px; color:var(--text-dim); margin-top:6px;">Related skill: ' + escHtml(b.suggestedSkill) + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (resolved.length > 0) {
        html += '<details style="margin-top:8px;"><summary style="font-size:12px; color:var(--text-muted); cursor:pointer;">Resolved (' + resolved.length + ')</summary>';
        for (const b of resolved.slice(0, 10)) {
          html += '<div class="alert-card verified" style="margin-top:4px;">';
          html += '<div class="alert-content">';
          html += '<div class="alert-feature" style="font-size:12px;">' + escHtml(b.targetFile || b.specId) + '</div>';
          html += '<div class="alert-desc">' + escHtml(b.description) + '</div>';
          html += '</div></div>';
        }
        html += '</details>';
      }

      container.innerHTML = html;
    }

    function escHtml(s) {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    let needsData = [];

    async function refreshNeeds() {
      const data = await apiFetch(CC_BASE + '/needs');
      if (!data) return;
      needsData = data.needs || [];
      const section = document.getElementById('needs-section');
      const badge = document.getElementById('needs-count-badge');
      const pendingCount = data.pendingCount || 0;

      var needsCopyBtn = document.getElementById('copy-all-needs-btn');
      if (needsData.length > 0) {
        section.style.display = '';
        badge.textContent = pendingCount + ' pending';
        badge.style.background = pendingCount > 0 ? 'var(--yellow-bg)' : 'var(--green-bg)';
        badge.style.color = pendingCount > 0 ? 'var(--yellow)' : 'var(--green)';
        badge.style.borderColor = pendingCount > 0 ? 'var(--yellow-border)' : 'var(--green-border)';
        needsCopyBtn.style.display = pendingCount > 0 ? '' : 'none';
      } else {
        section.style.display = 'none';
        needsCopyBtn.style.display = 'none';
      }
      renderNeeds();
    }

    function renderNeeds() {
      const container = document.getElementById('needs-container');
      const pending = needsData.filter(function(n) { return n.status === 'pending'; });
      const fulfilled = needsData.filter(function(n) { return n.status !== 'pending'; });

      if (pending.length === 0 && fulfilled.length === 0) {
        container.innerHTML = '<div class="empty-state">No needs detected yet. When Sneebly gets stuck needing something from Replit, prompts will appear here.</div>';
        return;
      }

      var html = '';

      for (var i = 0; i < pending.length; i++) {
        var n = pending[i];
        var needId = 'need-prompt-' + i;
        html += '<div class="need-card pending">';
        html += '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">';
        html += '<span class="need-type-badge need-type-' + escHtml(n.type) + '">' + escHtml(n.type.replace(/-/g, ' ')) + '</span>';
        html += '<span style="font-size:14px; font-weight:600;">' + escHtml(n.title) + '</span>';
        html += '</div>';
        html += '<div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">' + escHtml(n.description) + '</div>';
        if (n.context) {
          html += '<div style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">' + escHtml(n.context) + '</div>';
        }
        html += '<div style="font-size:11px; font-weight:600; color:var(--text); margin-bottom:4px;">Copy this prompt into Replit Agent:</div>';
        html += '<div class="prompt-box" id="' + needId + '">';
        html += escHtml(n.replitPrompt);
        html += '<button class="copy-btn" onclick="copyPrompt(\\'' + needId + '\\', this)">Copy</button>';
        html += '</div>';
        html += '<div style="display:flex; gap:8px; margin-top:10px; align-items:center;">';
        html += '<button class="btn btn-green btn-sm" onclick="fulfillNeed(\\'' + n.id + '\\')">Done - Mark Fulfilled</button>';
        html += '<button class="btn btn-sm" onclick="dismissNeed(\\'' + n.id + '\\')">Dismiss</button>';
        html += '<span style="font-size:11px; color:var(--text-dim); margin-left:auto;">' + formatTimeAgo(n.createdAt) + '</span>';
        html += '</div>';
        html += '</div>';
      }

      if (fulfilled.length > 0) {
        html += '<details style="margin-top:8px;"><summary style="font-size:12px; color:var(--text-muted); cursor:pointer;">Completed (' + fulfilled.length + ')</summary>';
        for (var j = 0; j < Math.min(fulfilled.length, 10); j++) {
          var fn = fulfilled[j];
          html += '<div class="need-card fulfilled" style="margin-top:4px;">';
          html += '<div style="display:flex; align-items:center; gap:8px;">';
          html += '<span class="need-type-badge need-type-' + escHtml(fn.type) + '">' + escHtml(fn.type.replace(/-/g, ' ')) + '</span>';
          html += '<span style="font-size:12px;">' + escHtml(fn.title) + '</span>';
          html += '<span style="font-size:11px; color:var(--text-dim); margin-left:auto;">' + escHtml(fn.status) + '</span>';
          html += '</div></div>';
        }
        html += '</details>';
      }

      container.innerHTML = html;
    }

    function copyPrompt(elementId, btn) {
      var el = document.getElementById(elementId);
      if (!el) return;
      var text = el.textContent.replace('Copy', '').replace('Copied!', '').trim();
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    }

    async function fulfillNeed(id) {
      await apiFetch(CC_BASE + '/needs/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'fulfilled' }) });
      refreshNeeds();
    }

    async function dismissNeed(id) {
      await apiFetch(CC_BASE + '/needs/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) });
      refreshNeeds();
    }

    async function resolveBlocker(id) {
      await apiFetch(CC_BASE + '/blockers/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
      refreshBlockers();
    }

    async function dismissBlocker(id) {
      await apiFetch(CC_BASE + '/blockers/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) });
      refreshBlockers();
    }

    function copyAllBlockers() {
      var active = blockersData.filter(function(b) { return b.status === 'active'; });
      if (active.length === 0) { alert('No active blockers to copy.'); return; }
      var seen = {};
      var unique = [];
      for (var i = 0; i < active.length; i++) {
        var key = (active[i].targetFile || '') + '::' + (active[i].description || '').slice(0, 60);
        if (!seen[key]) { seen[key] = true; unique.push(active[i]); }
      }
      var md = '# Sneebly Blocked Tasks - Action Required\\n\\n';
      md += 'Sneebly got stuck on ' + unique.length + ' task(s) and needs Replit Agent to help. Please complete the following:\\n\\n';
      for (var j = 0; j < unique.length; j++) {
        var b = unique[j];
        md += '## ' + (j + 1) + '. ' + (b.targetFile || b.specId || 'Unknown') + '\\n\\n';
        md += '**Description:** ' + (b.description || 'N/A') + '\\n\\n';
        if (b.userInstructions && b.userInstructions.length > 0) {
          md += '**Steps:**\\n';
          for (var k = 0; k < b.userInstructions.length; k++) {
            md += (k + 1) + '. ' + b.userInstructions[k] + '\\n';
          }
        }
        if (b.suggestedSkill) md += '\\n*Related skill: ' + b.suggestedSkill + '*\\n';
        md += '\\n---\\n\\n';
      }
      md += 'After completing all tasks, mark them as resolved in the Sneebly Command Center.\\n';
      navigator.clipboard.writeText(md).then(function() {
        var btn = document.getElementById('copy-all-blockers-btn');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy All Instructions'; }, 2000);
      });
    }

    function copyAllNeeds() {
      var pending = needsData.filter(function(n) { return n.status === 'pending'; });
      if (pending.length === 0) { alert('No pending needs to copy.'); return; }
      var seen = {};
      var unique = [];
      for (var i = 0; i < pending.length; i++) {
        var key = (pending[i].type || '') + '::' + (pending[i].title || '').slice(0, 60);
        if (!seen[key]) { seen[key] = true; unique.push(pending[i]); }
      }
      var md = '# Sneebly Needs Help - Replit Agent Instructions\\n\\n';
      md += 'Sneebly detected ' + unique.length + ' thing(s) it cannot do itself. Please complete the following:\\n\\n';
      for (var j = 0; j < unique.length; j++) {
        var n = unique[j];
        md += '## ' + (j + 1) + '. ' + (n.title || 'Unknown') + '\\n\\n';
        md += '**Type:** ' + (n.type || 'unknown').replace(/-/g, ' ') + '\\n';
        md += '**Priority:** ' + (n.priority || 'medium') + '\\n\\n';
        md += '**Replit Agent Prompt:**\\n> ' + (n.replitPrompt || n.description || 'N/A').replace(/\\n/g, '\\n> ') + '\\n\\n';
        if (n.context) md += '**Context:** ' + n.context + '\\n';
        md += '\\n---\\n\\n';
      }
      md += 'After completing all tasks, mark them as fulfilled in the Sneebly Command Center.\\n';
      navigator.clipboard.writeText(md).then(function() {
        var btn = document.getElementById('copy-all-needs-btn');
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy All Needs'; }, 2000);
      });
    }

    let skillsData = [];

    function showSkillInput() {
      document.getElementById('skill-input-area').style.display = '';
    }

    function hideSkillInput() {
      document.getElementById('skill-input-area').style.display = 'none';
      document.getElementById('skill-content-input').value = '';
    }

    async function submitSkill() {
      var content = document.getElementById('skill-content-input').value.trim();
      if (!content) { alert('Please paste skill content first.'); return; }

      var submitBtn = document.querySelector('#skill-input-area .btn-accent');
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;

      var result = await apiFetch(CC_BASE + '/skills', { method: 'POST', body: JSON.stringify({ content: content }) });
      submitBtn.textContent = 'Submit for Review';
      submitBtn.disabled = false;

      if (result) {
        hideSkillInput();
        refreshSkills();
      } else {
        alert('Failed to submit skill. Check the format.');
      }
    }

    async function refreshSkills() {
      var data = await apiFetch(CC_BASE + '/skills');
      if (!data) return;
      skillsData = data.skills || [];
      var stats = data.stats || {};

      var badge = document.getElementById('skills-count-badge');
      badge.textContent = stats.installed + ' installed';
      if (stats.pending > 0) {
        badge.textContent += ', ' + stats.pending + ' pending';
        badge.style.background = 'var(--yellow-bg)';
        badge.style.color = 'var(--yellow)';
        badge.style.borderColor = 'var(--yellow-border)';
      } else {
        badge.style.background = 'var(--green-bg)';
        badge.style.color = 'var(--green)';
        badge.style.borderColor = 'var(--green-border)';
      }

      renderSkills();
    }

    function renderSkills() {
      var container = document.getElementById('skills-container');
      if (skillsData.length === 0) {
        container.innerHTML = '<div class="empty-state">No skills yet. Click "+ Add Skill" to install your first skill package.</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < skillsData.length; i++) {
        var s = skillsData[i];
        var statusColor = s.status === 'installed' ? 'green' : s.status === 'approved' ? 'blue' : s.status === 'rejected' ? 'red' : s.status === 'vetting' ? 'purple' : 'yellow';
        var statusBg = 'var(--' + statusColor + '-bg)';
        var statusFg = 'var(--' + statusColor + ')';

        html += '<div style="padding:12px 16px; border:1px solid var(--border); border-radius:6px; margin-bottom:8px; background:var(--surface);">';
        html += '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">';
        html += '<span style="font-size:14px; font-weight:600;">' + escHtml(s.name) + '</span>';
        html += '<span style="font-size:11px; color:var(--text-dim);">v' + escHtml(s.version) + '</span>';
        html += '<span style="font-size:11px; color:var(--text-dim);">by ' + escHtml(s.author) + '</span>';
        html += '<span style="font-size:10px; padding:2px 8px; border-radius:10px; font-weight:600; text-transform:uppercase; background:' + statusBg + '; color:' + statusFg + '; border:1px solid ' + statusFg + '30;">' + escHtml(s.status) + '</span>';

        var riskColor = s.riskLevel === 'low' ? 'var(--green)' : s.riskLevel === 'high' ? 'var(--red)' : 'var(--yellow)';
        html += '<span style="font-size:10px; color:' + riskColor + '; font-weight:500;">risk: ' + escHtml(s.riskLevel) + '</span>';
        html += '<span style="font-size:11px; color:var(--text-dim); margin-left:auto;">' + formatTimeAgo(s.createdAt) + '</span>';
        html += '</div>';

        html += '<div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">' + escHtml(s.description) + '</div>';

        if (s.specsQueued > 0) {
          html += '<div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">' + s.specsQueued + ' executable spec(s) bundled</div>';
        }

        if (s.vetResult) {
          var vet = s.vetResult;
          var vetIcon = vet.safe ? '&#x2705;' : '&#x26A0;&#xFE0F;';
          html += '<div style="padding:8px 12px; border-radius:4px; margin-bottom:8px; font-size:12px; background:' + (vet.safe ? 'var(--green-bg)' : 'var(--yellow-bg)') + '; border:1px solid ' + (vet.safe ? 'var(--green-border)' : 'var(--yellow-border)') + ';">';
          html += '<div style="font-weight:600;">' + vetIcon + ' AI Review: ' + escHtml(vet.summary) + '</div>';
          html += '<div style="font-size:11px; color:var(--text-dim);">Risk Score: ' + vet.riskScore + '/10 | Model: ' + escHtml(vet.model) + ' | ' + escHtml(vet.reviewedAt?.split('T')[0] || '') + '</div>';

          if (vet.concerns && vet.concerns.length > 0) {
            html += '<div style="margin-top:4px; font-size:11px;"><strong>Concerns:</strong><ul style="margin:2px 0 0 16px; padding:0;">';
            for (var c = 0; c < vet.concerns.length; c++) {
              html += '<li>' + escHtml(vet.concerns[c]) + '</li>';
            }
            html += '</ul></div>';
          }
          if (vet.recommendations && vet.recommendations.length > 0) {
            html += '<div style="margin-top:4px; font-size:11px;"><strong>Recommendations:</strong><ul style="margin:2px 0 0 16px; padding:0;">';
            for (var r = 0; r < vet.recommendations.length; r++) {
              html += '<li>' + escHtml(vet.recommendations[r]) + '</li>';
            }
            html += '</ul></div>';
          }
          html += '</div>';
        } else if (s.status === 'vetting') {
          html += '<div style="padding:8px 12px; border-radius:4px; margin-bottom:8px; font-size:12px; background:var(--purple-bg); border:1px solid #ddd6fe;">&#x1F50D; AI review in progress...</div>';
        }

        if (s.status === 'approved' || s.status === 'pending-review') {
          html += '<div style="display:flex; gap:8px;">';
          html += '<button class="btn btn-green btn-sm" onclick="doInstallSkill(\\'' + s.id + '\\')">Install Skill</button>';
          html += '<button class="btn btn-red btn-sm" onclick="doRejectSkill(\\'' + s.id + '\\')">Reject</button>';
          html += '</div>';
        }
        html += '</div>';
      }

      container.innerHTML = html;
    }

    async function doInstallSkill(id) {
      var result = await apiFetch(CC_BASE + '/skills/' + id + '/install', { method: 'POST' });
      if (result) {
        refreshSkills();
      }
    }

    async function doRejectSkill(id) {
      if (!confirm('Reject this skill? It will not be installed.')) return;
      await apiFetch(CC_BASE + '/skills/' + id + '/reject', { method: 'POST' });
      refreshSkills();
    }

    var autonomyRunning = false;

    async function refreshAutonomy() {
      var state = await apiFetch(CC_BASE + '/autonomy/state');
      if (!state) return;

      autonomyRunning = state.running;
      document.getElementById('auto-progress').textContent = (state.completionPercent || 0) + '%';
      document.getElementById('auto-cycle').textContent = state.currentCycle || 0;
      document.getElementById('auto-files').textContent = (state.filesModified || []).length;
      document.getElementById('auto-errors').textContent = (state.errors || []).length;

      var badge = document.getElementById('autonomy-badge');
      var btn = document.getElementById('autonomy-toggle-btn');
      if (state.running && !state.paused) {
        badge.textContent = 'Running';
        badge.style.background = 'var(--green-bg)';
        badge.style.color = 'var(--green)';
        badge.style.borderColor = 'var(--green-border)';
        btn.textContent = 'Stop';
      } else if (state.paused) {
        badge.textContent = 'Paused';
        badge.style.background = 'var(--yellow-bg)';
        badge.style.color = 'var(--yellow)';
        badge.style.borderColor = 'var(--yellow-border)';
        btn.textContent = 'Resume';
      } else {
        badge.textContent = 'Idle';
        badge.style.background = 'var(--yellow-bg)';
        badge.style.color = 'var(--yellow)';
        badge.style.borderColor = 'var(--yellow-border)';
        btn.textContent = 'Start';
      }

      var resultEl = document.getElementById('auto-last-result');
      if (state.lastCycleResult) {
        resultEl.textContent = 'Last cycle: ' + state.lastCycleResult + (state.lastCycleTime ? ' (' + formatTimeAgo(state.lastCycleTime) + ')' : '');
      }

      var planData = await apiFetch(CC_BASE + '/plan');
      var planEl = document.getElementById('auto-plan-info');
      if (planData && planData.goal) {
        var doneSteps = (planData.steps || []).filter(function(s) { return s.status === 'done'; }).length;
        var totalSteps = (planData.steps || []).length;
        planEl.innerHTML = '<strong>Current Plan:</strong> ' + escHtml(planData.goal) + ' (' + doneSteps + '/' + totalSteps + ' steps done)';
        planEl.style.display = 'block';
      } else {
        planEl.style.display = 'none';
      }

      var memData = await apiFetch(CC_BASE + '/memory');
      if (memData && memData.content) {
        var lines = memData.content.split('\\n').slice(0, 20).join('\\n');
        document.getElementById('auto-memory').textContent = lines + '\\n...';
      }
    }

    async function toggleAutonomy() {
      if (autonomyRunning) {
        await apiFetch(CC_BASE + '/autonomy/stop', { method: 'POST' });
      } else {
        await apiFetch(CC_BASE + '/autonomy/start', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({intervalMs: 120000}) });
      }
      refreshAutonomy();
    }

    async function triggerCycle() {
      var btn = event.target;
      btn.textContent = 'Running...';
      btn.disabled = true;
      try {
        var result = await apiFetch(CC_BASE + '/autonomy/trigger', { method: 'POST' });
        if (result) {
          document.getElementById('auto-last-result').textContent = 'Manual cycle: ' + (result.result || 'done');
        }
      } finally {
        btn.textContent = 'Run 1 Cycle';
        btn.disabled = false;
        refreshAutonomy();
      }
    }

    async function refreshAll() {
      const btn = document.getElementById('refresh-btn');
      btn.innerHTML = '<span class="spinning">&#8635;</span>';
      await Promise.all([refreshElonStatus(), refreshToggles(), refreshAlerts(), refreshBlockers(), refreshNeeds(), refreshSkills(), refreshActivity(), refreshChangelogs(), refreshCosts(), refreshAutonomy()]);
      btn.textContent = 'Refresh';
    }

    refreshAll();
    setInterval(() => {
      refreshElonStatus();
      refreshActivity();
      refreshAlerts();
      refreshBlockers();
      refreshNeeds();
      refreshSkills();
      refreshCosts();
      refreshAutonomy();
    }, 5000);
  </script>
</body>
</html>`;
}
