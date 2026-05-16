import { getNavCss, getNavHtml, getProcessBarJs } from "./shared-nav";

export function getCommandCenterHtml(sneeblyKey: string): string {
  const navCss = getNavCss();
  const navHtml = getNavHtml(sneeblyKey, "overview");
  const processBarJs = getProcessBarJs(sneeblyKey);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sneebly Overview</title>
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

    .shell { max-width: 1440px; margin: 0 auto; padding: 18px 20px 40px; }

    /* ── Hero strip ── */
    .hero {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;
      margin-bottom: 16px;
    }
    .hero-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 14px 16px; position: relative; overflow: hidden;
    }
    .hero-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
    .hero-card.green::before { background: var(--green); }
    .hero-card.blue::before  { background: var(--blue);  }
    .hero-card.purple::before{ background: var(--purple);}
    .hero-card.orange::before{ background: var(--orange);}
    .hero-card.cyan::before  { background: #22d3ee;      }
    .hero-label { font-size: 10px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; }
    .hero-value { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1; }
    .hero-sub   { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

    /* ── Top grid: controls + roadmap ── */
    .top-grid {
      display: grid; grid-template-columns: 380px 1fr; gap: 14px; margin-bottom: 14px;
    }

    /* ── Mid grid: activity + costs + system ── */
    .mid-grid {
      display: grid; grid-template-columns: 1fr 280px 280px; gap: 14px; margin-bottom: 14px;
    }

    /* ── Card ── */
    .card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      overflow: hidden; display: flex; flex-direction: column;
    }
    .card-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .card-title { font-size: 12px; font-weight: 700; letter-spacing: -0.01em; text-transform: uppercase; color: var(--text-dim); }
    .card-body  { padding: 14px 16px; flex: 1; overflow: hidden; }
    .card-body.flush { padding: 0; }
    .card-body.scroll { overflow-y: auto; }
    .card-foot { padding: 10px 14px; border-top: 1px solid var(--border); flex-shrink: 0; }

    /* ── Badges ── */
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
      letter-spacing: 0.02em;
    }
    .badge.green  { background: var(--green-dim);  color: var(--green); }
    .badge.red    { background: var(--red-dim);    color: var(--red);   }
    .badge.yellow { background: var(--yellow-dim); color: var(--yellow);}
    .badge.blue   { background: var(--blue-dim);   color: var(--blue);  }
    .badge.purple { background: var(--purple-dim); color: var(--purple);}
    .badge.muted  { background: var(--surface-raised); color: var(--text-dim); }

    /* ── Control card ── */
    .status-row {
      display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
    }
    .live-dot {
      width: 9px; height: 9px; border-radius: 50%; background: var(--text-dim); flex-shrink: 0;
    }
    .live-dot.active {
      background: var(--green); box-shadow: 0 0 0 3px rgba(34,197,94,0.2);
      animation: pulse-dot 2s ease-in-out infinite;
    }
    @keyframes pulse-dot { 0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.2)} 50%{box-shadow:0 0 0 6px rgba(34,197,94,0.1)} }
    .status-label { font-size: 13px; font-weight: 600; }

    .now-box {
      background: var(--accent-glow); border: 1px solid rgba(99,102,241,0.2);
      border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;
    }
    .now-action { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
    .now-detail { font-size: 11px; color: var(--text-muted); }
    .now-idle {
      color: var(--text-dim); font-size: 12px; padding: 12px 14px;
      background: var(--surface-raised); border-radius: 8px; margin-bottom: 12px;
    }
    .now-header {
      display: flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 700; color: var(--accent);
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;
    }
    .pulse-ring {
      width: 8px; height: 8px; border-radius: 50%; background: var(--accent);
      position: relative;
    }
    .pulse-ring::after {
      content: ''; position: absolute; inset: -3px; border-radius: 50%;
      border: 2px solid var(--accent);
      animation: ping 2s cubic-bezier(0,0,0.2,1) infinite; opacity: 0;
    }
    @keyframes ping { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(1.8);opacity:0} }

    .plan-goal {
      font-size: 12px; font-weight: 600; padding: 8px 12px;
      background: var(--surface-raised); border-radius: 6px;
      border-left: 3px solid var(--accent); margin-bottom: 8px;
    }
    .plan-steps { max-height: 220px; overflow-y: auto; }
    .plan-step {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11px;
    }
    .plan-step:last-child { border-bottom: none; }
    .step-icon {
      width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; margin-top: 1px;
    }
    .step-icon.done    { background: var(--green-dim); color: var(--green); }
    .step-icon.active  { background: var(--accent-glow); color: var(--accent); animation: pulse-step 1.5s ease-in-out infinite; }
    .step-icon.pending { background: var(--surface-raised); color: var(--text-dim); }
    .step-icon.failed  { background: var(--red-dim); color: var(--red); }
    @keyframes pulse-step { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .step-text.done { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--text-dim); }

    .controls { display: flex; gap: 6px; flex-wrap: wrap; }
    .btn {
      padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface-raised); color: var(--text); font-size: 11px;
      font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: var(--sans);
      white-space: nowrap;
    }
    .btn:hover { background: var(--border); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn.primary  { background: var(--accent); border-color: var(--accent); color: white; }
    .btn.primary:hover { background: #5558e6; }
    .btn.danger   { background: var(--red-dim);   border-color: var(--red-border);   color: var(--red); }
    .btn.danger:hover  { background: rgba(239,68,68,0.2); }
    .btn.success  { background: var(--green-dim); border-color: var(--green-border); color: var(--green); }

    /* ── Roadmap ── */
    .roadmap-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
      max-height: 520px; overflow-y: auto;
    }
    .rm-item {
      display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px;
      background: var(--surface-raised); border-radius: 7px;
      border: 1px solid var(--border); transition: border-color 0.15s;
    }
    .rm-item.done    { border-color: var(--green-border); }
    .rm-item.in_progress { border-color: var(--blue-border); }
    .rm-icon { font-size: 14px; flex-shrink: 0; line-height: 1.4; }
    .rm-id   { font-size: 9px; font-family: var(--mono); color: var(--text-dim); }
    .rm-name { font-size: 11px; font-weight: 600; color: var(--text); line-height: 1.3; }
    .rm-deps { font-size: 9px; color: var(--text-dim); margin-top: 2px; }

    /* ── Progress bar ── */
    .prog-bar-track { height: 5px; background: var(--surface-raised); border-radius: 3px; overflow: hidden; margin-top: 6px; }
    .prog-bar-fill  { height: 100%; border-radius: 3px; background: var(--green); transition: width 0.4s; }

    /* ── Activity timeline ── */
    .timeline { overflow-y: auto; max-height: 400px; }
    .tl-entry {
      display: grid; grid-template-columns: 52px 1fr; gap: 0;
      border-bottom: 1px solid var(--border); font-size: 11px;
    }
    .tl-entry:hover { background: var(--surface-raised); }
    .tl-entry:last-child { border-bottom: none; }
    .tl-time { padding: 7px 8px; color: var(--text-dim); font-family: var(--mono); font-size: 10px; white-space: nowrap; }
    .tl-content { padding: 7px 10px; display: flex; align-items: flex-start; gap: 6px; }
    .tl-type {
      font-size: 8px; font-weight: 700; padding: 2px 5px; border-radius: 3px;
      text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; flex-shrink: 0;
    }
    .tl-type.success  { background: var(--green-dim);  color: var(--green); }
    .tl-type.error    { background: var(--red-dim);    color: var(--red); }
    .tl-type.warning  { background: var(--yellow-dim); color: var(--yellow); }
    .tl-type.info     { background: var(--blue-dim);   color: var(--blue); }
    .tl-type.heartbeat{ background: var(--purple-dim); color: var(--purple); }
    .tl-type.thinking { background: var(--surface-raised); color: var(--text-dim); }
    .tl-msg  { flex: 1; word-break: break-word; color: var(--text-muted); line-height: 1.3; }

    .filter-row { display: flex; gap: 4px; }
    .filter-btn {
      font-size: 9px; padding: 2px 8px; border-radius: 20px;
      border: 1px solid var(--border); background: transparent;
      color: var(--text-dim); cursor: pointer; font-family: var(--sans);
      font-weight: 600; transition: all 0.15s;
    }
    .filter-btn.active { background: var(--accent-glow); color: var(--accent); border-color: rgba(99,102,241,0.3); }

    /* ── Cost bars ── */
    .cost-stat-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;
    }
    .cost-stat { text-align: center; padding: 8px; background: var(--surface-raised); border-radius: 6px; }
    .cost-stat-val { font-size: 17px; font-weight: 800; font-family: var(--mono); }
    .cost-stat-lbl { font-size: 9px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; margin-top: 2px; }
    .cost-bar {
      display: flex; align-items: center; gap: 7px; padding: 5px 0;
      font-size: 11px; border-bottom: 1px solid var(--border);
    }
    .cost-bar:last-child { border-bottom: none; }
    .cost-bar-label { width: 80px; color: var(--text-muted); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cost-bar-track { flex: 1; height: 5px; background: var(--surface-raised); border-radius: 3px; overflow: hidden; }
    .cost-bar-fill  { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .cost-bar-value { font-family: var(--mono); font-size: 10px; color: var(--text); min-width: 44px; text-align: right; }

    /* ── System health ── */
    .health-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 0; font-size: 11px; border-bottom: 1px solid var(--border);
    }
    .health-row:last-child { border-bottom: none; }
    .health-label { color: var(--text-muted); }

    /* ── Journal ── */
    .journal-entry {
      padding: 8px 14px; border-bottom: 1px solid var(--border);
      display: grid; grid-template-columns: 32px 1fr auto; gap: 8px;
      align-items: center; font-size: 11px;
    }
    .journal-entry:last-child { border-bottom: none; }
    .journal-cycle { font-family: var(--mono); font-weight: 700; color: var(--text-dim); font-size: 10px; text-align: center; }
    .journal-desc  { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .journal-meta  { display: flex; gap: 4px; align-items: center; }

    /* ── Blocker / action card ── */
    .alert-card {
      border-radius: 10px; overflow: hidden; margin-bottom: 14px;
    }
    .blocker-item { padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .blocker-item:last-child { border-bottom: none; }
    .blocker-title { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .blocker-desc  { font-size: 11px; color: var(--text-muted); }
    .blocker-actions { display: flex; gap: 5px; margin-top: 6px; }
    .blocker-actions .btn { padding: 3px 8px; font-size: 9px; }

    /* ── Verification ── */
    .verify-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .verify-check {
      display: flex; align-items: center; gap: 5px; font-size: 10px;
      padding: 5px 8px; background: var(--surface-raised); border-radius: 5px;
    }

    .empty { text-align: center; padding: 20px; color: var(--text-dim); font-size: 11px; }
    .section-label {
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--text-dim); margin: 10px 0 6px;
    }
    .divider { height: 1px; background: var(--border); margin: 10px 0; }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    @media (max-width: 1100px) {
      .hero { grid-template-columns: repeat(3, 1fr); }
      .top-grid { grid-template-columns: 1fr; }
      .mid-grid { grid-template-columns: 1fr; }
      .roadmap-grid { grid-template-columns: 1fr 1fr 1fr; }
    }
    @media (max-width: 700px) {
      .hero { grid-template-columns: 1fr 1fr; }
      .roadmap-grid { grid-template-columns: 1fr; }
    }

    /* ── Budget panel ── */
    .budget-panel { margin-bottom: 14px; }
    .budget-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px;
    }
    .budget-panel-title {
      font-size: 12px; font-weight: 700; letter-spacing: -0.01em;
      text-transform: uppercase; color: var(--text-dim);
    }

    .bgt-gauge-row {
      display: grid; grid-template-columns: 160px 1fr; gap: 16px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 20px; margin-bottom: 12px; align-items: center;
    }
    .bgt-gauge-wrap { position: relative; width: 140px; height: 140px; }
    .bgt-gauge-svg  { width: 140px; height: 140px; transform: rotate(-90deg); }
    .bgt-gauge-bg   { fill: none; stroke: var(--border); stroke-width: 10; }
    .bgt-gauge-fill { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease, stroke 0.4s; }
    .bgt-gauge-center {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      text-align: center;
    }
    .bgt-gauge-amt   { font-size: 22px; font-weight: 900; font-family: var(--mono); letter-spacing: -0.03em; }
    .bgt-gauge-lbl   { font-size: 10px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; }

    .bgt-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .bgt-stat-box {
      background: var(--surface-raised); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px 12px;
    }
    .bgt-stat-lbl { font-size: 9px; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 2px; }
    .bgt-stat-val { font-size: 16px; font-weight: 800; font-family: var(--mono); }
    .bgt-stat-sub { font-size: 10px; color: var(--text-dim); margin-top: 1px; }
    .bgt-stat-val.green  { color: var(--green); }
    .bgt-stat-val.yellow { color: var(--yellow); }
    .bgt-stat-val.red    { color: var(--red); }
    .bgt-stat-val.blue   { color: var(--blue); }

    .bgt-controls-row {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 16px 20px; margin-bottom: 12px;
    }
    .bgt-controls-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
    .bgt-ctrl-group { display: flex; flex-direction: column; gap: 4px; }
    .bgt-ctrl-lbl { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .bgt-ctrl-input {
      padding: 8px 12px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font-size: 14px; font-family: var(--mono);
      font-weight: 600; outline: none; transition: border-color 0.2s; width: 100%;
    }
    .bgt-ctrl-input:focus { border-color: var(--accent); }
    .bgt-ctrl-select {
      padding: 8px 12px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font-size: 12px;
      outline: none; cursor: pointer; width: 100%;
    }
    .bgt-ctrl-select:focus { border-color: var(--accent); }
    .bgt-save-btn {
      padding: 8px 18px; border-radius: 7px; border: none;
      background: var(--accent); color: white; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: background 0.2s; white-space: nowrap; font-family: var(--sans);
    }
    .bgt-save-btn:hover { background: #5558e6; }
    .bgt-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .bgt-quick-row {
      display: flex; gap: 6px; margin-top: 12px; padding-top: 12px;
      border-top: 1px solid var(--border); align-items: center; flex-wrap: wrap;
    }
    .bgt-quick-lbl { font-size: 11px; color: var(--text-dim); margin-right: 2px; }
    .bgt-quick-btn {
      padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border);
      background: transparent; color: var(--text-muted); font-size: 11px;
      font-family: var(--mono); font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    .bgt-quick-btn:hover { color: var(--green); border-color: var(--green-border); background: var(--green-dim); }

    .bgt-breakdown-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
    }
    .bgt-breakdown-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px;
    }
    .bgt-breakdown-title {
      font-size: 11px; font-weight: 700; margin-bottom: 10px;
      display: flex; align-items: center; gap: 5px;
    }
    .bgt-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

    .bgt-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .bgt-bar-lbl  { font-size: 10px; color: var(--text-muted); width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
    .bgt-bar-track{ flex: 1; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .bgt-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
    .bgt-bar-val  { font-size: 10px; font-family: var(--mono); font-weight: 600; width: 52px; text-align: right; flex-shrink: 0; }

    .bgt-timeline-section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
    }
    .bgt-timeline-hdr { font-size: 11px; font-weight: 700; margin-bottom: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .bgt-tl-row {
      display: flex; align-items: center; gap: 8px; padding: 5px 0;
      border-bottom: 1px solid var(--border); font-size: 11px;
    }
    .bgt-tl-row:last-child { border-bottom: none; }
    .bgt-tl-date { color: var(--text-dim); width: 90px; font-family: var(--mono); font-size: 10px; flex-shrink: 0; }
    .bgt-tl-bar-wrap { flex: 1; }
    .bgt-tl-bar { height: 14px; border-radius: 3px; min-width: 4px; display: flex; align-items: center; padding: 0 5px; transition: width 0.5s ease; }
    .bgt-tl-bar span { font-size: 9px; font-weight: 600; color: white; white-space: nowrap; }
    .bgt-tl-calls { font-size: 9px; color: var(--text-dim); width: 60px; text-align: right; flex-shrink: 0; }

    .bgt-topexp-section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
    }
    .bgt-topexp-hdr { font-size: 11px; font-weight: 700; margin-bottom: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
    .bgt-exp-row {
      display: grid; grid-template-columns: 1fr 90px 70px 52px;
      gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--border);
      font-size: 10px; align-items: center;
    }
    .bgt-exp-row:last-child { border-bottom: none; }
    .bgt-exp-head { color: var(--text-dim); font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
    .bgt-exp-agent { font-weight: 600; color: var(--accent); }
    .bgt-exp-model { color: var(--text-muted); font-family: var(--mono); font-size: 9px; }
    .bgt-exp-cost  { font-family: var(--mono); font-weight: 600; text-align: right; }
    .bgt-exp-time  { color: var(--text-dim); font-size: 9px; text-align: right; }

    .bgt-mode-badge {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.03em;
    }
    .bgt-mode-badge.notify { background: var(--yellow-dim); color: var(--yellow); border: 1px solid var(--yellow-border); }
    .bgt-mode-badge.stop   { background: var(--red-dim);    color: var(--red);    border: 1px solid var(--red-border); }

    .bgt-no-data { font-size: 10px; color: var(--text-dim); padding: 6px 0; }

    @media (max-width: 700px) {
      .bgt-gauge-row { grid-template-columns: 1fr; }
      .bgt-controls-grid { grid-template-columns: 1fr; }
      .bgt-breakdown-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  ${navHtml}

  <div class="shell">

    <!-- Hero Strip -->
    <div class="hero">
      <div class="hero-card green">
        <div class="hero-label">Features</div>
        <div class="hero-value" id="h-features">--/--</div>
        <div class="hero-sub" id="h-features-sub">loading...</div>
        <div class="prog-bar-track"><div class="prog-bar-fill" id="h-prog-bar" style="width:0%"></div></div>
      </div>
      <div class="hero-card orange">
        <div class="hero-label">AI Spend Today</div>
        <div class="hero-value" id="h-today">$0</div>
        <div class="hero-sub" id="h-alltime">all time: $0</div>
      </div>
      <div class="hero-card blue">
        <div class="hero-label">Cycles Run</div>
        <div class="hero-value" id="h-cycles">0</div>
        <div class="hero-sub" id="h-cycles-sub">this session</div>
      </div>
      <div class="hero-card purple">
        <div class="hero-label">Files Modified</div>
        <div class="hero-value" id="h-files">0</div>
        <div class="hero-sub" id="h-files-sub">this session</div>
      </div>
      <div class="hero-card cyan">
        <div class="hero-label">UI Health</div>
        <div class="hero-value" id="h-health" style="color:#22d3ee">--</div>
        <div class="hero-sub" id="h-health-sub">no scan yet</div>
      </div>
    </div>

    <!-- Action Needed (shown only when present) -->
    <div id="action-card" class="alert-card card" style="display:none; border-color:rgba(249,115,22,0.4); background:rgba(249,115,22,0.05);">
      <div class="card-head">
        <span class="card-title" style="color:#f97316;">&#9888; Action Needed</span>
      </div>
      <div class="card-body" id="action-container"></div>
    </div>

    <!-- Active Blockers (shown only when present) -->
    <div id="blocker-card" class="alert-card card" style="display:none; border-color:var(--red-border); background:var(--red-dim);">
      <div class="card-head">
        <span class="card-title" style="color:var(--red);">&#9940; Active Blockers</span>
        <span class="badge red" id="blocker-count">0</span>
      </div>
      <div class="card-body flush" id="blockers-container"></div>
    </div>

    <!-- Top grid: Controls + Roadmap -->
    <div class="top-grid">

      <!-- Control Panel -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Control</span>
          <span class="badge muted" id="autonomy-state-badge">Idle</span>
        </div>
        <div class="card-body">
          <div class="status-row">
            <div class="live-dot" id="global-dot"></div>
            <span class="status-label" id="global-status">Idle</span>
          </div>
          <div id="now-container">
            <div class="now-idle">Sneebly is idle. Start the autonomy loop or run a single cycle.</div>
          </div>
          <div class="controls" style="margin-bottom:14px;">
            <button class="btn primary" id="btn-start" onclick="toggleAutonomy()">Start Autonomy</button>
            <button class="btn" id="btn-cycle" onclick="triggerCycle()">Run 1 Cycle</button>
            <button class="btn" id="btn-fix-ts" onclick="fixTsErrors()" title="Run npx tsc, send errors to Claude, apply fixes">Fix TS Errors</button>
            <button class="btn" id="btn-playwright" onclick="runPlaywright()" title="Run the full Playwright e2e test suite">&#9654; Run Playwright</button>
            <button class="btn" onclick="refreshAll()" title="Refresh all data">&#8635; Refresh</button>
          </div>

          <!-- Playwright Test Results — hidden until first run -->
          <div id="pw-results-panel" style="display:none; margin-bottom:14px; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
            <div id="pw-summary" style="padding:8px 12px; font-size:12px; border-bottom:1px solid var(--border); background:var(--surface-raised, var(--surface));"></div>
            <pre id="pw-output" style="margin:0; padding:10px 12px; font-size:10px; line-height:1.6; font-family:monospace; background:var(--bg); color:var(--text-dim); max-height:220px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;"></pre>
          </div>

          <div class="divider"></div>

          <!-- Current Plan -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div class="section-label" style="margin:0;">Current Plan</div>
            <span class="badge muted" id="plan-progress-badge">No plan</span>
          </div>
          <div id="plan-container">
            <div class="empty" style="padding:12px;">No active plan</div>
          </div>
        </div>
        <div class="card-foot" style="text-align:right;">
          <span style="font-size:10px; color:var(--text-dim);" id="last-refresh">never</span>
        </div>
      </div>

      <!-- Roadmap -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Roadmap</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="badge muted" id="roadmap-badge">Loading...</span>
            <button class="btn" style="font-size:9px; padding:2px 7px;" onclick="regenerateRoadmap()">Regen</button>
          </div>
        </div>
        <!-- Progress bar -->
        <div style="padding:0 14px 10px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:4px;">
            <span id="rm-progress-label">Loading...</span>
            <span id="rm-progress-pct"></span>
          </div>
          <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:6px;overflow:hidden;">
            <div id="rm-progress-bar" style="height:100%;background:linear-gradient(90deg,var(--green),var(--accent));border-radius:4px;width:0%;transition:width .6s;"></div>
          </div>
        </div>
        <div class="card-body flush scroll" id="roadmap-container" style="padding:0 14px 14px;max-height:420px;">
          <div class="empty">Loading roadmap...</div>
        </div>
      </div>
    </div>

    <!-- Mid grid: Activity | Costs | System -->
    <div class="mid-grid">

      <!-- Activity Timeline -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">Activity</span>
          <div class="filter-row">
            <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
            <button class="filter-btn" onclick="setFilter('success',this)">OK</button>
            <button class="filter-btn" onclick="setFilter('error',this)">Errors</button>
            <button class="filter-btn" onclick="setFilter('thinking',this)">Thinking</button>
          </div>
        </div>
        <div class="card-body flush">
          <div class="timeline" id="timeline-container">
            <div class="empty">No activity yet</div>
          </div>
        </div>
        <div class="card-foot">
          <div class="section-label" style="margin:0 0 6px;">Session Journal</div>
          <div id="journal-container" style="max-height:160px; overflow-y:auto;">
            <div class="empty" style="padding:10px;">No journal entries</div>
          </div>
        </div>
      </div>

      <!-- AI Costs -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">AI Costs</span>
          <div style="display:flex; gap:4px;">
            <button class="btn" style="font-size:9px; padding:2px 7px;" onclick="syncCosts()">Sync</button>
            <button class="btn" style="font-size:9px; padding:2px 7px;" onclick="recalcCosts()">Recalc</button>
          </div>
        </div>
        <div class="card-body">
          <div class="cost-stat-row">
            <div class="cost-stat">
              <div class="cost-stat-val" id="c-today">$0.00</div>
              <div class="cost-stat-lbl">Today</div>
            </div>
            <div class="cost-stat">
              <div class="cost-stat-val" id="c-alltime">$0.00</div>
              <div class="cost-stat-lbl">All Time</div>
            </div>
          </div>
          <div class="cost-stat-row" style="margin-bottom:14px;">
            <div class="cost-stat">
              <div class="cost-stat-val" id="c-hour">$0.00</div>
              <div class="cost-stat-lbl">Last Hour</div>
            </div>
            <div class="cost-stat">
              <div class="cost-stat-val" id="c-calls" style="font-size:14px;">0</div>
              <div class="cost-stat-lbl">API Calls</div>
            </div>
          </div>
          <div class="section-label">By Model</div>
          <div id="cost-by-model"></div>
          <div class="section-label">By Agent</div>
          <div id="cost-by-agent"></div>
        </div>
      </div>

      <!-- System Health -->
      <div class="card">
        <div class="card-head">
          <span class="card-title">System</span>
          <span class="badge muted" id="monitor-badge">Loading...</span>
        </div>
        <div class="card-body">
          <!-- ELON Monitor -->
          <div class="section-label">Monitor (10m cycle)</div>
          <div id="monitor-container">
            <div class="empty" style="padding:8px;">Loading...</div>
          </div>

          <div class="divider"></div>

          <!-- UI Health -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div class="section-label" style="margin:0;">UI Routes</div>
            <span class="badge muted" id="ui-health-badge">--</span>
          </div>
          <div id="ui-health-container" style="margin-bottom:8px;">
            <div class="empty" style="padding:8px;">No scan yet</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn primary" style="font-size:10px; padding:4px 10px;" onclick="runUiScan(this)">Run Scan</button>
            <a href="/sneebly/ui-health?key=${sneeblyKey}" target="_blank" class="btn" style="font-size:10px; padding:4px 10px; text-decoration:none;">Full Report</a>
          </div>

          <div class="divider"></div>

          <!-- Verification -->
          <div class="section-label">Last Verification</div>
          <div id="verification-container">
            <div class="empty" style="padding:8px;">No data</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Claude Output Panel -->
    <div class="card" style="margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;display:inline-block;" id="live-dot"></span>
          <span style="font-weight:600;font-size:13px;letter-spacing:.5px;">CLAUDE LIVE</span>
          <span style="font-size:10px;color:var(--text-muted);" id="live-agent-badge"></span>
        </div>
        <span style="font-size:10px;color:var(--text-muted);" id="live-last-update">waiting...</span>
      </div>
      <!-- Current response highlight -->
      <div id="live-current" style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:8px;padding:12px 14px;min-height:60px;font-family:var(--mono);font-size:12px;line-height:1.6;color:var(--text);white-space:pre-wrap;word-break:break-word;margin-bottom:10px;max-height:220px;overflow-y:auto;">
        <span style="color:var(--text-muted);">No output yet — start a build cycle to see Claude thinking in real time.</span>
      </div>
      <!-- Feed of recent responses -->
      <div id="live-feed" style="max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- Budget & Expenses Panel -->
    <div class="budget-panel">
      <div class="budget-panel-header">
        <span class="budget-panel-title">Budget &amp; Expenses</span>
        <a href="/sneebly/budget?key=${sneeblyKey}" class="btn" style="font-size:10px;padding:4px 10px;text-decoration:none;">Full Budget Page</a>
      </div>

      <!-- Gauge + Stats -->
      <div class="bgt-gauge-row">
        <div class="bgt-gauge-wrap">
          <svg class="bgt-gauge-svg" viewBox="0 0 140 140">
            <circle class="bgt-gauge-bg" cx="70" cy="70" r="58"></circle>
            <circle class="bgt-gauge-fill" id="bgt-gauge-fill" cx="70" cy="70" r="58"
              stroke-dasharray="364" stroke-dashoffset="364"></circle>
          </svg>
          <div class="bgt-gauge-center">
            <div class="bgt-gauge-amt" id="bgt-gauge-amt">$0</div>
            <div class="bgt-gauge-lbl">spent</div>
          </div>
        </div>
        <div class="bgt-stats">
          <div class="bgt-stat-box">
            <div class="bgt-stat-lbl">Budget Limit</div>
            <div class="bgt-stat-val" id="bgt-limit">$0</div>
            <div class="bgt-stat-sub" id="bgt-mode-sub"></div>
          </div>
          <div class="bgt-stat-box">
            <div class="bgt-stat-lbl">Remaining</div>
            <div class="bgt-stat-val green" id="bgt-remaining">$0</div>
            <div class="bgt-stat-sub" id="bgt-pct"></div>
          </div>
          <div class="bgt-stat-box">
            <div class="bgt-stat-lbl">Burn Rate</div>
            <div class="bgt-stat-val blue" id="bgt-burn">$0/hr</div>
            <div class="bgt-stat-sub">per hour</div>
          </div>
          <div class="bgt-stat-box">
            <div class="bgt-stat-lbl">Projected Runway</div>
            <div class="bgt-stat-val" id="bgt-runway">--</div>
            <div class="bgt-stat-sub" id="bgt-runway-sub"></div>
          </div>
        </div>
      </div>

      <!-- Budget Settings -->
      <div class="bgt-controls-row">
        <div class="bgt-controls-grid">
          <div class="bgt-ctrl-group">
            <label class="bgt-ctrl-lbl">Budget Limit ($)</label>
            <input type="number" class="bgt-ctrl-input" id="bgt-input-limit" min="1" step="10" placeholder="100">
          </div>
          <div class="bgt-ctrl-group">
            <label class="bgt-ctrl-lbl">Enforcement Mode</label>
            <select class="bgt-ctrl-select" id="bgt-input-mode">
              <option value="notify">Notify Only</option>
              <option value="stop">Hard Stop</option>
            </select>
          </div>
          <button class="bgt-save-btn" id="bgt-save-btn" onclick="bgtSave()">Save</button>
        </div>
        <div class="bgt-quick-row">
          <span class="bgt-quick-lbl">Quick add:</span>
          <button class="bgt-quick-btn" onclick="bgtAdd(10)">+$10</button>
          <button class="bgt-quick-btn" onclick="bgtAdd(25)">+$25</button>
          <button class="bgt-quick-btn" onclick="bgtAdd(50)">+$50</button>
          <button class="bgt-quick-btn" onclick="bgtAdd(100)">+$100</button>
          <button class="bgt-quick-btn" onclick="bgtAdd(250)">+$250</button>
        </div>
      </div>

      <!-- Cost Breakdowns -->
      <div class="bgt-breakdown-grid">
        <div class="bgt-breakdown-card">
          <div class="bgt-breakdown-title"><span class="bgt-dot" style="background:var(--accent)"></span> By Agent</div>
          <div id="bgt-by-agent"></div>
        </div>
        <div class="bgt-breakdown-card">
          <div class="bgt-breakdown-title"><span class="bgt-dot" style="background:var(--purple)"></span> By Feature</div>
          <div id="bgt-by-feature"></div>
        </div>
        <div class="bgt-breakdown-card">
          <div class="bgt-breakdown-title"><span class="bgt-dot" style="background:var(--green)"></span> By Model</div>
          <div id="bgt-by-model"></div>
        </div>
        <div class="bgt-breakdown-card">
          <div class="bgt-breakdown-title"><span class="bgt-dot" style="background:var(--orange)"></span> Today's Summary</div>
          <div id="bgt-today-summary"></div>
        </div>
      </div>

      <!-- Daily Spend Timeline -->
      <div class="bgt-timeline-section">
        <div class="bgt-timeline-hdr">Daily Spend Timeline</div>
        <div id="bgt-timeline"></div>
      </div>

      <!-- Recent Expensive Calls -->
      <div class="bgt-topexp-section">
        <div class="bgt-topexp-hdr">Recent Expensive Calls</div>
        <div class="bgt-exp-row bgt-exp-head">
          <span>Agent / Action</span><span>Model</span><span>Time</span><span style="text-align:right">Cost</span>
        </div>
        <div id="bgt-top-expenses"></div>
      </div>
    </div>

  </div><!-- /shell -->

  <script>
    const KEY = '${sneeblyKey}';
    const CC = '/api/sneebly-cc';
    const H = { 'x-sneebly-key': KEY, 'Content-Type': 'application/json' };

    let activityData = [];
    let currentFilter = 'all';
    let autonomyRunning = false;

    async function api(url, opts = {}) {
      try {
        const r = await fetch(url, { headers: H, ...opts });
        if (!r.ok) throw new Error(r.statusText);
        return await r.json();
      } catch (e) { console.error('API:', url, e); return null; }
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function fmt$(n) { return '$' + (n || 0).toFixed(2); }
    function fmtTok(n) { return n > 1000000 ? (n/1000000).toFixed(1)+'M' : n > 1000 ? (n/1000).toFixed(0)+'K' : (n||0)+''; }
    function timeAgo(d) {
      const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s/60) + 'm ago';
      if (s < 86400) return Math.floor(s/3600) + 'h ago';
      const days = Math.floor(s/86400);
      return days === 1 ? '1 day ago' : days + ' days ago';
    }
    function shortTime(d) { return new Date(d).toLocaleTimeString('en', {hour:'numeric',minute:'2-digit',hour12:true}); }
    function humanizeResult(r) {
      const map = {
        'success': 'Step completed', 'build-failed': 'Build failed (retrying)',
        'verify-failed': 'Verification failed (rolled back)', 'plan-empty-skipped': 'Nothing to do',
        'plan-complete-reviewed': 'Plan complete, reviewed', 'error': 'Error encountered',
        'paused': 'Paused', 'unhealthy': 'Health check failed', 'rate-limited': 'Rate limited',
      };
      return map[r] || r;
    }

    async function refreshAutonomy() {
      const [state, plan] = await Promise.all([
        api(CC + '/autonomy/state'),
        api(CC + '/plan')
      ]);
      if (!state) return;
      autonomyRunning = state.running;

      const dot    = document.getElementById('global-dot');
      const sLabel = document.getElementById('global-status');
      const badge  = document.getElementById('autonomy-state-badge');
      const btn    = document.getElementById('btn-start');
      const nowEl  = document.getElementById('now-container');

      const js = state.journalSummary;
      const totalCycles = js ? js.totalCycles : (state.currentCycle || 0);
      const totalFiles  = js ? js.allFilesModified.length : (state.filesModified || []).length;

      document.getElementById('h-cycles').textContent = totalCycles;
      document.getElementById('h-files').textContent  = totalFiles;
      document.getElementById('h-cycles-sub').textContent = state.lastCycleTime ? 'last: ' + timeAgo(state.lastCycleTime) : 'this session';
      document.getElementById('h-files-sub').textContent  = totalFiles + ' file(s)';

      if (state.running && !state.paused) {
        dot.className = 'live-dot active';
        sLabel.textContent = 'Autonomy Running';
        badge.className = 'badge green'; badge.textContent = 'Running';
        btn.textContent = 'Stop'; btn.className = 'btn danger';
        const detail = state.lastCycleTime ? timeAgo(state.lastCycleTime) : '';
        const cyclesStuck = state.cyclesSinceProgress || 0;
        const stalledList = state.stalledFeatures || [];
        const stallWarning = cyclesStuck >= 3
          ? '<div style="margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.4);font-size:11px;color:#fbbf24;">' +
            '⚠ No progress in ' + cyclesStuck + ' cycle' + (cyclesStuck !== 1 ? 's' : '') +
            (stalledList.length > 0 ? ' · Skipping: ' + stalledList.map(s => s.title).join(', ') : '') +
            '</div>'
          : '';
        nowEl.innerHTML =
          '<div class="now-header"><div class="pulse-ring"></div>ACTIVE NOW</div>' +
          '<div class="now-box"><div class="now-action">Cycle ' + state.currentCycle + ' — ' + humanizeResult(state.lastCycleResult || 'working') + '</div>' +
          '<div class="now-detail">' + (detail ? 'Last activity ' + detail : 'Starting...') + '</div>' +
          (state.lastProgressAt ? '<div class="now-detail">Last feature completed: ' + timeAgo(state.lastProgressAt) + '</div>' : '') +
          stallWarning + '</div>';
      } else if (state.paused) {
        dot.className = 'live-dot';
        sLabel.textContent = 'Paused';
        badge.className = 'badge yellow'; badge.textContent = 'Paused';
        btn.textContent = 'Resume'; btn.className = 'btn primary';
        nowEl.innerHTML = '<div class="now-idle">Autonomy paused.' + (state.lastCycleResult ? ' Last: ' + humanizeResult(state.lastCycleResult) : '') + '</div>';
      } else {
        dot.className = 'live-dot';
        sLabel.textContent = 'Idle' + (state.lastCycleTime ? ' · last active ' + timeAgo(state.lastCycleTime) : '');
        badge.className = 'badge muted'; badge.textContent = 'Idle';
        btn.textContent = 'Start Autonomy'; btn.className = 'btn primary';
        nowEl.innerHTML = '<div class="now-idle">' +
          (state.lastCycleTime ? 'Last worked <strong>' + timeAgo(state.lastCycleTime) + '</strong>' +
            (state.lastCycleResult ? ' — ' + humanizeResult(state.lastCycleResult) : '') :
            'Not started yet. Start the autonomy loop or run a single cycle.') +
          '</div>';
      }

      const planEl = document.getElementById('plan-container');
      const planBadge = document.getElementById('plan-progress-badge');
      if (plan && plan.goal) {
        const steps = plan.steps || [];
        const done = steps.filter(s => s.status === 'done').length;
        planBadge.textContent = done + '/' + steps.length;
        planBadge.className = done === steps.length ? 'badge green' : 'badge blue';
        let html = '<div class="plan-goal">' + esc(plan.goal) + '</div>';
        if (steps.length > 0) {
          html += '<div class="plan-steps">';
          steps.forEach(function(s, i) {
            const ic = s.status === 'done' ? 'done' : s.status === 'in-progress' ? 'active' : s.status === 'failed' ? 'failed' : 'pending';
            const ig = s.status === 'done' ? '&#10003;' : s.status === 'in-progress' ? '&#9654;' : s.status === 'failed' ? '&#10007;' : (i+1);
            html += '<div class="plan-step"><div class="step-icon ' + ic + '">' + ig + '</div>' +
              '<div class="step-text ' + (s.status==='done'?'done':'') + '">' + esc(s.description||'Step '+(i+1)) +
              (s.error ? '<div style="color:var(--red);font-size:10px;margin-top:2px;">'+esc(s.error)+'</div>' : '') + '</div></div>';
          });
          html += '</div>';
        }
        planEl.innerHTML = html;
      } else {
        planBadge.textContent = 'No plan'; planBadge.className = 'badge muted';
        planEl.innerHTML = '<div class="empty" style="padding:10px;">No active plan</div>';
      }
    }

    var rmDoneExpanded = false;
    async function refreshRoadmap() {
      try {
        const data = await api('/api/sneebly/roadmap');
        const container = document.getElementById('roadmap-container');
        const badge = document.getElementById('roadmap-badge');
        if (!data || !data.features) {
          container.innerHTML = '<div class="empty">No roadmap yet</div>';
          badge.textContent = 'none'; badge.className = 'badge muted';
          return;
        }
        const features = data.features;
        const total = features.length;
        const done  = features.filter(function(f){ return f.status === 'done'; });
        const active = features.filter(function(f){ return f.status === 'in_progress'; });
        const pending = features.filter(function(f){ return f.status === 'pending' || (!f.status || f.status === 'queued'); });
        const doneCount = done.length;
        const pct = total > 0 ? Math.round((doneCount/total)*100) : 0;

        badge.textContent = doneCount + '/' + total + ' done';
        badge.className = doneCount === total ? 'badge green' : active.length > 0 ? 'badge blue' : 'badge muted';

        document.getElementById('h-features').textContent = doneCount + '/' + total;
        document.getElementById('h-features-sub').textContent = pct + '% complete';
        document.getElementById('h-prog-bar').style.width = pct + '%';
        document.getElementById('rm-progress-label').textContent = doneCount + ' of ' + total + ' features complete';
        document.getElementById('rm-progress-pct').textContent = pct + '%';
        document.getElementById('rm-progress-bar').style.width = pct + '%';

        var html = '';

        // ── DONE section ──
        if (doneCount > 0) {
          var showAll = rmDoneExpanded;
          var visible = showAll ? done : done.slice(-3);
          html += '<div style="margin-bottom:14px;">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '<span style="font-size:10px;font-weight:700;letter-spacing:.8px;color:var(--green);text-transform:uppercase;">&#10003; Completed (' + doneCount + ')</span>' +
            (doneCount > 3 ? '<button onclick="rmDoneExpanded=!rmDoneExpanded;refreshRoadmap();" style="background:none;border:none;color:var(--text-muted);font-size:10px;cursor:pointer;padding:0;">' + (showAll ? 'Show less ▲' : 'Show all ' + doneCount + ' ▼') + '</button>' : '') +
            '</div>';
          if (!showAll && doneCount > 3) {
            html += '<div style="font-size:10px;color:var(--text-muted);padding:0 0 4px 8px;">…' + (doneCount - 3) + ' earlier features</div>';
          }
          html += visible.map(function(f, i) {
            var num = done.indexOf(f) + 1;
            return '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 8px;border-radius:6px;background:rgba(34,197,94,0.05);margin-bottom:3px;">' +
              '<span style="color:var(--green);font-size:12px;flex-shrink:0;margin-top:1px;">&#10003;</span>' +
              '<div style="flex:1;min-width:0;">' +
              '<span style="font-size:10px;color:var(--text-muted);display:block;line-height:1;">' + f.id + '</span>' +
              '<span style="font-size:12px;color:var(--text);font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(f.title || f.id) + '</span>' +
              '</div></div>';
          }).join('');
          html += '</div>';
        }

        // ── BUILDING NOW section ──
        if (active.length > 0) {
          html += '<div style="margin-bottom:14px;">';
          html += '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;color:#60a5fa;text-transform:uppercase;margin-bottom:6px;">&#9654; Building Now (' + active.length + ')</div>';
          html += active.map(function(f) {
            return '<div style="border:2px solid rgba(96,165,250,0.4);border-radius:8px;background:rgba(96,165,250,0.06);padding:10px 12px;margin-bottom:6px;">' +
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
              '<span style="width:7px;height:7px;border-radius:50%;background:#60a5fa;flex-shrink:0;animation:pulse-step 1.5s infinite;"></span>' +
              '<span style="font-size:10px;color:#60a5fa;font-weight:600;">' + f.id + '</span>' +
              '</div>' +
              '<div style="font-size:13px;color:var(--text);font-weight:600;line-height:1.4;">' + esc(f.title || f.id) + '</div>' +
              (f.steps ? '<div style="font-size:10px;color:var(--text-muted);margin-top:5px;">' + f.steps.length + ' steps planned</div>' : '') +
              '</div>';
          }).join('');
          html += '</div>';
        } else if (pending.length === 0 && doneCount === total) {
          html += '<div style="text-align:center;padding:12px;color:var(--green);font-weight:600;font-size:13px;">&#127881; All features complete!</div>';
        }

        // ── UP NEXT section ──
        if (pending.length > 0) {
          html += '<div>';
          html += '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">&#9711; Up Next (' + pending.length + ' remaining)</div>';
          html += pending.map(function(f, i) {
            var isNext = i === 0 && active.length === 0;
            return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;' +
              (isNext ? 'background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.25);' : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);') +
              'margin-bottom:4px;">' +
              '<span style="font-size:11px;font-weight:700;color:' + (isNext ? '#f97316' : 'var(--text-muted)') + ';flex-shrink:0;min-width:16px;text-align:center;">' + (i+1) + '</span>' +
              '<div style="flex:1;min-width:0;">' +
              '<span style="font-size:10px;color:var(--text-muted);display:block;line-height:1;">' + f.id + (isNext ? ' · <span style="color:#f97316;">NEXT UP</span>' : '') + '</span>' +
              '<span style="font-size:12px;color:var(--text);font-weight:' + (isNext ? '600' : '400') + ';display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(f.title || f.id) + '</span>' +
              (f.dependencies && f.dependencies.length ? '<span style="font-size:9px;color:var(--text-dim);">needs: ' + f.dependencies.join(', ') + '</span>' : '') +
              '</div></div>';
          }).join('');
          html += '</div>';
        }

        container.innerHTML = html || '<div class="empty">No features found</div>';
      } catch(e) {
        document.getElementById('roadmap-container').innerHTML = '<div class="empty">Error loading roadmap</div>';
      }
    }

    async function regenerateRoadmap() {
      document.getElementById('roadmap-container').innerHTML = '<div class="empty">Regenerating via Claude Opus… (30s)</div>';
      try {
        const data = await api('/api/sneebly/roadmap/regenerate', { method: 'POST' });
        if (data && data.features) setTimeout(refreshRoadmap, 500);
      } catch(e) {
        document.getElementById('roadmap-container').innerHTML = '<div class="empty">Error regenerating roadmap</div>';
      }
    }

    async function refreshActivity() {
      const data = await api(CC + '/activity');
      if (!data) return;
      activityData = data.activity || [];
      renderTimeline();
    }

    function setFilter(f, btnEl) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btnEl.classList.add('active');
      renderTimeline();
    }

    function renderTimeline() {
      const el = document.getElementById('timeline-container');
      let items = currentFilter === 'all' ? activityData : activityData.filter(a => a.type === currentFilter);
      if (items.length === 0) {
        el.innerHTML = '<div class="empty">No ' + (currentFilter==='all'?'':''+currentFilter+' ') + 'activity</div>';
        return;
      }
      el.innerHTML = items.slice(0, 60).map(function(a) {
        return '<div class="tl-entry">' +
          '<div class="tl-time">' + (a.timestamp ? shortTime(a.timestamp) : '--') + '</div>' +
          '<div class="tl-content">' +
            '<span class="tl-type ' + (a.type||'info') + '">' + (a.type||'info') + '</span>' +
            '<span class="tl-msg">' + esc(a.message) + '</span>' +
          '</div></div>';
      }).join('');
    }

    async function refreshJournal() {
      const data = await api(CC + '/autonomy/journal?limit=20');
      const el = document.getElementById('journal-container');
      if (!data || !data.entries || data.entries.length === 0) {
        el.innerHTML = '<div class="empty" style="padding:8px;">No journal entries this session</div>';
        return;
      }
      el.innerHTML = data.entries.slice().reverse().map(function(e) {
        const rb = e.result === 'success' ? '<span class="badge green" style="font-size:8px;">OK</span>' :
          e.result === 'plan-complete-reviewed' ? '<span class="badge blue" style="font-size:8px;">DONE</span>' :
          (e.result||'').includes('fail') || e.result === 'error' ?
            '<span class="badge red" style="font-size:8px;">FAIL</span>' :
            '<span class="badge muted" style="font-size:8px;">' + (e.result||'?').slice(0,6).toUpperCase() + '</span>';
        const cost = e.costThisCycle ? ' <span style="font-family:var(--mono);color:var(--text-dim);font-size:9px;">' + fmt$(e.costThisCycle) + '</span>' : '';
        return '<div class="journal-entry">' +
          '<div class="journal-cycle">#' + (e.cycle||0) + '</div>' +
          '<div class="journal-desc">' + esc(e.stepDescription || humanizeResult(e.result)) + '</div>' +
          '<div class="journal-meta">' + rb + cost + '</div></div>';
      }).join('');
    }

    async function refreshCosts() {
      const data = await api(CC + '/costs');
      if (!data) return;
      document.getElementById('c-today').textContent   = fmt$(data.totalToday);
      document.getElementById('c-alltime').textContent = fmt$(data.totalAllTime);
      document.getElementById('c-hour').textContent    = fmt$(data.totalThisHour);
      document.getElementById('c-calls').textContent   = (data.entriesCount||0);
      // Hero cost card
      document.getElementById('h-today').textContent  = fmt$(data.totalToday);
      document.getElementById('h-alltime').textContent = 'all time: ' + fmt$(data.totalAllTime);
      renderCostBars('cost-by-model', data.byModel || {}, 'var(--accent)');
      renderCostBars('cost-by-agent', data.byAgent || {}, 'var(--purple)');
    }

    function renderCostBars(id, data, color) {
      const el = document.getElementById(id);
      const entries = Object.entries(data).sort((a,b) => b[1].cost - a[1].cost);
      if (!entries.length) { el.innerHTML = '<div class="empty" style="padding:6px;">No data</div>'; return; }
      const max = entries[0][1].cost || 1;
      el.innerHTML = entries.map(function(pair) {
        const name = pair[0]; const d = pair[1];
        const pct = Math.max(2, (d.cost/max)*100);
        return '<div class="cost-bar">' +
          '<div class="cost-bar-label" title="'+esc(name)+'">' + esc(name.replace('claude-','').replace(/-4-[56]/g,'')) + '</div>' +
          '<div class="cost-bar-track"><div class="cost-bar-fill" style="width:'+pct+'%;background:'+color+';"></div></div>' +
          '<div class="cost-bar-value">' + fmt$(d.cost) + '</div></div>';
      }).join('');
    }

    async function refreshBlockers() {
      const data = await api(CC + '/blockers');
      const blockers = (data && data.blockers) ? data.blockers.filter(b => b.status === 'active') : [];
      const card = document.getElementById('blocker-card');
      const el = document.getElementById('blockers-container');
      document.getElementById('blocker-count').textContent = blockers.length;
      if (blockers.length === 0) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      el.innerHTML = blockers.map(function(b) {
        return '<div class="blocker-item">' +
          '<div class="blocker-title">' + esc(b.description || b.reason || 'Unknown') + '</div>' +
          '<div class="blocker-desc">Attempts: '+(b.attempts||0)+(b.specId?' | Spec: '+b.specId:'')+'</div>' +
          '<div class="blocker-actions">' +
            '<button class="btn success" onclick="resolveBlocker(\\''+b.id+'\\')">Resolve</button>' +
            '<button class="btn" onclick="dismissBlocker(\\''+b.id+'\\')">Dismiss</button>' +
          '</div></div>';
      }).join('');
    }

    async function refreshUserActions() {
      try {
        const data = await api(CC + '/user-actions');
        const card = document.getElementById('action-card');
        const el = document.getElementById('action-container');
        if (!data || !data.actions || !data.actions.length) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        el.innerHTML = data.actions.map(function(a) {
          const promptHtml = a.prompt
            ? '<div style="margin-top:8px;padding:8px 10px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);border-radius:6px;font-family:var(--mono);font-size:11px;color:#fb923c;white-space:pre-wrap;cursor:pointer;" onclick="navigator.clipboard.writeText(this.textContent.trim());this.style.opacity=0.5;setTimeout(()=>this.style.opacity=1,500);" title="Click to copy">' + a.prompt + '</div>' : '';
          return '<div style="padding:10px 14px;border-bottom:1px solid rgba(249,115,22,0.2);">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;">' +
            '<div><strong style="color:#f97316;">' + a.title + '</strong>' +
            '<div style="color:var(--text-muted);font-size:12px;margin-top:3px;">' + a.message + '</div>' +
            promptHtml + '</div>' +
            '<button class="btn" style="font-size:10px;padding:3px 8px;flex-shrink:0;" onclick="dismissAction(\\''+a.id+'\\')">Dismiss</button>' +
            '</div></div>';
        }).join('');
      } catch(e) {}
    }

    async function dismissAction(id) {
      await fetch(CC + '/user-actions/' + id + '/dismiss', { method: 'POST', headers: H });
      refreshUserActions();
    }

    async function refreshMonitor() {
      try {
        const data = await api('/api/sneebly/elon-status');
        const el = document.getElementById('monitor-container');
        const badge = document.getElementById('monitor-badge');
        if (!data) { el.innerHTML = '<div class="empty" style="padding:6px;">Unavailable</div>'; return; }
        const hasErrors   = data.findings && data.findings.some(f => f.severity === 'error');
        const hasWarnings = data.findings && data.findings.some(f => f.severity === 'warning');
        badge.textContent = 'Cycle ' + (data.monitorCycles||0);
        badge.className = hasErrors ? 'badge red' : hasWarnings ? 'badge yellow' : 'badge green';
        let html = '';
        html += '<div class="health-row"><span class="health-label">Server health</span>' +
          '<span style="color:' + (data.healthOk ? 'var(--green)' : 'var(--red)') + ';font-size:11px;font-weight:600;">' + (data.healthOk ? '&#10003; OK' : '&#10007; FAILED') + '</span></div>';
        html += '<div class="health-row"><span class="health-label">TypeScript</span>' +
          '<span style="color:' + (!data.tscErrors ? 'var(--green)' : 'var(--yellow)') + ';font-size:11px;font-weight:600;">' + (!data.tscErrors ? '&#10003; Clean' : '&#9888; Errors') + '</span></div>';
        if (data.findings && data.findings.length > 0) {
          const topFindings = data.findings.slice(0, 3);
          topFindings.forEach(function(f) {
            const fc = f.severity === 'error' ? 'var(--red)' : f.severity === 'warning' ? 'var(--yellow)' : 'var(--text-dim)';
            html += '<div style="font-size:10px;color:'+fc+';padding:3px 0;border-bottom:1px solid var(--border);">['+f.type+'] '+esc(f.message)+'</div>';
          });
          if (data.findings.length > 3) {
            html += '<div style="font-size:9px;color:var(--text-dim);padding:3px 0;">+' + (data.findings.length-3) + ' more</div>';
          }
        } else {
          html += '<div class="health-row"><span class="health-label">Findings</span><span style="color:var(--green);font-size:11px;font-weight:600;">&#10003; All clear</span></div>';
        }
        if (data.lastRun) html += '<div style="font-size:9px;color:var(--text-dim);margin-top:4px;">Last scan: ' + timeAgo(data.lastRun) + '</div>';
        el.innerHTML = html;
      } catch(e) {
        document.getElementById('monitor-container').innerHTML = '<div class="empty" style="padding:6px;">Error</div>';
      }
    }

    async function refreshUiHealth() {
      try {
        const data = await api('/api/sneebly/ui-health?key=' + KEY);
        const badge = document.getElementById('ui-health-badge');
        const el = document.getElementById('ui-health-container');
        if (!data || data.message) {
          badge.textContent = 'no scan'; badge.className = 'badge muted';
          // Update hero
          document.getElementById('h-health').textContent = '--';
          document.getElementById('h-health-sub').textContent = 'no scan yet';
          el.innerHTML = '<div style="font-size:11px;color:var(--text-dim);">No scan yet</div>';
          return;
        }
        const passed = data.routesPassed || 0;
        const failed = data.routesFailed || 0;
        const total  = passed + failed + (data.routesSkipped||0);
        const statusColor = data.status === 'pass' ? 'green' : data.status === 'fail' ? 'red' : 'yellow';
        badge.textContent = data.status.toUpperCase(); badge.className = 'badge ' + statusColor;
        // Hero
        document.getElementById('h-health').textContent = passed + '/' + total;
        document.getElementById('h-health-sub').textContent = failed > 0 ? failed + ' failed' : 'all passing';
        const ago = data.runAt ? timeAgo(data.runAt) : '';
        el.innerHTML =
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;">' +
            '<div><div style="font-size:16px;font-weight:800;color:var(--green);">' + passed + '</div><div style="font-size:9px;color:var(--text-muted);">PASS</div></div>' +
            '<div><div style="font-size:16px;font-weight:800;color:var(--red);">' + failed + '</div><div style="font-size:9px;color:var(--text-muted);">FAIL</div></div>' +
            '<div><div style="font-size:16px;font-weight:800;color:var(--text-muted);">' + (data.routesSkipped||0) + '</div><div style="font-size:9px;color:var(--text-muted);">SKIP</div></div>' +
          '</div>' +
          (ago ? '<div style="font-size:9px;color:var(--text-dim);margin-top:6px;">Scanned ' + ago + '</div>' : '');
      } catch(e) {}
    }

    async function runUiScan(btn) {
      btn.disabled = true; btn.textContent = 'Scanning…';
      try {
        await fetch('/api/sneebly/ui-health/scan?key=' + KEY, { method: 'POST', headers: H });
        setTimeout(function() { refreshUiHealth(); btn.disabled = false; btn.textContent = 'Run Scan'; }, 45000);
      } catch(e) { btn.disabled = false; btn.textContent = 'Run Scan'; }
    }

    async function refreshVerification() {
      const el = document.getElementById('verification-container');
      try {
        const resp = await fetch('/.sneebly/last-verification.json', { headers: { 'x-sneebly-key': KEY } });
        if (!resp.ok) { el.innerHTML = '<div style="font-size:10px;color:var(--text-dim);">No data</div>'; return; }
        const data = JSON.parse(await resp.text());
        const checks = data.checks || [];
        if (!checks.length) { el.innerHTML = '<div style="font-size:10px;color:var(--text-dim);">No checks recorded</div>'; return; }
        el.innerHTML = '<div class="verify-grid">' +
          checks.map(c => '<div class="verify-check">' +
            '<span style="color:' + (c.passed ? 'var(--green)' : 'var(--red)') + ';">' + (c.passed ? '&#10003;' : '&#10007;') + '</span>' +
            esc(c.name || c.check || 'Check') + '</div>').join('') +
          '</div>';
      } catch(e) { el.innerHTML = '<div style="font-size:10px;color:var(--text-dim);">No data</div>'; }
    }

    async function toggleAutonomy() {
      const btn = document.getElementById('btn-start');
      btn.disabled = true;
      if (autonomyRunning) {
        await api(CC + '/autonomy/stop', { method: 'POST' });
      } else {
        await api(CC + '/autonomy/start', { method: 'POST', body: JSON.stringify({ intervalMs: 120000 }) });
      }
      btn.disabled = false;
      await refreshAutonomy();
    }

    async function triggerCycle() {
      const btn = document.getElementById('btn-cycle');
      btn.disabled = true; btn.textContent = 'Running…';
      try {
        await api(CC + '/autonomy/trigger', { method: 'POST' });
        await refreshAll();
      } finally { btn.disabled = false; btn.textContent = 'Run 1 Cycle'; }
    }

    async function fixTsErrors() {
      const btn = document.getElementById('btn-fix-ts');
      btn.disabled = true; btn.textContent = 'Running TSC…';
      try {
        const r = await api(CC + '/fix-ts-errors', { method: 'POST' });
        if (r) {
          const msg = r.errorsBefore === 0
            ? 'No TypeScript errors found!'
            : r.fixed
              ? r.errorsBefore + ' errors → ' + r.errorsAfter + ' errors fixed in: ' + (r.filesModified || []).join(', ')
              : 'Could not resolve all errors: ' + r.errorsAfter + '/' + r.errorsBefore + ' remain. ' + (r.diagnosis || '');
          alert('TSC Fix: ' + msg);
        }
        await refreshAll();
      } finally { btn.disabled = false; btn.textContent = 'Fix TS Errors'; }
    }

    async function runPlaywright() {
      const btn = document.getElementById('btn-playwright');
      const panel = document.getElementById('pw-results-panel');
      const summary = document.getElementById('pw-summary');
      const output = document.getElementById('pw-output');
      btn.disabled = true; btn.textContent = 'Running Tests…';
      panel.style.display = 'none';
      try {
        const r = await api(CC + '/run-playwright', { method: 'POST' });
        panel.style.display = 'block';
        if (!r) {
          summary.innerHTML = '<span style="color:var(--red); font-weight:700;">✗ Request failed — check server logs</span>';
          output.textContent = '(no response from server)';
        } else {
          var color = r.success ? 'var(--green)' : 'var(--red)';
          var icon = r.success ? '✓' : '✗';
          var secs = (r.durationMs / 1000).toFixed(1);
          summary.innerHTML = '<span style="color:' + color + '; font-weight:700;">' + icon + ' ' + r.passed + '/' + r.total + ' passed</span>'
            + '<span style="color:var(--text-dim); font-size:10px; margin-left:10px;">' + secs + 's</span>'
            + (r.failed > 0 ? '<span style="color:var(--red); font-size:10px; margin-left:6px;">· ' + r.failed + ' failed</span>' : '')
            + (r.exitCode !== 0 && r.failed === 0 ? '<span style="color:var(--red); font-size:10px; margin-left:6px;">exit ' + r.exitCode + (r.signal ? ' (' + r.signal + ')' : '') + '</span>' : '');
          output.textContent = r.output || '(no output)';
          output.scrollTop = output.scrollHeight;
        }
      } catch(e) {
        panel.style.display = 'block';
        summary.innerHTML = '<span style="color:var(--red); font-weight:700;">✗ Error running tests</span>';
        output.textContent = (e && e.message) ? e.message : String(e);
      } finally {
        btn.disabled = false; btn.textContent = '▶ Run Playwright';
      }
    }

    async function resolveBlocker(id) { await api(CC + '/blockers/'+id+'/resolve', {method:'POST'}); refreshBlockers(); }
    async function dismissBlocker(id) { await api(CC + '/blockers/'+id+'/dismiss', {method:'POST'}); refreshBlockers(); }
    async function syncCosts()   { await api(CC+'/costs/sync', {method:'POST'}); refreshCosts(); }
    async function recalcCosts() {
      const r = await api(CC+'/costs/recalculate', {method:'POST'});
      if (r) alert('Recalculated: ' + fmt$(r.oldTotal) + ' \u2192 ' + fmt$(r.newTotal));
      refreshCosts();
    }

    // ── Budget panel functions ──
    async function refreshBudget() {
      try {
        const [exp, bgt] = await Promise.all([
          fetch(CC + '/expenses', { headers: H }).then(function(r) { return r.json(); }),
          fetch(CC + '/budget',   { headers: H }).then(function(r) { return r.json(); }),
        ]);
        bgtRenderGauge(exp || {}, bgt || {});
        bgtRenderControls(bgt || {});
        bgtRenderBreakdowns(exp || {});
        bgtRenderTimeline(exp || {});
        bgtRenderTopExpenses(exp || {});
      } catch(e) { console.error('Budget refresh failed:', e); }
    }

    function bgtRenderGauge(exp, bgt) {
      const spent = exp.totalSpent || 0;
      const limit = bgt.limit || 100;
      const remaining = Math.max(0, limit - spent);
      const pct = limit > 0 ? Math.min((spent/limit)*100, 100) : 0;
      const circumference = 364;
      const offset = circumference - (pct/100) * circumference;
      const fill = document.getElementById('bgt-gauge-fill');
      fill.style.strokeDashoffset = offset;
      fill.style.stroke = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--yellow)' : pct > 50 ? 'var(--orange)' : 'var(--green)';
      document.getElementById('bgt-gauge-amt').textContent = fmt$(spent);
      document.getElementById('bgt-limit').textContent = fmt$(limit);
      document.getElementById('bgt-mode-sub').innerHTML = '<span class="bgt-mode-badge ' + (bgt.mode||'notify') + '">' + (bgt.mode === 'stop' ? 'Hard Stop' : 'Notify Only') + '</span>';
      const remEl = document.getElementById('bgt-remaining');
      remEl.textContent = fmt$(remaining);
      remEl.className = 'bgt-stat-val ' + (remaining < limit*0.1 ? 'red' : remaining < limit*0.3 ? 'yellow' : 'green');
      document.getElementById('bgt-pct').textContent = pct.toFixed(1) + '% used';
      const burnPerHour = exp.burnRate ? exp.burnRate.perHour : 0;
      document.getElementById('bgt-burn').textContent = fmt$(burnPerHour) + '/hr';
      const runEl = document.getElementById('bgt-runway');
      const runSubEl = document.getElementById('bgt-runway-sub');
      if (burnPerHour > 0 && remaining > 0) {
        const h = remaining / burnPerHour;
        runEl.textContent = h > 48 ? (h/24).toFixed(1) + 'd' : h.toFixed(1) + 'h';
        runEl.className = 'bgt-stat-val ' + (h < 2 ? 'red' : h < 8 ? 'yellow' : 'green');
        runSubEl.textContent = 'at current burn rate';
      } else if (remaining <= 0) {
        runEl.textContent = 'Depleted'; runEl.className = 'bgt-stat-val red';
        runSubEl.textContent = 'budget exceeded';
      } else {
        runEl.textContent = '\u221E'; runEl.className = 'bgt-stat-val green';
        runSubEl.textContent = 'no active burn';
      }
    }

    function bgtRenderControls(bgt) {
      document.getElementById('bgt-input-limit').value = bgt.limit || 100;
      document.getElementById('bgt-input-mode').value  = bgt.mode  || 'notify';
    }

    function bgtRenderBreakdowns(exp) {
      bgtBarChart('bgt-by-agent',   exp.byAgent   || [], 'agent',   'var(--accent)');
      bgtBarChart('bgt-by-feature', exp.byFeature  || [], 'feature', 'var(--purple)');
      bgtBarChart('bgt-by-model',   exp.byModel    || [], 'model',   'var(--green)');
      const todayEl = document.getElementById('bgt-today-summary');
      todayEl.innerHTML =
        '<div class="bgt-bar-row"><span class="bgt-bar-lbl">Spent today</span><span class="bgt-bar-val">' + fmt$(exp.spentToday||0) + '</span></div>' +
        '<div class="bgt-bar-row"><span class="bgt-bar-lbl">This hour</span><span class="bgt-bar-val">' + fmt$(exp.spentThisHour||0) + '</span></div>' +
        '<div class="bgt-bar-row"><span class="bgt-bar-lbl">Last 24h</span><span class="bgt-bar-val">' + fmt$(exp.spent24h||0) + '</span></div>' +
        '<div class="bgt-bar-row"><span class="bgt-bar-lbl">Daily burn rate</span><span class="bgt-bar-val">' + fmt$(exp.burnRate ? exp.burnRate.perDay : 0) + '</span></div>';
    }

    function bgtBarChart(containerId, data, key, color) {
      const el = document.getElementById(containerId);
      if (!data.length) { el.innerHTML = '<div class="bgt-no-data">No data yet</div>'; return; }
      let max = 0;
      for (let i = 0; i < data.length; i++) if (data[i].cost > max) max = data[i].cost;
      el.innerHTML = data.slice(0,8).map(function(item) {
        const pct = max > 0 ? (item.cost/max)*100 : 0;
        return '<div class="bgt-bar-row">' +
          '<span class="bgt-bar-lbl" title="'+esc(item[key])+'">' + esc(item[key]||'unknown') + '</span>' +
          '<div class="bgt-bar-track"><div class="bgt-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>' +
          '<span class="bgt-bar-val">' + fmt$(item.cost) + '</span></div>';
      }).join('');
    }

    function bgtRenderTimeline(exp) {
      const el = document.getElementById('bgt-timeline');
      const days = exp.timeline || [];
      if (!days.length) { el.innerHTML = '<div class="bgt-no-data">No daily data yet</div>'; return; }
      let max = 0;
      for (let i = 0; i < days.length; i++) if (days[i].cost > max) max = days[i].cost;
      el.innerHTML = days.map(function(day) {
        const pct = max > 0 ? (day.cost/max)*100 : 0;
        const c = day.cost > 30 ? 'var(--red)' : day.cost > 15 ? 'var(--yellow)' : 'var(--accent)';
        return '<div class="bgt-tl-row">' +
          '<span class="bgt-tl-date">' + esc(day.date) + '</span>' +
          '<div class="bgt-tl-bar-wrap"><div class="bgt-tl-bar" style="width:'+Math.max(pct,4)+'%;background:'+c+'"><span>'+fmt$(day.cost)+'</span></div></div>' +
          '<span class="bgt-tl-calls">' + (day.calls||0) + ' calls</span></div>';
      }).join('');
    }

    function bgtRenderTopExpenses(exp) {
      const el = document.getElementById('bgt-top-expenses');
      const top = exp.topExpenses || [];
      if (!top.length) { el.innerHTML = '<div class="bgt-no-data">No expensive calls yet</div>'; return; }
      el.innerHTML = top.slice(0,10).map(function(e) {
        return '<div class="bgt-exp-row">' +
          '<span><span class="bgt-exp-agent">' + esc(e.agent||'') + '</span> <span style="color:var(--text-dim);font-size:9px">' + esc(e.action||'') + '</span></span>' +
          '<span class="bgt-exp-model">' + esc(e.model||'') + '</span>' +
          '<span class="bgt-exp-time">' + (e.timestamp ? shortTime(e.timestamp) : '--') + '</span>' +
          '<span class="bgt-exp-cost">' + fmt$(e.cost) + '</span></div>';
      }).join('');
    }

    async function bgtSave() {
      const limit = parseFloat(document.getElementById('bgt-input-limit').value);
      const mode  = document.getElementById('bgt-input-mode').value;
      if (isNaN(limit) || limit <= 0) { return; }
      const btn = document.getElementById('bgt-save-btn');
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        const res = await fetch(CC + '/budget', { method: 'POST', headers: H, body: JSON.stringify({ limit, mode }) });
        if (!res.ok) throw new Error('Failed');
        await refreshBudget();
      } catch(e) { console.error('Budget save failed:', e); }
      finally { btn.disabled = false; btn.textContent = 'Save'; }
    }

    async function bgtAdd(amount) {
      const current = parseFloat(document.getElementById('bgt-input-limit').value) || 0;
      const newLimit = current + amount;
      const mode = document.getElementById('bgt-input-mode').value;
      document.getElementById('bgt-input-limit').value = newLimit;
      try {
        await fetch(CC + '/budget', { method: 'POST', headers: H, body: JSON.stringify({ limit: newLimit, mode }) });
        await refreshBudget();
      } catch(e) { console.error('Budget add failed:', e); }
    }

    ${processBarJs}

    var liveLastId = null;
    async function refreshLive() {
      var url = CC + '/live';
      if (liveLastId) url += '?after=' + encodeURIComponent(liveLastId);
      var data = await api(url);
      if (!data || !data.entries || !data.entries.length) return;

      var entries = data.entries;
      liveLastId = entries[entries.length - 1].id;

      var dot = document.getElementById('live-dot');
      var current = document.getElementById('live-current');
      var feed = document.getElementById('live-feed');
      var badge = document.getElementById('live-agent-badge');
      var ts = document.getElementById('live-last-update');

      // Pulse the dot
      dot.style.background = '#a78bfa';
      dot.style.boxShadow = '0 0 8px #a78bfa';
      setTimeout(function() { dot.style.boxShadow = 'none'; }, 800);

      // Show latest response in the highlight box
      var latest = entries[entries.length - 1];
      badge.textContent = '[' + esc(latest.agent) + ' / ' + esc(latest.model.replace('claude-','').replace(/-4-[56]/g,'')) + ']';
      ts.textContent = 'updated ' + new Date(latest.timestamp).toLocaleTimeString('en', {hour:'numeric',minute:'2-digit',second:'2-digit'});
      current.textContent = latest.text.slice(0, 1200) + (latest.text.length > 1200 ? '\\n...[truncated]' : '');
      current.scrollTop = 0;

      // Prepend older entries to the feed (skip latest — already shown in the box above)
      var html = entries.slice(0, -1).reverse().map(function(e) {
        var preview = e.text.slice(0, 300).replace(/</g,'&lt;').replace(/>/g,'&gt;');
        var t = new Date(e.timestamp).toLocaleTimeString('en', {hour:'numeric',minute:'2-digit',second:'2-digit'});
        return '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(167,139,250,0.15);border-radius:6px;padding:8px 10px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<span style="font-size:10px;font-weight:600;color:#a78bfa;">' + esc(e.agent) + '</span>' +
          '<span style="font-size:9px;color:var(--text-muted);">' + esc(e.task.slice(0,40)) + ' &bull; ' + esc(e.model.replace('claude-','').replace(/-4-[56]/g,'')) + ' &bull; $' + e.cost.toFixed(4) + ' &bull; ' + t + '</span>' +
          '</div>' +
          '<div style="font-family:var(--mono);font-size:11px;color:var(--text);white-space:pre-wrap;line-height:1.5;max-height:120px;overflow-y:auto;">' + preview + (e.text.length > 300 ? '<span style="color:var(--text-muted);">...</span>' : '') + '</div>' +
          '</div>';
      }).join('');
      feed.insertAdjacentHTML('afterbegin', html);
      // Keep feed from growing too large
      while (feed.children.length > 20) feed.removeChild(feed.lastChild);
    }

    async function refreshAll() {
      await Promise.all([
        refreshAutonomy(),
        refreshRoadmap(),
        refreshActivity(),
        refreshJournal(),
        refreshCosts(),
        refreshBlockers(),
        refreshUserActions(),
        refreshMonitor(),
        refreshUiHealth(),
        refreshVerification(),
        refreshBudget(),
        refreshLive(),
      ]);
      document.getElementById('last-refresh').textContent = 'updated ' + new Date().toLocaleTimeString('en', {hour:'numeric',minute:'2-digit'});
    }

    refreshAll();

    // Fast poll: live status + activity (every 3s for live Claude output)
    setInterval(function() {
      refreshLive();
    }, 3000);

    // Medium poll: autonomy + activity
    setInterval(function() {
      refreshAutonomy();
      refreshActivity();
      refreshJournal();
      refreshCosts();
      refreshBlockers();
      refreshUserActions();
      refreshMonitor();
    }, 5000);

    // Slower poll: roadmap + health + budget (less volatile)
    setInterval(function() {
      refreshRoadmap();
      refreshUiHealth();
      refreshVerification();
      refreshBudget();
    }, 30000);
  </script>
</body>
</html>`;
}
