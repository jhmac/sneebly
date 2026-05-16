import { getNavCss, getNavHtml, getProcessBarJs } from "./shared-nav";

export function getChatHtml(sneeblyKey: string): string {
  const navCss = getNavCss();
  const navHtml = getNavHtml(sneeblyKey, "chat");
  const processBarJs = getProcessBarJs(sneeblyKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sneebly Chat</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0a0a0f; --surface: #12121a; --surface-raised: #1a1a25;
      --border: #252530; --border-light: #2a2a38;
      --text: #e8e8ed; --text-muted: #8888a0; --text-dim: #55556a;
      --accent: #6366f1; --accent-glow: rgba(99,102,241,0.15); --accent-hover: #5558e6;
      --green: #22c55e; --green-dim: rgba(34,197,94,0.12);
      --red: #ef4444; --red-dim: rgba(239,68,68,0.12);
      --yellow: #eab308; --yellow-dim: rgba(234,179,8,0.12);
      --blue: #3b82f6; --blue-dim: rgba(59,130,246,0.12);
      --purple: #a855f7; --purple-dim: rgba(168,85,247,0.12);
      --orange: #f97316; --orange-dim: rgba(249,115,22,0.12);
      --mono: 'JetBrains Mono', monospace;
      --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    html, body { height: 100%; overflow: hidden; }
    body { font-family: var(--sans); background: var(--bg); color: var(--text); }

    .layout { display: flex; flex-direction: column; height: 100vh; }

    .bottom-bar {
      flex-shrink: 0; border-top: 1px solid var(--border);
      background: var(--surface); transition: max-height 0.3s ease;
      max-height: 36px; overflow: hidden;
    }
    .bottom-bar.expanded { max-height: 260px; }
    .bottom-tabs {
      display: flex; align-items: center; gap: 2px;
      padding: 4px 12px; border-bottom: 1px solid var(--border);
    }
    .bottom-tab {
      font-size: 11px; padding: 4px 12px; border-radius: 4px;
      border: none; background: transparent; color: var(--text-dim);
      cursor: pointer; font-family: var(--sans); transition: all 0.15s;
    }
    .bottom-tab:hover { color: var(--text-muted); }
    .bottom-tab.active { color: var(--text); background: var(--surface-raised); }
    .btab-count {
      font-size: 10px; background: var(--accent); color: white;
      padding: 1px 5px; border-radius: 8px; margin-left: 4px;
    }
    .bottom-toggle {
      margin-left: auto; border: none; background: transparent;
      color: var(--text-dim); cursor: pointer; font-size: 12px;
      padding: 4px 8px; transition: transform 0.3s;
    }
    .bottom-bar.expanded .bottom-toggle { transform: rotate(180deg); }
    .bottom-content { padding: 8px 12px; overflow-y: auto; max-height: 220px; }
    .bottom-panel { display: block; }
    .bp-loading { font-size: 11px; color: var(--text-dim); padding: 8px; }

    .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
    .team-card {
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px; font-size: 11px;
    }
    .team-card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .team-card-name { font-weight: 600; font-size: 12px; }
    .team-card-status {
      font-size: 9px; padding: 2px 6px; border-radius: 4px;
      text-transform: uppercase; font-weight: 600;
    }
    .team-card-status.idle { background: var(--blue-dim); color: var(--blue); }
    .team-card-status.planning { background: var(--yellow-dim); color: var(--yellow); }
    .team-card-status.working { background: var(--green-dim); color: var(--green); }
    .team-card-status.done { background: rgba(99,102,241,0.12); color: var(--accent); }
    .team-card-status.failed { background: var(--red-dim); color: var(--red); }
    .team-card-goal { color: var(--text-muted); margin-bottom: 4px; }
    .team-card-stats { display: flex; gap: 8px; color: var(--text-dim); font-size: 10px; }

    .expense-summary {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px;
    }
    .expense-card {
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px;
    }
    .expense-card-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; }
    .expense-card-value { font-size: 18px; font-weight: 700; margin-top: 2px; font-family: var(--mono); }
    .expense-card-sub { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
    .budget-bar { height: 4px; background: var(--border); border-radius: 2px; margin-top: 6px; overflow: hidden; }
    .budget-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

    .snapshot-list { display: flex; flex-direction: column; gap: 4px; }
    .snapshot-row {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px;
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 6px; font-size: 11px;
    }
    .snapshot-label { font-weight: 600; flex: 1; }
    .snapshot-time { color: var(--text-dim); font-size: 10px; }
    .snapshot-btn {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      border: 1px solid var(--red-border); background: var(--red-dim);
      color: var(--red); cursor: pointer; font-family: var(--sans);
    }
    .snapshot-btn:hover { background: rgba(239,68,68,0.2); }

    .no-data { font-size: 11px; color: var(--text-dim); padding: 12px; text-align: center; }

    ${navCss}
    .topbar { flex-shrink: 0; position: relative; }
    .process-bar { position: relative; top: auto; flex-shrink: 0; }

    .panels { display: flex; flex: 1; overflow: hidden; }

    .panel {
      flex: 1; display: flex; flex-direction: column;
      border-right: 1px solid var(--border); position: relative;
    }
    .panel:last-child { border-right: none; }

    .panel-head {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 18px; border-bottom: 1px solid var(--border);
      background: var(--surface); flex-shrink: 0;
    }
    .panel-icon { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .panel-label { font-size: 13px; font-weight: 600; }
    .panel-desc { font-size: 11px; color: var(--text-dim); margin-left: 4px; }
    .panel-actions { margin-left: auto; display: flex; gap: 6px; }
    .panel-btn {
      font-size: 10px; padding: 3px 10px; border-radius: 4px;
      border: 1px solid var(--border); background: transparent;
      color: var(--text-dim); cursor: pointer; font-family: var(--sans);
      transition: all 0.15s;
    }
    .panel-btn:hover { color: var(--text-muted); border-color: var(--border-light); }

    .chat-area {
      flex: 1; overflow-y: auto; padding: 16px 18px;
      display: flex; flex-direction: column; gap: 12px;
    }

    .msg { max-width: 85%; animation: fadeIn 0.2s ease-out; }
    .msg.no-animate { animation: none; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .msg.user { align-self: flex-end; }
    .msg.assistant { align-self: flex-start; }

    .msg-bubble {
      padding: 12px 16px; border-radius: 12px; font-size: 13px;
      line-height: 1.6; word-break: break-word;
    }
    .msg.user .msg-bubble {
      background: var(--accent); color: white; border-bottom-right-radius: 4px;
    }
    .msg.assistant .msg-bubble {
      background: var(--surface-raised); color: var(--text);
      border: 1px solid var(--border); border-bottom-left-radius: 4px;
    }
    .msg.error .msg-bubble {
      background: var(--red-dim); color: var(--red);
      border: 1px solid rgba(239,68,68,0.3); border-bottom-left-radius: 4px;
    }
    .msg-meta { font-size: 10px; color: var(--text-dim); margin-top: 4px; padding: 0 4px; }
    .msg.user .msg-meta { text-align: right; }

    .msg-bubble pre {
      background: #0d0d14; border: 1px solid var(--border); border-radius: 6px;
      padding: 10px 14px; margin: 8px 0; overflow-x: auto;
      font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap;
    }
    .msg-bubble code {
      font-family: var(--mono); font-size: 12px;
      background: rgba(99,102,241,0.1); padding: 2px 5px; border-radius: 3px;
    }
    .msg-bubble pre code { background: none; padding: 0; }
    .msg-bubble p { margin: 6px 0; }
    .msg-bubble p:first-child { margin-top: 0; }
    .msg-bubble p:last-child { margin-bottom: 0; }
    .msg-bubble ul, .msg-bubble ol { padding-left: 20px; margin: 6px 0; }
    .msg-bubble li { margin: 3px 0; }
    .msg-bubble strong { font-weight: 600; }
    .msg-bubble h1, .msg-bubble h2, .msg-bubble h3 {
      font-size: 14px; font-weight: 700; margin: 12px 0 6px; color: var(--text);
    }

    .input-area {
      padding: 12px 18px; border-top: 1px solid var(--border);
      background: var(--surface); flex-shrink: 0;
    }
    .input-row { display: flex; gap: 8px; align-items: flex-end; }
    .input-field {
      flex: 1; padding: 10px 14px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); font-size: 13px; font-family: var(--sans);
      resize: none; outline: none; transition: border-color 0.15s;
      min-height: 42px; max-height: 120px; line-height: 1.5;
    }
    .input-field:focus { border-color: var(--accent); }
    .input-field::placeholder { color: var(--text-dim); }
    .send-btn {
      padding: 10px 18px; border-radius: 8px; border: none;
      background: var(--accent); color: white; font-size: 13px;
      font-weight: 600; cursor: pointer; font-family: var(--sans);
      transition: all 0.15s; flex-shrink: 0; height: 42px;
    }
    .send-btn:hover { background: var(--accent-hover); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .attach-btn {
      padding: 0; width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid var(--border);
      background: transparent; color: var(--text-muted); font-size: 20px; font-weight: 300;
      cursor: pointer; flex-shrink: 0; transition: all 0.15s; align-self: flex-end; margin-bottom: 3px;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .attach-btn:hover { background: rgba(255,255,255,0.06); color: var(--text); border-color: var(--accent); }
    .attach-btn:active { transform: scale(0.9); }
    .attach-menu-wrap { position: relative; flex-shrink: 0; align-self: flex-end; margin-bottom: 3px; }
    .attach-menu {
      position: absolute; bottom: calc(100% + 8px); left: 0;
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      min-width: 210px; overflow: hidden; z-index: 200;
      animation: menuIn 0.12s ease;
    }
    @keyframes menuIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .attach-menu-item {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 11px 16px; border: none; background: transparent;
      color: var(--text); font-size: 13px; cursor: pointer;
      text-align: left; font-family: var(--sans); transition: background 0.1s;
    }
    .attach-menu-item:hover { background: rgba(255,255,255,0.06); }
    .attach-menu-item:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.05); }
    .attach-menu-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
    .attach-chip {
      display: flex; align-items: center; gap: 6px;
      background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3);
      border-radius: 6px; padding: 4px 10px; font-size: 11px; color: var(--accent);
      max-width: 100%; margin-bottom: 6px;
    }
    .attach-chip-remove {
      background: none; border: none; color: var(--text-muted); cursor: pointer;
      font-size: 14px; padding: 0 0 0 4px; line-height: 1; flex-shrink: 0;
    }
    .send-btn.loading { position: relative; color: transparent; }
    .send-btn.loading::after {
      content: ''; position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; margin: auto;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
      border-radius: 50%; animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .typing-indicator {
      display: none; align-self: flex-start; padding: 12px 16px;
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 12px; border-bottom-left-radius: 4px; max-width: 85%;
    }
    .typing-indicator.visible { display: flex; gap: 4px; align-items: center; }
    .typing-label { font-size: 11px; color: var(--text-dim); margin-right: 6px; }
    .typing-dot {
      width: 5px; height: 5px; border-radius: 50%; background: var(--text-dim);
      animation: typingBounce 1.4s ease-in-out infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    /* Step cards shown during tool use */
    .step-group {
      align-self: flex-start; display: flex; flex-direction: column; gap: 4px;
      max-width: 90%; animation: fadeIn 0.15s ease;
    }
    .step-card {
      font-size: 11px; padding: 7px 11px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--surface-raised);
      font-family: var(--mono); display: flex; align-items: flex-start; gap: 8px;
    }
    .step-card.running { border-color: var(--blue-border); background: rgba(59,130,246,0.07); }
    .step-card.ok { border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.05); }
    .step-card.fail { border-color: var(--red-border); background: var(--red-dim); }
    .step-icon { flex-shrink: 0; font-size: 11px; margin-top: 1px; }
    .step-content { overflow: hidden; }
    .step-cmd { font-weight: 600; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .step-preview { color: var(--text-dim); font-size: 10px; margin-top: 2px; white-space: pre-wrap; word-break: break-all; max-height: 48px; overflow: hidden; }
    .step-spinner {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
      border: 2px solid var(--blue); border-top-color: transparent;
      animation: spin 0.7s linear infinite;
    }

    /* Rollback card appended after a reply when files were changed */
    .rollback-card {
      align-self: flex-start; max-width: 88%; margin-top: 4px;
      font-size: 11px; padding: 9px 13px;
      background: rgba(249,115,22,0.07); border: 1px solid rgba(249,115,22,0.3);
      border-radius: 10px; display: flex; align-items: center; gap: 10px;
      animation: fadeIn 0.2s ease;
    }
    .rollback-icon { font-size: 14px; flex-shrink: 0; }
    .rollback-text { flex: 1; color: var(--text-muted); line-height: 1.4; }
    .rollback-text strong { color: var(--orange, #f97316); display: block; margin-bottom: 1px; }
    .rollback-btn {
      font-size: 10px; padding: 4px 10px; border-radius: 5px; cursor: pointer;
      background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.4);
      color: #f97316; font-family: var(--sans); font-weight: 600;
      white-space: nowrap; transition: background 0.15s;
    }
    .rollback-btn:hover { background: rgba(249,115,22,0.28); }
    .rollback-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .welcome {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; flex: 1; text-align: center; padding: 40px;
    }
    .welcome-icon {
      width: 48px; height: 48px; border-radius: 14px; margin-bottom: 16px;
      display: flex; align-items: center; justify-content: center; font-size: 22px;
    }
    .welcome h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .welcome p { font-size: 12px; color: var(--text-muted); max-width: 320px; line-height: 1.5; }
    .welcome-suggestions {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px;
      justify-content: center; max-width: 400px;
    }
    .suggestion-chip {
      font-size: 11px; padding: 6px 12px; border-radius: 20px;
      border: 1px solid var(--border); background: var(--surface-raised);
      color: var(--text-muted); cursor: pointer; font-family: var(--sans);
      transition: all 0.15s; text-align: left;
    }
    .suggestion-chip:hover {
      border-color: var(--accent); color: var(--accent); background: var(--accent-glow);
    }

    .cost-tag {
      font-family: var(--mono); font-size: 10px; color: var(--text-dim);
      background: var(--surface-raised); padding: 1px 6px; border-radius: 3px;
    }

    /* === LIVE ACTIVITY FEED === */
    .activity-card {
      align-self: stretch; max-width: 100%;
      border: 1px solid var(--border); border-radius: 10px;
      overflow: hidden; animation: fadeIn 0.3s ease-out;
    }
    .activity-card.no-animate { animation: none; }
    .activity-header {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; background: var(--surface);
      cursor: pointer; user-select: none;
    }
    .activity-header:hover { background: var(--surface-raised); }
    .activity-pulse {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: var(--text-dim);
    }
    .activity-pulse.running {
      background: var(--green);
      box-shadow: 0 0 6px rgba(34,197,94,0.5);
      animation: pulse-glow 2s ease-in-out infinite;
    }
    .activity-pulse.error { background: var(--red); }
    .activity-pulse.paused { background: var(--yellow); }
    @keyframes pulse-glow { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
    .activity-title { font-size: 12px; font-weight: 600; flex: 1; }
    .activity-meta { font-size: 10px; color: var(--text-dim); font-family: var(--mono); }
    .activity-chevron {
      font-size: 10px; color: var(--text-dim); transition: transform 0.2s;
    }
    .activity-card.expanded .activity-chevron { transform: rotate(180deg); }

    .activity-body {
      display: none; border-top: 1px solid var(--border);
      max-height: 300px; overflow-y: auto;
    }
    .activity-card.expanded .activity-body { display: block; }

    .activity-status {
      padding: 10px 14px; background: var(--bg);
      display: flex; gap: 16px; flex-wrap: wrap;
      border-bottom: 1px solid var(--border);
    }
    .status-pill {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--text-muted);
    }
    .status-pill .val { font-weight: 600; color: var(--text); font-family: var(--mono); }

    .activity-plan-step {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 7px 14px; font-size: 11px;
      border-bottom: 1px solid var(--border);
    }
    .activity-plan-step:last-child { border-bottom: none; }
    .step-dot {
      width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; margin-top: 1px;
    }
    .step-dot.done { background: var(--green-dim); color: var(--green); }
    .step-dot.active { background: var(--accent-glow); color: var(--accent); animation: pulse-glow 1.5s ease-in-out infinite; }
    .step-dot.pending { background: var(--surface-raised); color: var(--text-dim); }
    .step-dot.failed { background: var(--red-dim); color: var(--red); }
    .step-text { flex: 1; color: var(--text-muted); line-height: 1.4; }
    .step-text.done { text-decoration: line-through; text-decoration-color: var(--text-dim); color: var(--text-dim); }

    .activity-log-item {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 14px; font-size: 11px;
      border-bottom: 1px solid var(--border);
    }
    .activity-log-item:last-child { border-bottom: none; }
    .log-time { color: var(--text-dim); font-family: var(--mono); font-size: 10px; flex-shrink: 0; min-width: 55px; }
    .log-badge {
      font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;
      text-transform: uppercase; flex-shrink: 0; letter-spacing: 0.03em;
    }
    .log-badge.success { background: var(--green-dim); color: var(--green); }
    .log-badge.error { background: var(--red-dim); color: var(--red); }
    .log-badge.warning { background: var(--yellow-dim); color: var(--yellow); }
    .log-badge.info { background: var(--blue-dim); color: var(--blue); }
    .log-badge.thinking { background: var(--purple-dim); color: var(--purple); }
    .log-badge.heartbeat { background: var(--surface-raised); color: var(--text-dim); }
    .log-msg { flex: 1; color: var(--text-muted); word-break: break-word; }

    .activity-files {
      padding: 8px 14px; background: var(--bg);
      display: flex; flex-wrap: wrap; gap: 4px;
    }
    .file-chip {
      font-size: 10px; font-family: var(--mono); padding: 2px 8px;
      border-radius: 4px; background: var(--surface-raised);
      color: var(--text-muted); border: 1px solid var(--border);
    }

    .activity-section-label {
      font-size: 10px; font-weight: 600; color: var(--text-dim);
      text-transform: uppercase; letter-spacing: 0.04em;
      padding: 8px 14px 4px; background: var(--surface);
    }

    /* === STATUS BANNER === */
    .status-banner {
      display: none; flex-shrink: 0;
      padding: 10px 18px; border-bottom: 1px solid var(--border);
      align-items: center; gap: 10px;
      animation: slideDown 0.25s ease-out;
    }
    @keyframes slideDown { from { transform: translateY(-100%); opacity:0; } to { transform: translateY(0); opacity:1; } }
    .status-banner.visible { display: flex; }
    .status-banner.waiting {
      background: linear-gradient(90deg, rgba(234,179,8,0.12), rgba(234,179,8,0.05));
      border-bottom-color: rgba(234,179,8,0.35);
    }
    .status-banner.working {
      background: linear-gradient(90deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03));
      border-bottom-color: rgba(34,197,94,0.2);
    }
    .status-banner.stopped {
      background: linear-gradient(90deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03));
      border-bottom-color: rgba(99,102,241,0.2);
    }
    .status-banner.error-state {
      background: linear-gradient(90deg, rgba(239,68,68,0.08), rgba(239,68,68,0.03));
      border-bottom-color: rgba(239,68,68,0.2);
    }
    .status-banner-icon {
      width: 20px; height: 20px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; flex-shrink: 0;
    }
    .status-banner.waiting .status-banner-icon {
      background: var(--yellow-dim); color: var(--yellow);
      animation: pulse-glow 2s ease-in-out infinite;
    }
    .status-banner.working .status-banner-icon {
      background: var(--green-dim); color: var(--green);
      animation: spin 2s linear infinite;
    }
    .status-banner.stopped .status-banner-icon {
      background: var(--accent-glow); color: var(--accent);
    }
    .status-banner.error-state .status-banner-icon {
      background: var(--red-dim); color: var(--red);
    }
    .status-banner-text { flex: 1; }
    .status-banner-title { font-size: 12px; font-weight: 600; }
    .status-banner-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
    .status-banner-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .status-action {
      font-size: 11px; padding: 5px 14px; border-radius: 6px;
      border: none; cursor: pointer; font-family: var(--sans);
      font-weight: 600; transition: all 0.15s;
    }
    .status-action.primary {
      background: var(--accent); color: white;
    }
    .status-action.primary:hover { background: var(--accent-hover); }
    .status-action.secondary {
      background: var(--surface-raised); color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .status-action.secondary:hover { color: var(--text); border-color: var(--border-light); }
    .status-action.warning {
      background: var(--yellow-dim); color: var(--yellow); border: 1px solid rgba(234,179,8,0.3);
    }
    .status-action.warning:hover { background: rgba(234,179,8,0.2); }
    .status-action.success {
      background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,0.3);
    }
    .status-action.success:hover { background: rgba(34,197,94,0.2); }

    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--border-light); }

    @media (max-width: 768px) {
      .panels { flex-direction: column; }
      .panel { border-right: none; border-bottom: 1px solid var(--border); }
      .panel:last-child { border-bottom: none; }
    }
  </style>
</head>
<body>
  <div class="layout">
    ${navHtml}

    <div class="panels">
      <div class="panel" id="panel-sneebly">
        <div class="panel-head">
          <div class="panel-icon" style="background:var(--purple);"></div>
          <span class="panel-label">Sneebly Dev</span>
          <span class="panel-desc">Fix & improve the agent</span>
          <div class="panel-actions">
            <button class="panel-btn" onclick="clearChat('sneebly')">Clear</button>
          </div>
        </div>
        <div class="status-banner" id="status-banner-sneebly">
          <div class="status-banner-icon" id="status-icon-sneebly">&#9679;</div>
          <div class="status-banner-text">
            <div class="status-banner-title" id="status-title-sneebly"></div>
            <div class="status-banner-sub" id="status-sub-sneebly"></div>
          </div>
          <div class="status-banner-actions" id="status-actions-sneebly"></div>
        </div>
        <div id="user-actions-chat-box" style="display:none; margin:8px 12px 0; padding:10px 14px; background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.35); border-radius:8px;"></div>
        <div class="chat-area" id="chat-sneebly">
          <div class="welcome">
            <div class="welcome-icon" style="background:var(--purple-dim);">&#129302;</div>
            <h3>Sneebly Dev Chat</h3>
            <p>Talk to Claude about fixing, improving, or debugging the autonomous agent. Claude has context about the autonomy loop, planner, builder, and all agent internals.</p>
            <div class="welcome-suggestions">
              <button class="suggestion-chip" onclick="useSuggestion('sneebly','Why is the autonomy loop stopping early?')">Why does autonomy stop early?</button>
              <button class="suggestion-chip" onclick="useSuggestion('sneebly','How can I make the builder agent more reliable?')">Make builder more reliable</button>
              <button class="suggestion-chip" onclick="useSuggestion('sneebly','What are the current blockers and how to fix them?')">Current blockers?</button>
              <button class="suggestion-chip" onclick="useSuggestion('sneebly','How can I reduce AI costs in the autonomy loop?')">Reduce AI costs</button>
            </div>
          </div>
          <div class="typing-indicator" id="typing-sneebly">
            <span class="typing-label">Claude is thinking</span>
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
        </div>
        <div class="input-area">
          <div id="chips-sneebly" style="display:none; flex-wrap:wrap; gap:4px; padding:0 0 2px;"></div>
          <div class="input-row">
            <div class="attach-menu-wrap" id="attach-wrap-sneebly">
              <button class="attach-btn" onclick="toggleAttachMenu(event,'sneebly')" title="Attach or paste">+</button>
              <div class="attach-menu" id="attach-menu-sneebly" style="display:none;">
                <button class="attach-menu-item" onclick="pasteToInput('sneebly');closeAttachMenu('sneebly')">
                  <span class="attach-menu-icon">&#128203;</span><span>Paste from clipboard</span>
                </button>
                <button class="attach-menu-item" onclick="triggerFileInput('sneebly');closeAttachMenu('sneebly')">
                  <span class="attach-menu-icon">&#128196;</span><span>Attach a file</span>
                </button>
              </div>
            </div>
            <input type="file" id="file-input-sneebly" style="display:none" onchange="handleFileAttach(event,'sneebly')" multiple accept=".txt,.md,.ts,.js,.json,.py,.sh,.log,.csv,.html,.css,.yaml,.yml">
            <textarea class="input-field" id="input-sneebly" placeholder="Ask about Sneebly..." rows="1"
              onkeydown="handleKey(event,'sneebly')" oninput="autoResize(this)" onpaste="autoResize(this)"></textarea>
            <button class="send-btn" id="send-sneebly" onclick="send('sneebly')">Send</button>
          </div>
        </div>
      </div>

      <div class="panel" id="panel-app">
        <div class="panel-head">
          <div class="panel-icon" style="background:var(--green);"></div>
          <span class="panel-label">App Corrections</span>
          <span class="panel-desc">Fix the app being built</span>
          <div class="panel-actions">
            <button class="panel-btn" onclick="clearChat('app')">Clear</button>
          </div>
        </div>
        <div class="status-banner" id="status-banner-app">
          <div class="status-banner-icon" id="status-icon-app">&#9679;</div>
          <div class="status-banner-text">
            <div class="status-banner-title" id="status-title-app"></div>
            <div class="status-banner-sub" id="status-sub-app"></div>
          </div>
          <div class="status-banner-actions" id="status-actions-app"></div>
        </div>
        <div class="chat-area" id="chat-app">
          <div class="welcome">
            <div class="welcome-icon" style="background:var(--green-dim);">&#127912;</div>
            <h3>App Corrections Chat</h3>
            <p>Talk to Claude about fixing issues in AnimAItion.tools. Claude has context about the schema, routes, UI components, and recent errors.</p>
            <div class="welcome-suggestions">
              <button class="suggestion-chip" onclick="useSuggestion('app','What errors are showing up right now?')">Current errors?</button>
              <button class="suggestion-chip" onclick="useSuggestion('app','The project detail page is not loading correctly')">Project page broken</button>
              <button class="suggestion-chip" onclick="useSuggestion('app','How do I add a new feature to the editor?')">Add editor feature</button>
              <button class="suggestion-chip" onclick="useSuggestion('app','What database tables are missing?')">Missing DB tables?</button>
            </div>
          </div>
          <div class="typing-indicator" id="typing-app">
            <span class="typing-label">Claude is thinking</span>
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
        </div>
        <div class="input-area">
          <div id="chips-app" style="display:none; flex-wrap:wrap; gap:4px; padding:0 0 2px;"></div>
          <div class="input-row">
            <div class="attach-menu-wrap" id="attach-wrap-app">
              <button class="attach-btn" onclick="toggleAttachMenu(event,'app')" title="Attach or paste">+</button>
              <div class="attach-menu" id="attach-menu-app" style="display:none;">
                <button class="attach-menu-item" onclick="pasteToInput('app');closeAttachMenu('app')">
                  <span class="attach-menu-icon">&#128203;</span><span>Paste from clipboard</span>
                </button>
                <button class="attach-menu-item" onclick="triggerFileInput('app');closeAttachMenu('app')">
                  <span class="attach-menu-icon">&#128196;</span><span>Attach a file</span>
                </button>
              </div>
            </div>
            <input type="file" id="file-input-app" style="display:none" onchange="handleFileAttach(event,'app')" multiple accept=".txt,.md,.ts,.js,.json,.py,.sh,.log,.csv,.html,.css,.yaml,.yml">
            <textarea class="input-field" id="input-app" placeholder="Describe what to fix..." rows="1"
              onkeydown="handleKey(event,'app')" oninput="autoResize(this)" onpaste="autoResize(this)"></textarea>
            <button class="send-btn" id="send-app" onclick="send('app')">Send</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-bar" id="bottom-bar">
      <div class="bottom-tabs">
        <button class="bottom-tab active" onclick="switchBottomTab('teams')" id="btab-teams">Teams <span class="btab-count" id="team-count">0</span></button>
        <button class="bottom-tab" onclick="switchBottomTab('expenses')" id="btab-expenses">Expenses</button>
        <button class="bottom-tab" onclick="switchBottomTab('snapshots')" id="btab-snapshots">Snapshots</button>
        <button class="bottom-tab" onclick="switchBottomTab('comms')" id="btab-comms">Comms</button>
        <button class="bottom-tab" onclick="switchBottomTab('experiments')" id="btab-experiments">Research</button>
        <button class="bottom-tab" onclick="switchBottomTab('feature-tests')" id="btab-feature-tests">Feature Tests <span class="btab-count" id="feat-fail-count" style="display:none;background:var(--red)">0</span></button>
        <button class="bottom-tab" onclick="switchBottomTab('knowledge')" id="btab-knowledge">Knowledge <span class="btab-count" id="kb-count">0</span></button>
        <button class="bottom-toggle" onclick="toggleBottomBar()" id="bottom-toggle-btn">&#9650;</button>
      </div>
      <div class="bottom-content" id="bottom-content">
        <div class="bottom-panel" id="bp-teams"><div class="bp-loading">Loading teams...</div></div>
        <div class="bottom-panel" id="bp-expenses" style="display:none"><div class="bp-loading">Loading expenses...</div></div>
        <div class="bottom-panel" id="bp-snapshots" style="display:none"><div class="bp-loading">Loading snapshots...</div></div>
        <div class="bottom-panel" id="bp-comms" style="display:none"><div class="bp-loading">Loading comms...</div></div>
        <div class="bottom-panel" id="bp-experiments" style="display:none"><div class="bp-loading">Loading research experiments...</div></div>
        <div class="bottom-panel" id="bp-feature-tests" style="display:none"><div class="bp-loading">Loading feature tests...</div></div>
        <div class="bottom-panel" id="bp-knowledge" style="display:none"><div class="bp-loading">Loading knowledge base...</div></div>
      </div>
    </div>
  </div>

  <script>
    var KEY = '${sneeblyKey}';
    var CC = '/api/sneebly-cc';
    var SB = '/sneebly';
    var H = { 'x-sneebly-key': KEY, 'Content-Type': 'application/json' };
    var sessionCost = 0;
    var sending = { sneebly: false, app: false };
    var lastActivityId = null;
    var activityCardEl = null;
    var lastKnownState = null;
    var activityExpanded = true;
    var lastSeenActivityCount = 0;
    var lastAssistantMsg = { sneebly: '', app: '' };
    var currentBannerState = { sneebly: '', app: '' };
    var attachedImages = { sneebly: [], app: [] };

    function fmt$(n) { return '$' + (n || 0).toFixed(2); }

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    function renderMarkdown(raw) {
      var codeBlocks = [];
      var text = raw.replace(/\`\`\`([\\w]*)?\\n([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
        var idx = codeBlocks.length;
        codeBlocks.push('<pre><code>' + esc(code.trim()) + '</code></pre>');
        return '%%CODEBLOCK_' + idx + '%%';
      });
      var inlineCode = [];
      text = text.replace(/\`([^\`\\n]+)\`/g, function(_, code) {
        var idx = inlineCode.length;
        inlineCode.push('<code>' + esc(code) + '</code>');
        return '%%INLINE_' + idx + '%%';
      });
      text = esc(text);
      text = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      text = text.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
      text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
      text = text.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
      text = text.replace(/((?:<li>.*?<\\/li>\\s*)+)/g, '<ul>$1</ul>');
      text = text.replace(/\\n\\n/g, '</p><p>');
      text = text.replace(/\\n/g, '<br>');
      for (var i = 0; i < codeBlocks.length; i++) {
        text = text.replace('%%CODEBLOCK_' + i + '%%', codeBlocks[i]);
      }
      for (var i = 0; i < inlineCode.length; i++) {
        text = text.replace('%%INLINE_' + i + '%%', inlineCode[i]);
      }
      if (!text.match(/^\\s*</)) text = '<p>' + text + '</p>';
      return text;
    }

    function formatTime(ts) {
      if (!ts) return new Date().toLocaleTimeString('en', { hour:'numeric', minute:'2-digit' });
      return new Date(ts).toLocaleTimeString('en', { hour:'numeric', minute:'2-digit' });
    }

    function timeAgo(ts) {
      var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      if (s < 86400) return Math.floor(s/3600) + 'h ago';
      var days = Math.floor(s/86400);
      if (days === 1) return '1 day ago';
      if (days < 7) return days + ' days ago';
      if (days < 30) return Math.floor(days/7) + ' week(s) ago';
      if (days < 365) return Math.floor(days/30) + ' month(s) ago';
      return Math.floor(days/365) + ' year(s) ago';
    }

    function formatFullDate(ts) {
      var dt = new Date(ts);
      return dt.toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' }) + ' at ' + dt.toLocaleTimeString('en', { hour:'numeric', minute:'2-digit', hour12:true });
    }

    function addMessage(channel, role, content, opts) {
      opts = opts || {};
      var area = document.getElementById('chat-' + channel);
      var welcome = area.querySelector('.welcome');
      if (welcome) welcome.remove();
      var typing = document.getElementById('typing-' + channel);

      var div = document.createElement('div');
      div.className = 'msg ' + role + (opts.noAnimate ? ' no-animate' : '') + (opts.isError ? ' error' : '');

      var bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      if (role === 'assistant') {
        bubble.innerHTML = renderMarkdown(content);
      } else {
        bubble.textContent = content;
      }
      div.appendChild(bubble);

      var meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = formatTime(opts.timestamp);
      if (opts.cost !== undefined && opts.cost > 0) {
        meta.innerHTML += ' <span class="cost-tag">$' + opts.cost.toFixed(4) + '</span>';
      }
      div.appendChild(meta);

      area.insertBefore(div, typing);
      area.scrollTop = area.scrollHeight;

      if (role === 'assistant' && !opts.isError) {
        lastAssistantMsg[channel] = content;
        updateBannerForChannel(channel);
      } else if (role === 'user') {
        lastAssistantMsg[channel] = '';
        updateBannerForChannel(channel);
      }
    }

    function buildActivityCard(state, plan, journal, activity) {
      var isRunning = state && state.running && !state.paused;
      var isPaused = state && state.paused;
      var hasErrors = state && state.errors && state.errors.length > 0;

      var pulseClass = isRunning ? 'running' : (hasErrors ? 'error' : (isPaused ? 'paused' : ''));
      var statusText = isRunning ? 'Working' : (isPaused ? 'Paused' : 'Idle');
      var cycle = state ? (state.currentCycle || 0) : 0;
      var files = state ? (state.filesModified || []) : [];
      var completion = state ? (state.completionPercent || 0) : 0;
      var lastResult = state ? state.lastCycleResult : null;
      var lastTime = state ? state.lastCycleTime : null;

      var html = '';

      html += '<div class="activity-header" onclick="toggleActivityExpand()">';
      html += '<div class="activity-pulse ' + pulseClass + '"></div>';
      html += '<div class="activity-title">';
      if (isRunning) {
        html += 'Sneebly is working';
        if (lastResult) html += ' &mdash; ' + humanizeResult(lastResult);
      } else if (isPaused) {
        html += 'Sneebly paused';
        if (lastTime) html += ' &mdash; last active ' + timeAgo(lastTime);
      } else {
        html += 'Sneebly idle';
        if (lastTime) html += ' &mdash; last active ' + timeAgo(lastTime);
      }
      html += '</div>';
      html += '<div class="activity-meta">' + completion + '% done</div>';
      html += '<div class="activity-chevron">&#9660;</div>';
      html += '</div>';

      html += '<div class="activity-body">';

      html += '<div class="activity-status">';
      if (lastTime) {
        html += '<div class="status-pill" style="flex-basis:100%; margin-bottom:4px;">Last active: <span class="val" style="font-family:var(--sans);">' + formatFullDate(lastTime) + '</span></div>';
      }
      html += '<div class="status-pill">Cycle <span class="val">' + cycle + '</span></div>';
      html += '<div class="status-pill">Files <span class="val">' + files.length + '</span></div>';
      html += '<div class="status-pill">Progress <span class="val">' + completion + '%</span></div>';
      if (hasErrors) {
        html += '<div class="status-pill" style="color:var(--red);">Errors <span class="val" style="color:var(--red);">' + state.errors.length + '</span></div>';
      }
      html += '</div>';

      if (plan && plan.goal) {
        var steps = plan.steps || [];
        var doneCount = steps.filter(function(s) { return s.status === 'done'; }).length;
        var planDateStr = plan.createdAt ? ' \u00b7 created ' + timeAgo(plan.createdAt) : '';
        html += '<div class="activity-section-label">Current Plan (' + doneCount + '/' + steps.length + ')' + planDateStr + '</div>';
        for (var i = 0; i < steps.length; i++) {
          var s = steps[i];
          var dotClass = s.status === 'done' ? 'done' : s.status === 'in-progress' ? 'active' : s.status === 'failed' ? 'failed' : 'pending';
          var icon = s.status === 'done' ? '&#10003;' : s.status === 'in-progress' ? '&#9654;' : s.status === 'failed' ? '&#10007;' : '&#8226;';
          html += '<div class="activity-plan-step">';
          html += '<div class="step-dot ' + dotClass + '">' + icon + '</div>';
          html += '<div class="step-text ' + (s.status === 'done' ? 'done' : '') + '">' + esc(s.description || 'Step ' + (i+1)) + '</div>';
          html += '</div>';
        }
      }

      var entries = journal && journal.entries ? journal.entries : [];
      if (entries.length > 0) {
        html += '<div class="activity-section-label">Recent Activity</div>';
        var recent = entries.slice(-10).reverse();
        for (var i = 0; i < recent.length; i++) {
          var e = recent[i];
          var badgeClass = e.result === 'success' ? 'success' : (e.result === 'error' || e.result === 'build-failed' || e.result === 'verify-failed') ? 'error' : 'info';
          html += '<div class="activity-log-item">';
          html += '<span class="log-time">#' + (e.cycle || '?') + '</span>';
          html += '<span class="log-badge ' + badgeClass + '">' + (e.result || '?') + '</span>';
          html += '<span class="log-msg">' + esc(e.stepDescription || humanizeResult(e.result || '')) + '</span>';
          html += '</div>';
        }
      }

      var activityItems = activity || [];
      if (activityItems.length > 0 && entries.length === 0) {
        html += '<div class="activity-section-label">Activity Log</div>';
        var items = activityItems.slice(0, 15);
        for (var i = 0; i < items.length; i++) {
          var a = items[i];
          var t = a.timestamp ? formatTime(a.timestamp) : '--';
          var bclass = a.type || 'info';
          html += '<div class="activity-log-item">';
          html += '<span class="log-time">' + t + '</span>';
          html += '<span class="log-badge ' + bclass + '">' + (a.type || 'info') + '</span>';
          html += '<span class="log-msg">' + esc(a.message || '') + '</span>';
          html += '</div>';
        }
      }

      if (files.length > 0) {
        html += '<div class="activity-section-label">Modified Files</div>';
        html += '<div class="activity-files">';
        var showFiles = files.slice(-20);
        for (var i = 0; i < showFiles.length; i++) {
          html += '<span class="file-chip">' + esc(showFiles[i]) + '</span>';
        }
        html += '</div>';
      }

      html += '</div>';
      return html;
    }

    function humanizeResult(r) {
      var map = {
        'success': 'Step completed',
        'build-failed': 'Build failed (retrying)',
        'verify-failed': 'Verification failed (rolled back)',
        'plan-empty-skipped': 'Nothing to do',
        'plan-complete-reviewed': 'Plan done, reviewed',
        'error': 'Error encountered',
        'paused': 'Paused',
        'unhealthy': 'Health check failed',
        'rate-limited': 'Rate limited',
        'budget-exceeded': 'Budget exceeded',
      };
      return map[r] || r;
    }

    function toggleActivityExpand() {
      activityExpanded = !activityExpanded;
      if (activityCardEl) {
        if (activityExpanded) {
          activityCardEl.classList.add('expanded');
        } else {
          activityCardEl.classList.remove('expanded');
        }
      }
    }

    async function pollActivity() {
      try {
        var results = await Promise.all([
          fetch(CC + '/autonomy/state', { headers: H }).then(function(r) { return r.json(); }).catch(function() { return null; }),
          fetch(CC + '/plan', { headers: H }).then(function(r) { return r.json(); }).catch(function() { return null; }),
          fetch(CC + '/autonomy/journal?limit=10', { headers: H }).then(function(r) { return r.json(); }).catch(function() { return null; }),
          fetch(SB + '/api/live-activity?limit=15', { headers: H }).then(function(r) { return r.json(); }).catch(function() { return null; }),
        ]);

        var state = results[0];
        var plan = results[1];
        var journal = results[2];
        var activityData = results[3] ? (results[3].activity || []) : [];

        var stateKey = JSON.stringify({ r: state ? state.running : false, p: state ? state.paused : false, c: state ? state.currentCycle : 0, lr: state ? state.lastCycleResult : '', f: state ? (state.filesModified||[]).length : 0, cp: state ? state.completionPercent : 0 });
        var journalCount = journal && journal.entries ? journal.entries.length : 0;
        var actCount = activityData.length;
        var combinedKey = stateKey + ':' + journalCount + ':' + actCount;

        if (combinedKey === lastKnownState) return;
        lastKnownState = combinedKey;

        var hasContent = (state && (state.running || state.lastCycleResult || state.completionPercent > 0 || state.currentCycle > 0 || state.totalCycles > 0)) || (plan && plan.goal) || journalCount > 0 || actCount > 0;
        if (!hasContent) return;

        var area = document.getElementById('chat-sneebly');
        var typing = document.getElementById('typing-sneebly');
        var cardHtml = buildActivityCard(state, plan, journal, activityData);

        if (!activityCardEl) {
          activityCardEl = document.createElement('div');
          activityCardEl.className = 'activity-card' + (activityExpanded ? ' expanded' : '');
          activityCardEl.id = 'live-activity';
          area.insertBefore(activityCardEl, typing);
        }

        activityCardEl.innerHTML = cardHtml;
        if (activityExpanded) activityCardEl.classList.add('expanded');

        var topbarCost = document.getElementById('total-cost');
        if (state && state.running) {
          topbarCost.style.color = 'var(--green)';
        } else {
          topbarCost.style.color = '';
        }

        updateBannerForChannel('sneebly', state);

      } catch (e) {
        console.error('Poll error:', e);
      }
    }

    function handleKey(e, channel) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(channel);
      }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function addImageChip(channel, blob, idx) {
      var chipsEl = document.getElementById('chips-' + channel);
      if (!chipsEl) return;
      chipsEl.style.display = 'flex';
      var previewUrl = URL.createObjectURL(blob);
      var mimeType = blob.type || 'image/png';
      var imgObj = { blob: blob, mediaType: mimeType, idx: idx };
      attachedImages[channel].push(imgObj);
      var chip = document.createElement('div');
      chip.className = 'attach-chip';
      chip.style.cssText = 'align-items:center;gap:6px;';
      var thumb = document.createElement('img');
      thumb.src = previewUrl;
      thumb.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:3px;';
      var label = document.createElement('span');
      label.textContent = 'Image';
      label.style.cssText = 'font-size:12px;';
      var rm = document.createElement('button');
      rm.className = 'attach-chip-remove';
      rm.textContent = '\u00d7';
      rm.onclick = function() {
        URL.revokeObjectURL(previewUrl);
        attachedImages[channel] = attachedImages[channel].filter(function(img) { return img.idx !== idx; });
        chip.remove();
        if (!chipsEl.children.length) chipsEl.style.display = 'none';
      };
      chip.appendChild(thumb);
      chip.appendChild(label);
      chip.appendChild(rm);
      chipsEl.appendChild(chip);
    }

    function pasteToInput(channel) {
      var el = document.getElementById('input-' + channel);
      if (!el) return;
      if (!navigator.clipboard) { el.focus(); return; }
      if (navigator.clipboard.read) {
        navigator.clipboard.read().then(function(items) {
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            for (var j = 0; j < item.types.length; j++) {
              var t = item.types[j];
              if (t.startsWith('image/')) {
                item.getType(t).then(function(blob) {
                  addImageChip(channel, blob, Date.now());
                });
                return;
              }
            }
            if (item.types.indexOf('text/plain') !== -1) {
              item.getType('text/plain').then(function(blob) {
                blob.text().then(function(text) {
                  if (!text) return;
                  var start = el.selectionStart;
                  var end = el.selectionEnd;
                  el.value = el.value.slice(0, start) + text + el.value.slice(end);
                  el.selectionStart = el.selectionEnd = start + text.length;
                  el.focus();
                  autoResize(el);
                });
              });
              return;
            }
          }
          el.focus();
        }).catch(function() {
          navigator.clipboard.readText && navigator.clipboard.readText().then(function(text) {
            if (!text) return;
            var start = el.selectionStart;
            var end = el.selectionEnd;
            el.value = el.value.slice(0, start) + text + el.value.slice(end);
            el.selectionStart = el.selectionEnd = start + text.length;
            el.focus();
            autoResize(el);
          }).catch(function() { el.focus(); });
        });
      } else if (navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(text) {
          if (!text) return;
          var start = el.selectionStart;
          var end = el.selectionEnd;
          el.value = el.value.slice(0, start) + text + el.value.slice(end);
          el.selectionStart = el.selectionEnd = start + text.length;
          el.focus();
          autoResize(el);
        }).catch(function() { el.focus(); });
      } else {
        el.focus();
      }
    }

    // ── Attach menu ────────────────────────────────────────────────────────
    var attachedFiles = { sneebly: [], app: [] };

    function toggleAttachMenu(event, channel) {
      event.stopPropagation();
      var menu = document.getElementById('attach-menu-' + channel);
      var other = channel === 'sneebly' ? 'app' : 'sneebly';
      var otherMenu = document.getElementById('attach-menu-' + other);
      if (otherMenu) otherMenu.style.display = 'none';
      if (!menu) return;
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    function closeAttachMenu(channel) {
      var menu = document.getElementById('attach-menu-' + channel);
      if (menu) menu.style.display = 'none';
    }

    function triggerFileInput(channel) {
      var input = document.getElementById('file-input-' + channel);
      if (input) input.click();
    }

    function handleFileAttach(event, channel) {
      var files = Array.from(event.target.files || []);
      if (!files.length) return;
      var chipsEl = document.getElementById('chips-' + channel);
      chipsEl.style.display = 'flex';
      files.forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var content = e.target.result;
          var obj = { name: file.name, content: content };
          attachedFiles[channel].push(obj);
          var chip = document.createElement('div');
          chip.className = 'attach-chip';
          chip.setAttribute('data-name', file.name);
          chip.innerHTML = '<span style="font-size:13px;">&#128196;</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">' + file.name + '</span>';
          var rm = document.createElement('button');
          rm.className = 'attach-chip-remove';
          rm.textContent = '\u00d7';
          rm.onclick = function() {
            attachedFiles[channel] = attachedFiles[channel].filter(function(f) { return f.name !== file.name; });
            chip.remove();
            if (!chipsEl.children.length) chipsEl.style.display = 'none';
          };
          chip.appendChild(rm);
          chipsEl.appendChild(chip);
        };
        reader.readAsText(file);
      });
      event.target.value = '';
    }

    function clearAttachments(channel) {
      attachedFiles[channel] = [];
      (attachedImages[channel] || []).forEach(function(img) {
        if (img._url) URL.revokeObjectURL(img._url);
      });
      attachedImages[channel] = [];
      var chipsEl = document.getElementById('chips-' + channel);
      if (chipsEl) { chipsEl.innerHTML = ''; chipsEl.style.display = 'none'; }
    }

    function buildMessageWithAttachments(channel, userText) {
      var files = attachedFiles[channel] || [];
      if (!files.length) return userText;
      var parts = files.map(function(f) {
        return '=== Attached: ' + f.name + ' ===\n' + f.content;
      });
      return parts.join('\n\n') + (userText ? '\n\n' + userText : '');
    }

    // Close menus on outside click
    document.addEventListener('click', function() {
      ['sneebly','app'].forEach(function(ch) {
        var m = document.getElementById('attach-menu-' + ch);
        if (m) m.style.display = 'none';
      });
    });

    // ── Step card helpers (Replit-style live tool progress) ──────────────
    var stepGroups = {};

    function getOrCreateStepGroup(channel) {
      if (stepGroups[channel]) return stepGroups[channel];
      var area = document.getElementById('chat-' + channel);
      var typing = document.getElementById('typing-' + channel);
      var grp = document.createElement('div');
      grp.className = 'step-group';
      area.insertBefore(grp, typing);
      stepGroups[channel] = grp;
      return grp;
    }

    function removeStepGroup(channel) {
      if (stepGroups[channel]) {
        stepGroups[channel].remove();
        delete stepGroups[channel];
      }
    }

    function addStepCard(channel, cmd) {
      var grp = getOrCreateStepGroup(channel);
      var card = document.createElement('div');
      card.className = 'step-card running';
      card.innerHTML =
        '<div class="step-spinner"></div>' +
        '<div class="step-content">' +
          '<div class="step-cmd">' + escapeHtml(truncate(cmd, 80)) + '</div>' +
          '<div class="step-preview"></div>' +
        '</div>';
      grp.appendChild(card);
      var area = document.getElementById('chat-' + channel);
      area.scrollTop = area.scrollHeight;
      return card;
    }

    function resolveStepCard(card, exitCode, preview) {
      card.classList.remove('running');
      card.classList.add(exitCode === 0 ? 'ok' : 'fail');
      var spinner = card.querySelector('.step-spinner');
      if (spinner) {
        var icon = document.createElement('div');
        icon.className = 'step-icon';
        icon.textContent = exitCode === 0 ? '✓' : '✗';
        spinner.replaceWith(icon);
      }
      if (preview) {
        var pre = card.querySelector('.step-preview');
        if (pre) pre.textContent = preview;
      }
    }

    function addRollbackCard(channel, snapshotId) {
      var area = document.getElementById('chat-' + channel);
      var typing = document.getElementById('typing-' + channel);
      var card = document.createElement('div');
      card.className = 'rollback-card';
      var rbBtn = document.createElement('button');
      rbBtn.className = 'rollback-btn';
      rbBtn.textContent = 'Rollback';
      rbBtn.dataset.snapshotId = snapshotId;
      rbBtn.dataset.channel = channel;
      rbBtn.addEventListener('click', function() { doRollback(this, this.dataset.snapshotId, this.dataset.channel); });
      var icon = document.createElement('div');
      icon.className = 'rollback-icon';
      icon.textContent = '↩';
      var txt = document.createElement('div');
      txt.className = 'rollback-text';
      txt.innerHTML = '<strong>Files may have changed</strong>Snapshot saved before edits.';
      card.appendChild(icon);
      card.appendChild(txt);
      card.appendChild(rbBtn);
      area.insertBefore(card, typing);
      area.scrollTop = area.scrollHeight;
    }

    async function doRollback(btn, snapshotId, channel) {
      if (!confirm('Roll back to the snapshot taken before this response? This will undo file changes made by Claude.')) return;
      btn.disabled = true;
      btn.textContent = 'Rolling back...';
      try {
        var res = await fetch('/api/sneebly-cc/rollback/' + snapshotId, { method: 'POST', headers: H });
        var data = await res.json();
        if (data.success || data.message) {
          btn.textContent = 'Done ✓';
          addMessage(channel, 'assistant', '**Rolled back** to snapshot ' + snapshotId + '. ' + (data.message || ''), {});
        } else {
          btn.textContent = 'Failed';
          btn.disabled = false;
        }
      } catch (e) {
        btn.textContent = 'Error';
        btn.disabled = false;
      }
    }

    function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Streaming send function ───────────────────────────────────────────
    async function send(channel) {
      if (sending[channel]) return;
      var input = document.getElementById('input-' + channel);
      var btn = document.getElementById('send-' + channel);
      var rawText = input.value.trim();
      var text = buildMessageWithAttachments(channel, rawText);
      var images = (attachedImages[channel] || []).slice();
      if (!text && !images.length) return;

      sending[channel] = true;
      input.value = '';
      input.style.height = 'auto';
      btn.disabled = true;
      btn.classList.add('loading');
      clearAttachments(channel);

      var displayText = rawText || (images.length ? '(pasted image)' : '(attached file)');
      addMessage(channel, 'user', displayText);
      updateBannerForChannel(channel);

      var typing = document.getElementById('typing-' + channel);
      var typingLabel = typing.querySelector('.typing-label');
      typing.classList.add('visible');
      var area = document.getElementById('chat-' + channel);
      area.scrollTop = area.scrollHeight;

      var currentStepCard = null;
      var totalCost = 0;
      var replyReceived = false;

      try {
        var controller = new AbortController();
        var timeout = setTimeout(function() { controller.abort(); }, 180000);

        var fetchBody, fetchHeaders;
        if (images.length) {
          var fd = new FormData();
          fd.append('message', text || '');
          images.forEach(function(img, i) {
            fd.append('images', img.blob, 'image-' + i + '.' + (img.mediaType.split('/')[1] || 'png'));
          });
          fetchBody = fd;
          fetchHeaders = { 'x-sneebly-key': KEY }; // No Content-Type: browser sets multipart boundary
        } else {
          fetchBody = JSON.stringify({ message: text || '' });
          fetchHeaders = H;
        }

        var res = await fetch('/api/sneebly-cc/chat/' + channel + '/stream', {
          method: 'POST',
          headers: fetchHeaders,
          body: fetchBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok || !res.body) {
          var errData = await res.json().catch(function() { return {}; });
          if (res.status === 429) { showBusyToast(channel); return; }
          addMessage(channel, 'assistant', errData.error || 'Server error ' + res.status, { isError: true });
          return;
        }

        // Parse SSE stream
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          buf += decoder.decode(chunk.value, { stream: true });

          // Extract complete SSE lines
          var lines = buf.split('\\n');
          buf = lines.pop();

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line.startsWith('data: ')) continue;
            var raw = line.slice(6);
            var evt;
            try { evt = JSON.parse(raw); } catch (e) { continue; }

            if (evt.type === 'thinking') {
              if (typingLabel) typingLabel.textContent = evt.text || 'Claude is thinking';
              area.scrollTop = area.scrollHeight;

            } else if (evt.type === 'tool_call') {
              if (typingLabel) typingLabel.textContent = 'Running command…';
              currentStepCard = addStepCard(channel, evt.command);
              area.scrollTop = area.scrollHeight;

            } else if (evt.type === 'tool_result') {
              if (currentStepCard) {
                resolveStepCard(currentStepCard, evt.exitCode, evt.preview);
                currentStepCard = null;
              }
              if (typingLabel) typingLabel.textContent = 'Processing results…';
              area.scrollTop = area.scrollHeight;

            } else if (evt.type === 'reply') {
              replyReceived = true;
              removeStepGroup(channel);
              addMessage(channel, 'assistant', evt.text, { cost: totalCost });
              area.scrollTop = area.scrollHeight;

            } else if (evt.type === 'done') {
              totalCost = evt.cost || 0;
              // Update cost on the last assistant message
              var lastMsg = area.querySelector('.msg.assistant:last-of-type .cost-tag');
              if (lastMsg) lastMsg.textContent = '$' + totalCost.toFixed(4);
              sessionCost += totalCost;
              document.getElementById('total-cost').textContent = 'Session: $' + sessionCost.toFixed(2);
              if (evt.snapshotId) addRollbackCard(channel, evt.snapshotId);

            } else if (evt.type === 'error') {
              removeStepGroup(channel);
              var isBudget = evt.message && evt.message.includes('Budget');
              if (isBudget) showBusyToast(channel);
              else addMessage(channel, 'assistant', evt.message || 'An error occurred', { isError: true });
            }
          }
        }
      } catch (e) {
        removeStepGroup(channel);
        // Stream closing after reply is expected — not an error
        if (!replyReceived) {
          var errMsg = e && e.name === 'AbortError'
            ? 'Request timed out. Claude may be overloaded — try again.'
            : 'Connection error. The server may be busy or restarting — wait a moment and try again.';
          addMessage(channel, 'assistant', errMsg, { isError: true });
        }
      } finally {
        if (typingLabel) typingLabel.textContent = 'Claude is thinking';
        typing.classList.remove('visible');
        btn.disabled = false;
        btn.classList.remove('loading');
        sending[channel] = false;
        updateBannerForChannel(channel);
        input.focus();
      }
    }

    function useSuggestion(channel, text) {
      if (sending[channel]) {
        showBusyToast(channel);
        return;
      }
      document.getElementById('input-' + channel).value = text;
      send(channel);
    }

    function showBusyToast(channel) {
      var existing = document.getElementById('busy-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'busy-toast';
      toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:8px;background:var(--yellow-dim);color:var(--yellow);border:1px solid var(--yellow-border);font-size:12px;font-weight:600;z-index:9999;animation:fadeIn 0.2s;';
      toast.textContent = 'Claude is still thinking... please wait';
      document.body.appendChild(toast);
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 3000);
    }

    async function clearChat(channel) {
      if (!confirm('Clear all messages in this chat?')) return;
      try {
        await fetch('/api/sneebly-cc/chat/' + channel + '/clear', { method: 'POST', headers: H });
      } catch (e) {}
      var area = document.getElementById('chat-' + channel);
      var typing = document.getElementById('typing-' + channel);
      area.innerHTML = '';
      area.appendChild(createWelcome(channel));
      typing.classList.remove('visible');
      area.appendChild(typing);
      if (channel === 'sneebly') {
        activityCardEl = null;
        lastKnownState = null;
      }
    }

    function createWelcome(channel) {
      var w = document.createElement('div');
      w.className = 'welcome';
      var isSneebly = channel === 'sneebly';
      w.innerHTML =
        '<div class="welcome-icon" style="background:' + (isSneebly ? 'var(--purple-dim)' : 'var(--green-dim)') + ';">' +
        (isSneebly ? '&#129302;' : '&#127912;') + '</div>' +
        '<h3>' + (isSneebly ? 'Sneebly Dev Chat' : 'App Corrections Chat') + '</h3>' +
        '<p>Chat cleared. Start a new conversation.</p>';
      return w;
    }

    async function loadHistory() {
      for (var i = 0; i < 2; i++) {
        var ch = i === 0 ? 'sneebly' : 'app';
        try {
          var res = await fetch('/api/sneebly-cc/chat/' + ch, { headers: H });
          var data = await res.json();
          if (data.messages && data.messages.length > 0) {
            for (var j = 0; j < data.messages.length; j++) {
              var m = data.messages[j];
              addMessage(ch, m.role, m.content, {
                timestamp: m.timestamp,
                cost: m.cost,
                noAnimate: true,
              });
            }
          }
        } catch (e) {}
      }
      updateBannerForChannel('sneebly');
      updateBannerForChannel('app');
    }

    function detectQuestion(text) {
      if (!text) return false;
      var lower = text.toLowerCase();
      var lastLines = text.split('\\n').slice(-5).join(' ').toLowerCase();
      var questionPatterns = [
        /\\?\\s*$/,
        /do you want/i, /should i/i, /shall i/i,
        /would you like/i, /want me to/i,
        /ready to/i, /proceed/i, /confirm/i,
        /go ahead/i, /start.*loop/i, /start.*autonomy/i,
        /waiting for.*confirmation/i, /waiting for.*input/i,
        /your call/i, /up to you/i,
      ];
      for (var i = 0; i < questionPatterns.length; i++) {
        if (questionPatterns[i].test(lastLines)) return true;
      }
      return false;
    }

    function detectWaitingConfirmation(text) {
      if (!text) return false;
      var lower = text.toLowerCase();
      return /waiting for.*confirm/i.test(lower) ||
             /waiting for.*proceed/i.test(lower) ||
             /need you to say/i.test(lower) ||
             /need.*permission/i.test(lower) ||
             /start.*autonomy.*loop/i.test(lower) ||
             /should i proceed/i.test(lower) ||
             /want me to start/i.test(lower);
    }

    function detectBudgetExceeded(text) {
      if (!text) return false;
      return /budget.*exceed/i.test(text) || /over.*budget/i.test(text) || /budget.*limit/i.test(text);
    }

    function extractQuestion(text) {
      if (!text) return '';
      var lines = text.split('\\n').filter(function(l) { return l.trim(); });
      for (var i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
        var line = lines[i].trim();
        if (/\\?\\s*$/.test(line) && line.length > 10 && line.length < 120) {
          return line.replace(/^[\\*\\-•]\\s*/, '').replace(/\\*\\*/g, '');
        }
      }
      return '';
    }

    var lastAutoState = null;
    function updateBannerForChannel(channel, autoState) {
      var banner = document.getElementById('status-banner-' + channel);
      var title = document.getElementById('status-title-' + channel);
      var sub = document.getElementById('status-sub-' + channel);
      var icon = document.getElementById('status-icon-' + channel);
      var actions = document.getElementById('status-actions-' + channel);
      if (!banner) return;

      var msg = lastAssistantMsg[channel] || '';
      var isQuestion = detectQuestion(msg);
      var isWaiting = detectWaitingConfirmation(msg);
      var isBudgetIssue = detectBudgetExceeded(msg);
      var state = autoState || lastAutoState;
      if (autoState) lastAutoState = autoState;

      var isRunning = state && state.running && !state.paused;
      var isPaused = state && state.paused;
      var isBudgetExceeded = state && state.lastCycleResult === 'budget-exceeded';

      var newBannerState = '';

      if (sending[channel]) {
        newBannerState = 'thinking';
        banner.className = 'status-banner visible working';
        icon.innerHTML = '&#9881;';
        title.textContent = 'Claude is thinking...';
        sub.textContent = 'Preparing a response';
        actions.innerHTML = '';
      } else if (channel === 'sneebly' && isRunning) {
        newBannerState = 'running';
        banner.className = 'status-banner visible working';
        icon.innerHTML = '&#9881;';
        title.textContent = 'Sneebly is working';
        sub.textContent = 'Cycle ' + (state.currentCycle || 0) + ' in progress';
        actions.innerHTML = '<button class="status-action secondary" onclick="stopAutonomy()">Stop</button>';
      } else if (channel === 'sneebly' && (isBudgetExceeded || isBudgetIssue)) {
        newBannerState = 'budget';
        banner.className = 'status-banner visible error-state';
        icon.innerHTML = '&#9888;';
        title.textContent = 'Budget exceeded';
        sub.textContent = 'The autonomy loop has stopped because the cost limit was reached';
        actions.innerHTML = '<button class="status-action warning" onclick="useSuggestion(\\'sneebly\\',\\'Increase the budget and continue working\\')">Increase Budget</button>';
      } else if (isWaiting || isQuestion) {
        newBannerState = 'waiting-' + channel;
        banner.className = 'status-banner visible waiting';
        icon.innerHTML = '&#128276;';
        title.textContent = 'Needs your input';
        var lastQ = extractQuestion(msg);
        sub.textContent = lastQ ? lastQ : 'Claude asked a question — scroll down to see it';
        var btns = '';
        if (channel === 'sneebly' && /start.*autonomy|start.*loop|proceed|resume/i.test(msg)) {
          btns += '<button class="status-action success" onclick="startAutonomy()">Start Autonomy</button>';
          btns += '<button class="status-action secondary" onclick="useSuggestion(\\'sneebly\\',\\'Yes, proceed\\')">Yes, proceed</button>';
        } else if (/proceed|go ahead|continue|resume/i.test(msg)) {
          btns += '<button class="status-action primary" onclick="useSuggestion(\\'' + channel + '\\',\\'Yes, go ahead\\')">Yes, go ahead</button>';
          btns += '<button class="status-action secondary" onclick="useSuggestion(\\'' + channel + '\\',\\'Hold on, let me review first\\')">Review first</button>';
        } else if (/would you like|want me to|should i|shall i/i.test(msg)) {
          btns += '<button class="status-action primary" onclick="useSuggestion(\\'' + channel + '\\',\\'Yes, do it\\')">Yes, do it</button>';
          btns += '<button class="status-action secondary" onclick="useSuggestion(\\'' + channel + '\\',\\'No, not right now\\')">Not now</button>';
        } else {
          btns += '<button class="status-action primary" onclick="document.getElementById(\\'input-' + channel + '\\').focus()">Reply</button>';
        }
        actions.innerHTML = btns;
      } else if (channel === 'sneebly' && !isRunning && !isPaused && state && !state.lastCycleResult) {
        newBannerState = 'ready';
        banner.className = 'status-banner visible stopped';
        icon.innerHTML = '&#9654;';
        title.textContent = 'Sneebly is ready';
        sub.textContent = 'Start the autonomy loop to begin working, or chat to discuss';
        actions.innerHTML = '<button class="status-action primary" onclick="startAutonomy()">Start Autonomy</button>' +
          '<button class="status-action secondary" onclick="triggerOneCycle()">Run 1 Cycle</button>';
      } else if (channel === 'sneebly' && isPaused && !isBudgetExceeded) {
        newBannerState = 'paused';
        banner.className = 'status-banner visible waiting';
        icon.innerHTML = '&#9208;';
        title.textContent = 'Sneebly is paused';
        sub.textContent = state.lastCycleTime ? 'Last active ' + timeAgo(state.lastCycleTime) : 'Paused by safety controls';
        actions.innerHTML = '<button class="status-action primary" onclick="resumeAutonomy()">Resume</button>' +
          '<button class="status-action secondary" onclick="triggerOneCycle()">Run 1 Cycle</button>';
      } else {
        if (currentBannerState[channel] === newBannerState) return;
        banner.className = 'status-banner';
        actions.innerHTML = '';
        currentBannerState[channel] = '';
        return;
      }
      currentBannerState[channel] = newBannerState;
    }

    async function startAutonomy() {
      try {
        await fetch(CC + '/autonomy/start', { method: 'POST', headers: H, body: JSON.stringify({ intervalMs: 120000 }) });
        useSuggestion('sneebly', 'Autonomy loop started. What is the current plan?');
      } catch(e) { console.error('Start failed', e); }
    }

    async function stopAutonomy() {
      try {
        await fetch(CC + '/autonomy/stop', { method: 'POST', headers: H });
        updateBannerForChannel('sneebly');
      } catch(e) {}
    }

    async function resumeAutonomy() {
      try {
        await fetch(CC + '/autonomy/resume', { method: 'POST', headers: H });
        updateBannerForChannel('sneebly');
      } catch(e) {}
    }

    async function triggerOneCycle() {
      try {
        var res = await fetch(CC + '/autonomy/trigger', { method: 'POST', headers: H });
        var data = await res.json();
        if (data.result) {
          addMessage('sneebly', 'assistant', 'Cycle completed: ' + data.result, {});
        }
      } catch(e) { console.error('Cycle failed', e); }
    }

    var bottomExpanded = false;
    var currentBottomTab = 'teams';

    function toggleBottomBar() {
      bottomExpanded = !bottomExpanded;
      var bar = document.getElementById('bottom-bar');
      if (bottomExpanded) {
        bar.classList.add('expanded');
        refreshBottomPanel();
      } else {
        bar.classList.remove('expanded');
      }
    }

    function switchBottomTab(tab) {
      currentBottomTab = tab;
      var tabs = ['teams','expenses','snapshots','comms','experiments','feature-tests','knowledge'];
      for (var i = 0; i < tabs.length; i++) {
        var btn = document.getElementById('btab-' + tabs[i]);
        var panel = document.getElementById('bp-' + tabs[i]);
        if (tabs[i] === tab) {
          btn.classList.add('active');
          panel.style.display = 'block';
        } else {
          btn.classList.remove('active');
          panel.style.display = 'none';
        }
      }
      if (!bottomExpanded) {
        bottomExpanded = true;
        document.getElementById('bottom-bar').classList.add('expanded');
      }
      refreshBottomPanel();
    }

    async function refreshBottomPanel() {
      if (currentBottomTab === 'teams') await refreshTeams();
      else if (currentBottomTab === 'expenses') await refreshExpenses();
      else if (currentBottomTab === 'snapshots') await refreshSnapshots();
      else if (currentBottomTab === 'comms') await refreshComms();
      else if (currentBottomTab === 'experiments') await refreshExperiments();
      else if (currentBottomTab === 'feature-tests') await refreshFeatureTests();
      else if (currentBottomTab === 'knowledge') await refreshKnowledge();
    }

    async function refreshTeams() {
      try {
        var res = await fetch(CC + '/teams', { headers: H });
        var data = await res.json();
        var el = document.getElementById('bp-teams');
        var teams = data.teams || [];
        document.getElementById('team-count').textContent = teams.length;
        if (teams.length === 0) {
          el.innerHTML = '<div class="no-data">No active teams. Use chat to spawn teams or start orchestration.</div>';
          return;
        }
        var html = '<div class="team-grid">';
        for (var i = 0; i < teams.length; i++) {
          var t = teams[i];
          html += '<div class="team-card">';
          html += '<div class="team-card-head"><span class="team-card-name">' + esc(t.name) + '</span>';
          html += '<span class="team-card-status ' + t.status + '">' + t.status + '</span></div>';
          html += '<div class="team-card-goal">' + esc(t.goal || '').slice(0,80) + '</div>';
          html += '<div class="team-card-stats">';
          html += '<span>' + (t.stepsDone||0) + '/' + (t.stepsTotal||0) + ' steps</span>';
          html += '<span>' + fmt$(t.totalCost) + '</span>';
          html += '<span>' + (t.filesModified||[]).length + ' files</span>';
          html += '</div></div>';
        }
        html += '</div>';
        el.innerHTML = html;
      } catch(e) { console.error('Teams refresh failed', e); }
    }

    async function refreshExpenses() {
      try {
        var results = await Promise.all([
          fetch(CC + '/expenses', { headers: H }).then(function(r) { return r.json(); }),
          fetch(CC + '/budget', { headers: H }).then(function(r) { return r.json(); }),
        ]);
        var exp = results[0] || {};
        var budget = results[1] || {};
        var el = document.getElementById('bp-expenses');
        var spent = exp.totalSpent || 0;
        var limit = budget.limit || 100;
        var pct = limit > 0 ? Math.min((spent/limit)*100, 100) : 0;
        var barColor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : 'var(--green)';
        var html = '<div class="expense-summary">';
        html += '<div class="expense-card"><div class="expense-card-label">Total Spent</div>';
        html += '<div class="expense-card-value">' + fmt$(spent) + '</div>';
        html += '<div class="budget-bar"><div class="budget-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>';
        html += '<div class="expense-card-sub">' + pct.toFixed(0) + '% of ' + fmt$(limit) + ' budget (' + (budget.mode||'notify') + ' mode)</div></div>';
        html += '<div class="expense-card"><div class="expense-card-label">Today</div>';
        html += '<div class="expense-card-value">' + fmt$(exp.todaySpent || 0) + '</div>';
        html += '<div class="expense-card-sub">' + (exp.todayCalls || 0) + ' API calls</div></div>';
        html += '<div class="expense-card"><div class="expense-card-label">Avg / Call</div>';
        html += '<div class="expense-card-value">' + fmt$(exp.avgCostPerCall || 0) + '</div>';
        html += '<div class="expense-card-sub">' + (exp.totalCalls || 0) + ' total calls</div></div>';
        if (exp.projectedTotal) {
          html += '<div class="expense-card"><div class="expense-card-label">Projected Total</div>';
          html += '<div class="expense-card-value">' + fmt$(exp.projectedTotal) + '</div>';
          html += '<div class="expense-card-sub">Based on burn rate</div></div>';
        }
        var byAgent = exp.byAgent || [];
        if (byAgent.length > 0) {
          html += '<div class="expense-card" style="grid-column:1/-1"><div class="expense-card-label">By Agent</div>';
          html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">';
          for (var i = 0; i < Math.min(byAgent.length, 6); i++) {
            html += '<span style="font-size:11px"><strong>' + esc(byAgent[i].agent || '') + ':</strong> ' + fmt$(byAgent[i].cost) + '</span>';
          }
          html += '</div></div>';
        }
        html += '</div>';
        el.innerHTML = html;
      } catch(e) { console.error('Expenses refresh failed', e); }
    }

    async function refreshSnapshots() {
      try {
        var res = await fetch(CC + '/snapshots?limit=10', { headers: H });
        var data = await res.json();
        var el = document.getElementById('bp-snapshots');
        var snaps = data.snapshots || [];
        if (snaps.length === 0) {
          el.innerHTML = '<div class="no-data">No snapshots yet. Snapshots are created automatically before team work, or create one manually.</div>';
          return;
        }
        var html = '<div class="snapshot-list">';
        for (var i = 0; i < snaps.length; i++) {
          var s = snaps[i];
          html += '<div class="snapshot-row">';
          html += '<span class="snapshot-label">' + esc(s.label || s.id) + '</span>';
          html += '<span class="snapshot-time">' + (s.timestamp ? timeAgo(s.timestamp) : '--') + '</span>';
          html += '<span style="font-size:10px;color:var(--text-dim)">' + (s.filesCount || 0) + ' files</span>';
          html += '<button class="snapshot-btn" onclick="rollbackTo(\\'' + s.id + '\\')">Rollback</button>';
          html += '</div>';
        }
        html += '</div>';
        el.innerHTML = html;
      } catch(e) { console.error('Snapshots refresh failed', e); }
    }

    async function refreshComms() {
      try {
        var results = await Promise.all([
          fetch(CC + '/comms', { headers: H }).then(function(r) { return r.json(); }),
          fetch(CC + '/comms/messages?limit=20', { headers: H }).then(function(r) { return r.json(); }),
        ]);
        var stats = results[0] || {};
        var msgs = (results[1] || {}).messages || [];
        var el = document.getElementById('bp-comms');
        var html = '<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">Messages: ' + (stats.totalMessages||0) + '</div>';
        if (msgs.length === 0) {
          html += '<div class="no-data">No team messages yet.</div>';
        } else {
          for (var i = 0; i < msgs.length; i++) {
            var m = msgs[i];
            html += '<div style="padding:4px 8px;font-size:11px;border-bottom:1px solid var(--border)">';
            html += '<span style="color:var(--accent);font-weight:600">' + esc(m.from||'') + '</span>';
            html += ' &rarr; <span style="color:var(--text-muted)">' + esc(m.to||'all') + '</span>';
            html += ' <span style="color:var(--text-dim);font-size:10px;margin-left:6px">' + (m.type||'') + '</span>';
            html += '<div style="color:var(--text)">' + esc((m.content||'').slice(0,120)) + '</div>';
            html += '</div>';
          }
        }
        el.innerHTML = html;
      } catch(e) { console.error('Comms refresh failed', e); }
    }

    async function refreshExperiments() {
      try {
        var [summaryRes, metricsRes] = await Promise.all([
          fetch('/api/sneebly/experiments', { headers: H }),
          fetch('/api/sneebly/experiments/metrics', { headers: H }),
        ]);
        var data = await summaryRes.json();
        var metricsData = await metricsRes.json();
        var el = document.getElementById('bp-experiments');
        var statusColors = { kept: '#22c55e', discarded: '#f97316', crashed: '#ef4444', skipped: '#6b7280' };

        var totalGain = 0;
        var experiments = data.recentExperiments || [];
        for (var k = 0; k < experiments.length; k++) {
          var ek = experiments[k];
          if (ek.status === 'kept' && ek.comparison && ek.comparison.delta) {
            totalGain += (ek.comparison.delta.score || 0);
          }
        }

        var html = '<div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;border-bottom:1px solid var(--border)">';
        html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Total:</span> <strong>' + (data.total||0) + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:#22c55e">&#10003; kept:</span> <strong>' + (data.kept||0) + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:#f97316">discarded:</span> <strong>' + (data.discarded||0) + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:var(--text-muted)">success:</span> <strong>' + (data.successRate||0) + '%</strong></div>';
        html += '<div style="font-size:11px"><span style="color:var(--text-muted)">total gain:</span> <strong style="color:' + (totalGain >= 0 ? '#22c55e' : '#ef4444') + '">' + (totalGain >= 0 ? '+' : '') + totalGain + ' pts</strong></div>';
        if (metricsData && metricsData.score !== undefined) {
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">score now:</span> <strong>' + metricsData.score + '/100</strong></div>';
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">TSC:</span> <strong style="color:' + (metricsData.tscErrorCount > 0 ? '#ef4444' : '#22c55e') + '">' + metricsData.tscErrorCount + '</strong></div>';
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">latency:</span> <strong>' + (metricsData.avgApiLatencyMs||'?') + 'ms</strong></div>';
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">bundle:</span> <strong>' + (metricsData.bundleSizeEstimateKb||'?') + 'kb</strong></div>';
        }
        html += '<button onclick="triggerExperiment()" style="margin-left:auto;padding:3px 10px;font-size:11px;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer">Run Experiment</button>';
        html += '</div>';

        var withScores = experiments.filter(function(e) { return e.metricsAfter && e.status !== 'skipped'; });
        if (withScores.length >= 2) {
          html += '<div style="padding:6px 12px;border-bottom:1px solid var(--border)">';
          html += '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Score trend (last ' + withScores.length + ' experiments)</div>';
          html += '<div style="display:flex;align-items:flex-end;gap:3px;height:30px">';
          var scores = withScores.map(function(e) { return e.metricsAfter ? e.metricsAfter.score : 0; });
          var minS = Math.min.apply(null, scores);
          var maxS = Math.max.apply(null, scores);
          var range = Math.max(maxS - minS, 1);
          for (var si = 0; si < scores.length; si++) {
            var barH = Math.max(4, Math.round(((scores[si] - minS) / range) * 26));
            var barColor = withScores[si].status === 'kept' ? '#22c55e' : '#6b7280';
            html += '<div title="' + scores[si] + '/100" style="width:8px;height:' + barH + 'px;background:' + barColor + ';border-radius:2px 2px 0 0;flex-shrink:0"></div>';
          }
          html += '</div>';
          html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-dim);margin-top:2px"><span>' + (withScores[0].metricsAfter ? withScores[0].metricsAfter.score : '?') + '</span><span>' + (withScores[withScores.length-1].metricsAfter ? withScores[withScores.length-1].metricsAfter.score : '?') + '</span></div>';
          html += '</div>';
        }

        if (experiments.length === 0) {
          html += '<div class="no-data">No experiments yet. The loop runs automatically when the roadmap is complete or waiting.</div>';
        } else {
          html += '<div style="overflow-y:auto;max-height:110px">';
          for (var i = experiments.length - 1; i >= 0; i--) {
            var e = experiments[i];
            var color = statusColors[e.status] || '#6b7280';
            var scoreBefore = e.metricsBefore ? e.metricsBefore.score : '?';
            var scoreAfter = e.metricsAfter ? e.metricsAfter.score : '?';
            var delta = e.comparison ? (e.comparison.delta.score >= 0 ? '+' : '') + e.comparison.delta.score : '';
            html += '<div style="padding:4px 10px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">';
            html += '<span style="font-size:10px;color:' + color + ';font-weight:700;min-width:56px">' + esc(e.status) + '</span>';
            html += '<span style="font-size:11px;flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc((e.hypothesis||'').slice(0,70)) + '</span>';
            if (delta) html += '<span style="font-size:10px;color:' + color + ';min-width:36px;text-align:right">' + esc(delta) + 'pt</span>';
            html += '<span style="font-size:10px;color:var(--text-dim);min-width:40px;text-align:right">' + scoreBefore + '→' + scoreAfter + '</span>';
            html += '</div>';
          }
          html += '</div>';
        }
        el.innerHTML = html;
      } catch(e) { console.error('Experiments refresh failed', e); }
    }

    async function triggerExperiment() {
      try {
        var res = await fetch('/api/sneebly/experiments/run', { method:'POST', headers: H });
        var data = await res.json();
        addMessage('sneebly', 'assistant', 'Experiment started: ' + (data.message || ''), {});
        setTimeout(refreshExperiments, 5000);
      } catch(e) {
        addMessage('sneebly', 'assistant', 'Failed to trigger experiment: ' + e.message, { isError: true });
      }
    }

    async function refreshFeatureTests() {
      try {
        var res = await fetch('/api/sneebly/feature-tests', { headers: H });
        var data = await res.json();
        var el = document.getElementById('bp-feature-tests');
        var features = data.features || [];
        var tested = features.filter(function(f) { return f.lastTestResult; });
        var passed = tested.filter(function(f) { return f.lastTestResult && f.lastTestResult.passed; }).length;
        var failed = tested.filter(function(f) { return f.lastTestResult && !f.lastTestResult.passed; }).length;
        var noTest = features.filter(function(f) { return f.status === 'done' && !f.lastTestResult; }).length;

        var failBadge = document.getElementById('feat-fail-count');
        if (failed > 0) {
          failBadge.textContent = failed;
          failBadge.style.display = 'inline';
        } else {
          failBadge.style.display = 'none';
        }

        var html = '<div style="padding:6px 12px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;border-bottom:1px solid var(--border)">';
        html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Features:</span> <strong>' + features.length + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:var(--green)">&#10003; pass:</span> <strong>' + passed + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:var(--red)">&#10007; fail:</span> <strong style="color:' + (failed > 0 ? 'var(--red)' : 'var(--text)') + '">' + failed + '</strong></div>';
        html += '<div style="font-size:11px"><span style="color:var(--text-dim)">untested:</span> <strong>' + noTest + '</strong></div>';
        html += '</div>';

        if (features.length === 0) {
          html += '<div class="no-data">No roadmap features found. Start the autonomy loop to begin building.</div>';
        } else {
          html += '<div style="overflow-y:auto;max-height:150px">';
          for (var i = 0; i < features.length; i++) {
            var f = features[i];
            var tr = f.lastTestResult;
            var statusDot, statusLabel, statusSub;
            if (tr) {
              if (tr.passed && !tr.skipped) {
                statusDot = 'var(--green)';
                statusLabel = 'pass';
              } else if (tr.skipped) {
                statusDot = 'var(--yellow)';
                statusLabel = 'pending test';
              } else {
                statusDot = 'var(--red)';
                statusLabel = 'fail';
              }
              statusSub = f.status !== 'done' ? ' (' + f.status + ')' : '';
            } else if (f.status === 'done') {
              statusDot = 'var(--yellow)';
              statusLabel = 'no test';
              statusSub = '';
            } else {
              statusDot = 'var(--text-dim)';
              statusLabel = f.status;
              statusSub = '';
            }
            html += '<div style="padding:5px 12px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center">';
            html += '<div style="width:7px;height:7px;border-radius:50%;background:' + statusDot + ';flex-shrink:0"></div>';
            html += '<span style="font-size:10px;min-width:72px;color:' + statusDot + ';font-weight:600">' + esc(statusLabel) + (statusSub ? '<span style="color:var(--text-dim);font-weight:400">' + esc(statusSub) + '</span>' : '') + '</span>';
            html += '<span style="font-size:11px;flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.title || f.id) + '</span>';
            if (tr && tr.durationMs) {
              html += '<span style="font-size:10px;color:var(--text-dim);min-width:44px;text-align:right">' + tr.durationMs + 'ms</span>';
            }
            if (tr && !tr.passed && !tr.skipped && tr.output) {
              html += '</div><div style="padding:3px 12px 5px 27px;font-size:10px;color:var(--red);font-family:var(--mono);border-bottom:1px solid var(--border)">' + esc(tr.output.slice(0, 160));
            }
            html += '</div>';
          }
          html += '</div>';
        }
        el.innerHTML = html;
      } catch(e) { console.error('Feature tests refresh failed', e); }
    }

    async function runFeatureTest(featureId) {
      try {
        var res = await fetch('/api/sneebly/feature-tests/' + featureId + '/run', { method:'POST', headers: H });
        var data = await res.json();
        addMessage('sneebly', 'assistant', 'Feature test run: ' + featureId + ' — ' + (data.passed ? 'PASSED' : 'FAILED'), {});
        setTimeout(refreshFeatureTests, 2000);
      } catch(e) {
        addMessage('sneebly', 'assistant', 'Failed to run feature test: ' + e.message, { isError: true });
      }
    }

    async function refreshKnowledge() {
      try {
        var res = await fetch('/api/sneebly/knowledge', { headers: H });
        var data = await res.json();
        var researchRes = await fetch('/api/sneebly/research', { headers: H });
        var researchData = researchRes.ok ? await researchRes.json() : null;
        var el = document.getElementById('bp-knowledge');
        var entries = data.recentEntries || [];
        var qualityHistory = data.qualityTrend || [];

        var kbBadge = document.getElementById('kb-count');
        if (kbBadge) kbBadge.textContent = data.totalEntries || entries.length;

        if (entries.length === 0) {
          el.innerHTML = '<div class="no-data">No knowledge entries yet. Knowledge is recorded as Sneebly successfully builds features.</div>';
          return;
        }

        var latest = qualityHistory.length > 0 ? qualityHistory[qualityHistory.length - 1] : null;
        var html = '<div style="padding:6px 12px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;border-bottom:1px solid var(--border)">';
        html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Entries:</span> <strong>' + (data.totalEntries || entries.length) + '</strong></div>';
        if (latest !== null) {
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Test Pass Rate:</span> <strong style="color:var(--green)">' + latest.testPassRate + '%</strong></div>';
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Build Success:</span> <strong style="color:' + (latest.buildSuccessRate >= 50 ? 'var(--green)' : 'var(--red)') + '">' + latest.buildSuccessRate + '%</strong></div>';
          if (latest.tscErrors > 0) {
            html += '<div style="font-size:11px"><span style="color:var(--red)">TSC Errors:</span> <strong style="color:var(--red)">' + latest.tscErrors + '</strong></div>';
          }
        }
        html += '<div style="font-size:11px;color:var(--text-dim)">Patterns seed future builds</div>';
        if (researchData) {
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Research cycles:</span> <strong>' + (researchData.totalCycles || 0) + '</strong></div>';
          html += '<div style="font-size:11px"><span style="color:var(--text-muted)">Conventions synthesized:</span> <strong style="color:var(--blue)">' + (researchData.totalConventionsGenerated || 0) + '</strong></div>';
          html += '<button onclick="runResearch()" style="margin-left:auto;font-size:10px;padding:2px 8px;background:var(--blue);color:#fff;border:none;border-radius:4px;cursor:pointer">Run Research</button>';
        }
        html += '</div>';

        if (researchData && researchData.costTrend && researchData.costTrend.length > 1) {
          html += '<div style="padding:4px 12px 0;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;border-bottom:1px solid var(--border)">Cost Per Feature Trend</div>';
          html += '<div style="overflow-x:auto;max-height:60px;border-bottom:1px solid var(--border)">';
          html += '<table style="width:100%;border-collapse:collapse;font-size:10px">';
          html += '<tr style="background:var(--surface-raised)">';
          html += '<th style="padding:3px 8px;text-align:left;color:var(--text-dim);font-weight:500">Research Cycle</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">Features</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">Avg $/feature</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">vs prev</th>';
          html += '</tr>';
          var trend = researchData.costTrend;
          for (var ti = 0; ti < trend.length; ti++) {
            var ct = trend[ti];
            var prev = ti > 0 ? trend[ti - 1].avgCostPerFeature : null;
            var delta = prev !== null ? (ct.avgCostPerFeature - prev) : null;
            var deltaColor = delta === null ? 'var(--text-dim)' : delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-dim)';
            var deltaStr = delta === null ? '—' : (delta < 0 ? '' : '+') + '$' + Math.abs(delta).toFixed(4);
            html += '<tr style="border-top:1px solid var(--border)">';
            html += '<td style="padding:2px 8px;color:var(--text-dim)">' + esc(new Date(ct.timestamp).toLocaleDateString()) + '</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:var(--text-dim)">' + ct.featuresCompleted + '</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:var(--text)">' + '$' + ct.avgCostPerFeature.toFixed(4) + '</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:' + deltaColor + ';font-weight:600">' + esc(deltaStr) + '</td>';
            html += '</tr>';
          }
          html += '</table></div>';
        }

        if (researchData && researchData.recentCycles && researchData.recentCycles.length > 0) {
          html += '<div style="padding:4px 12px 0;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;border-bottom:1px solid var(--border)">Recent Research (' + researchData.recentCycles.length + ')</div>';
          html += '<div style="overflow-y:auto;max-height:70px;border-bottom:1px solid var(--border)">';
          for (var ri = 0; ri < researchData.recentCycles.length; ri++) {
            var rc = researchData.recentCycles[ri];
            html += '<div style="padding:4px 12px;border-top:1px solid var(--border)">';
            html += '<div style="display:flex;gap:8px;align-items:center">';
            html += '<span style="font-size:10px;color:var(--blue);font-weight:600">RESEARCH</span>';
            html += '<span style="font-size:10px;color:var(--text-dim)">' + esc(new Date(rc.timestamp).toLocaleString()) + '</span>';
            html += '<span style="font-size:10px;color:var(--green);margin-left:auto">+' + rc.conventionsGenerated + ' conventions</span>';
            html += '</div>';
            if (rc.conventions && rc.conventions.length > 0) {
              html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
              html += esc(rc.conventions.map(function(cv) { return cv.title; }).join(' · '));
              html += '</div>';
            }
            if (rc.error) {
              html += '<div style="font-size:10px;color:var(--red);margin-top:1px">' + esc(rc.error.slice(0, 80)) + '</div>';
            }
            html += '</div>';
          }
          html += '</div>';
        }

        if (qualityHistory.length > 0) {
          html += '<div style="padding:4px 12px 0;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase;border-bottom:1px solid var(--border)">Quality Trend (last ' + Math.min(qualityHistory.length, 10) + ' cycles)</div>';
          html += '<div style="overflow-x:auto;max-height:70px;border-bottom:1px solid var(--border)">';
          html += '<table style="width:100%;border-collapse:collapse;font-size:10px">';
          html += '<tr style="background:var(--surface-raised)">';
          html += '<th style="padding:3px 8px;text-align:left;color:var(--text-dim);font-weight:500">Cycle</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">TSC Errors</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">Test Pass %</th>';
          html += '<th style="padding:3px 8px;text-align:right;color:var(--text-dim);font-weight:500">Build %</th>';
          html += '</tr>';
          var recent10 = qualityHistory.slice(-10);
          for (var ci = 0; ci < recent10.length; ci++) {
            var cyc = recent10[ci];
            var cycDate = new Date(cyc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            html += '<tr style="border-top:1px solid var(--border)">';
            html += '<td style="padding:2px 8px;color:var(--text-dim)">' + esc(cycDate) + '</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:' + (cyc.tscErrors > 0 ? 'var(--red)' : 'var(--green)') + '">' + cyc.tscErrors + '</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:' + (cyc.testPassRate >= 80 ? 'var(--green)' : cyc.testPassRate >= 50 ? 'var(--yellow)' : 'var(--red)') + '">' + cyc.testPassRate + '%</td>';
            html += '<td style="padding:2px 8px;text-align:right;color:' + (cyc.buildSuccessRate >= 80 ? 'var(--green)' : cyc.buildSuccessRate >= 50 ? 'var(--yellow)' : 'var(--red)') + '">' + cyc.buildSuccessRate + '%</td>';
            html += '</tr>';
          }
          html += '</table>';
          html += '</div>';
        }

        html += '<div style="padding:4px 12px 0;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.05em;text-transform:uppercase">Recent Knowledge (' + entries.length + ')</div>';
        html += '<div style="overflow-y:auto;max-height:90px">';
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          var typeColor = e.entryType === 'feature' ? 'var(--green)' : e.entryType === 'convention' ? 'var(--blue)' : 'var(--orange)';
          var delta = e.qualityDelta || 0;
          var deltaStr = delta > 0 ? '+' + delta : delta < 0 ? '' + delta : '';
          html += '<div style="padding:5px 12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-start">';
          html += '<div style="width:7px;height:7px;border-radius:50%;background:' + typeColor + ';flex-shrink:0;margin-top:4px"></div>';
          html += '<div style="flex:1;min-width:0">';
          html += '<div style="display:flex;gap:6px;align-items:center">';
          html += '<span style="font-size:10px;color:' + typeColor + ';font-weight:600;text-transform:uppercase">' + esc(e.entryType || 'feature') + '</span>';
          html += '<span style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' + esc(e.title || e.featureId) + '</span>';
          if (deltaStr) {
            html += '<span style="font-size:10px;color:' + (delta > 0 ? 'var(--green)' : 'var(--red)') + '">' + esc(deltaStr) + '</span>';
          }
          html += '</div>';
          if (e.approach) {
            html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.approach.slice(0, 120)) + '</div>';
          }
          if (e.filesModified && e.filesModified.length > 0) {
            html += '<div style="font-size:10px;color:var(--text-dim);margin-top:1px">' + esc(e.filesModified.slice(0, 3).join(', ')) + (e.filesModified.length > 3 ? ' +' + (e.filesModified.length - 3) + ' more' : '') + '</div>';
          }
          html += '</div>';
          html += '</div>';
        }
        html += '</div>';
        el.innerHTML = html;
      } catch(e) { console.error('Knowledge refresh failed', e); }
    }

    async function runResearch() {
      try {
        addMessage('sneebly', 'assistant', 'Running research cycle... Analyzing build patterns to synthesize new conventions.', {});
        var res = await fetch('/api/sneebly/research/run', { method: 'POST', headers: H });
        var data = await res.json();
        if (data.error) throw new Error(data.error);
        addMessage('sneebly', 'assistant', 'Research complete: synthesized ' + (data.conventionsGenerated || 0) + ' new conventions in ' + Math.round((data.durationMs || 0) / 1000) + 's. Knowledge base updated.', {});
        setTimeout(refreshKnowledge, 1000);
      } catch(e) {
        addMessage('sneebly', 'assistant', 'Research cycle failed: ' + e.message, { isError: true });
      }
    }

    async function rollbackTo(snapId) {
      if (!confirm('Roll back to this snapshot? This will undo all changes since then.')) return;
      try {
        var res = await fetch(CC + '/rollback/' + snapId, { method: 'POST', headers: H });
        var data = await res.json();
        addMessage('sneebly', 'assistant', 'Rolled back to snapshot ' + snapId + '. ' + (data.filesRestored || 0) + ' files restored.', {});
        refreshSnapshots();
      } catch(e) {
        addMessage('sneebly', 'assistant', 'Rollback failed: ' + e.message, { isError: true });
      }
    }

    // ── Textarea paste → image support ───────────────────────────────────
    ['sneebly', 'app'].forEach(function(ch) {
      var ta = document.getElementById('input-' + ch);
      if (!ta) return;
      ta.addEventListener('paste', function(e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            e.preventDefault();
            var blob = items[i].getAsFile();
            if (blob) addImageChip(ch, blob, Date.now() + i);
            return;
          }
        }
      });
    });

    loadHistory();
    pollActivity();
    async function refreshChatUserActions() {
      try {
        var res = await fetch(CC + '/user-actions', { headers: H });
        var data = await res.json();
        var box = document.getElementById('user-actions-chat-box');
        if (!data.actions || data.actions.length === 0) {
          box.style.display = 'none';
          return;
        }
        box.style.display = 'block';
        box.innerHTML = '<div style="font-size:12px; font-weight:600; color:#f97316; margin-bottom:6px;">&#9888; Action Needed</div>' +
          data.actions.map(function(a) {
            var promptHtml = a.prompt
              ? '<div style="margin-top:6px; padding:8px 10px; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.3); border-radius:6px; font-family:monospace; font-size:11px; color:#fb923c; white-space:pre-wrap; cursor:pointer;" onclick="navigator.clipboard.writeText(this.textContent.trim()).then(function(){var t=document.createElement(\\'div\\');t.textContent=\\'Copied!\\';t.style.cssText=\\'position:fixed;top:20px;right:20px;background:#22c55e;color:white;padding:8px 16px;border-radius:6px;z-index:9999;\\';document.body.appendChild(t);setTimeout(function(){t.remove()},2000)})" title="Click to copy">' + a.prompt + '</div>'
              : '';
            return '<div style="margin-bottom:6px;"><strong style="color:#f97316; font-size:12px;">' + a.title + '</strong>' +
              '<div style="color:var(--text-muted); font-size:11px; margin-top:2px;">' + a.message + '</div>' +
              promptHtml + '</div>';
          }).join('');
      } catch(e) {}
    }
    refreshChatUserActions();
    ${processBarJs}
    setInterval(pollActivity, 3000);
    setInterval(function() { updateBannerForChannel('sneebly'); updateBannerForChannel('app'); }, 2000);
    setInterval(function() { if (bottomExpanded) refreshBottomPanel(); }, 10000);
    setInterval(refreshChatUserActions, 5000);
  </script>
</body>
</html>`;
}
