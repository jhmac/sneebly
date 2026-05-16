export function getNavCss(): string {
  return `
    .topbar {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; gap: 12px;
      padding: 10px 20px; background: rgba(10,10,15,0.92);
      backdrop-filter: blur(16px); border-bottom: 1px solid var(--border);
    }
    .topbar-logo {
      width: 28px; height: 28px; border-radius: 8px;
      background: linear-gradient(135deg, var(--accent, #6366f1), var(--purple, #a855f7));
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px; color: white; flex-shrink: 0;
    }
    .topbar-title { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
    .topbar-nav { display: flex; gap: 3px; margin-left: 16px; }
    .topbar-nav a {
      font-size: 12px; color: var(--text-dim, #6b7280); text-decoration: none;
      padding: 5px 12px; border-radius: 6px; transition: all 0.15s; white-space: nowrap;
    }
    .topbar-nav a:hover { color: var(--text-muted, #9ca3af); background: var(--surface, #1a1a2e); }
    .topbar-nav a.active { color: var(--text, #e5e7eb); background: var(--surface-raised, #252540); }
    .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .topbar-link {
      font-size: 12px; color: var(--text-dim, #6b7280); text-decoration: none;
      padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border, #2a2a3e);
      transition: all 0.15s; white-space: nowrap;
    }
    .topbar-link:hover { color: var(--text, #e5e7eb); border-color: var(--border-light, #3a3a50); background: var(--surface, #1a1a2e); }

    .process-bar {
      position: sticky; top: 48px; z-index: 99;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 5px 20px; background: rgba(15,15,20,0.92);
      backdrop-filter: blur(12px); border-bottom: 1px solid var(--border, #2a2a3e);
      font-size: 12px; min-height: 28px;
    }
    .process-bar-label {
      color: var(--text-dim, #6b7280); font-weight: 600; font-size: 10px;
      text-transform: uppercase; letter-spacing: 0.06em; margin-right: 2px;
    }
    .proc-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 2px 9px 2px 7px; border-radius: 10px;
      font-size: 11px; font-weight: 500; border: 1px solid var(--border, #2a2a3e);
    }
    .proc-chip.running { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.35); color: #10b981; }
    .proc-chip.stopped { background: rgba(100,100,120,0.06); color: var(--text-dim, #6b7280); }
    .proc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .proc-dot.on { background: #10b981; box-shadow: 0 0 5px #10b981; }
    .proc-dot.off { background: var(--text-dim, #6b7280); }
    .proc-btn {
      background: none; border: none; cursor: pointer;
      font-size: 10px; padding: 1px 5px; border-radius: 4px;
      font-weight: 600; margin-left: 1px; transition: background 0.15s;
    }
    .proc-btn.stop { color: #ef4444; }
    .proc-btn.stop:hover { background: rgba(239,68,68,0.15); }
    .proc-btn.start { color: #10b981; }
    .proc-btn.start:hover { background: rgba(16,185,129,0.15); }
    .proc-bar-empty { color: var(--text-dim, #6b7280); font-style: italic; font-size: 11px; }
  `;
}

export function getNavHtml(sneeblyKey: string, activePage: string): string {
  const pages = [
    { id: "overview", label: "Overview", path: "/sneebly/command-center" },
    { id: "chat", label: "Chat", path: "/sneebly/chat" },
    { id: "teams", label: "Agent Teams", path: "/sneebly/teams" },
    { id: "budget", label: "Budget", path: "/sneebly/budget" },
    { id: "logs", label: "Logs", path: "/sneebly/logs" },
  ];

  const navLinks = pages
    .map(p => `<a href="${p.path}?key=${sneeblyKey}"${p.id === activePage ? ' class="active"' : ''}>${p.label}</a>`)
    .join("\n      ");

  return `
  <div class="topbar">
    <div class="topbar-logo">S</div>
    <span class="topbar-title">Sneebly</span>
    <div class="topbar-nav">
      ${navLinks}
    </div>
    <div class="topbar-right">
      <a href="/" class="topbar-link">Exit to App</a>
    </div>
  </div>

  <div class="process-bar" id="process-bar">
    <span class="process-bar-label">Processes</span>
    <span class="proc-bar-empty">Loading...</span>
  </div>`;
}

export function getProcessBarJs(sneeblyKey: string): string {
  return `
    var _procKey = '${sneeblyKey}';
    async function _procApi(endpoint, method, body) {
      var opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      var sep = endpoint.includes('?') ? '&' : '?';
      var r = await fetch('/api/sneebly-cc' + endpoint + sep + 'key=' + _procKey, opts);
      return r.json();
    }

    async function refreshProcesses() {
      try {
        var data = await _procApi('/processes');
        var bar = document.getElementById('process-bar');
        if (!data || !data.processes) {
          bar.innerHTML = '<span class="process-bar-label">Processes</span><span class="proc-bar-empty">Unavailable</span>';
          return;
        }
        var html = '<span class="process-bar-label">Processes</span>';
        var anyRunning = false;
        for (var i = 0; i < data.processes.length; i++) {
          var p = data.processes[i];
          var isOn = p.status === 'running' || p.status === 'pending';
          var isPaused = p.status === 'paused';
          if (isOn || isPaused) anyRunning = true;
          var chipClass = (isOn || isPaused) ? 'running' : 'stopped';
          var dotClass = (isOn || isPaused) ? 'on' : 'off';
          html += '<span class="proc-chip ' + chipClass + '">';
          html += '<span class="proc-dot ' + dotClass + '"></span>';
          html += '<span>' + p.name;
          if (p.detail) html += ' <span style="opacity:0.65;font-size:10px;">(' + p.detail + ')</span>';
          if (isPaused) html += ' <span style="opacity:0.7;font-size:10px;">[paused]</span>';
          html += '</span>';
          if (isOn || isPaused) {
            html += '<button class="proc-btn stop" onclick="stopProcess(\\'' + p.id + '\\')" title="Stop">\\u25A0 Stop</button>';
          } else {
            html += '<button class="proc-btn start" onclick="startProcess(\\'' + p.id + '\\')" title="Start">\\u25B6</button>';
          }
          html += '</span>';
        }
        if (!anyRunning) {
          html += '<span class="proc-bar-empty">All stopped</span>';
        }
        bar.innerHTML = html;
        return anyRunning;
      } catch(e) {
        console.log('refreshProcesses error:', e);
        return false;
      }
    }

    async function stopProcess(id) {
      await _procApi('/processes/' + id + '/stop', 'POST');
      setTimeout(refreshProcesses, 500);
    }

    async function startProcess(id) {
      await _procApi('/processes/' + id + '/start', 'POST');
      setTimeout(refreshProcesses, 500);
    }

    refreshProcesses();
    setInterval(refreshProcesses, 5000);
  `;
}
