// Mission report generator (SIN-PD-KH — End Mission summary export).
// Builds a self-contained, print-ready HTML document from a mission's local
// data. main.js loads this into a hidden BrowserWindow and calls
// webContents.printToPDF() on it — no PDF library dependency needed.

const DEVICE_LABELS = { harness: 'Chest Harness', sos: 'SOS / Pass-Out', helmet: 'Smart Helmet' };
const ALERT_LABELS = {
  fall_detected: 'Fall Detected',
  high_pulse: 'High Pulse',
  low_oxygen: 'Low Oxygen',
  high_temperature: 'High Temperature',
  lost_signal: 'Lost Signal',
};
const REQUEST_LABELS = { location_request: 'Location Request', sos_request: 'SOS Request' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDuration(startMs, endMs) {
  if (!startMs || !endMs) return '—';
  const mins = Math.round((endMs - startMs) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function memberName(members, memberId) {
  return members.find((m) => m.id === memberId)?.name || 'Unknown';
}

function row(cells) {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function table(headers, rows, emptyLabel) {
  if (rows.length === 0) return `<p class="empty">${emptyLabel}</p>`;
  return `
    <table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

function buildMissionReportHtml(mission, { vitals = [], alerts = [], deviceRequests = [] }) {
  const members = mission.members || [];

  const rosterRows = members.map((m) => row([
    escapeHtml(m.name),
    escapeHtml(m.badgeNumber || '—'),
    (m.devices || []).map((d) => `${DEVICE_LABELS[d.type] || d.type}: ${d.status}`).join('<br>') || '—',
  ]));

  const vitalsRows = vitals.map((v) => row([
    fmtDateTime(v.timestamp),
    escapeHtml(memberName(members, v.memberId)),
    v.heartRate ?? '—',
    v.spO2 ?? '—',
    v.bodyTemperature != null ? `${v.bodyTemperature}°C` : '—',
    v.confidence != null ? `${Math.round(v.confidence * 100)}%` : '—',
  ]));

  const alertRows = alerts.map((a) => row([
    fmtDateTime(a.timestamp),
    escapeHtml(memberName(members, a.memberId)),
    ALERT_LABELS[a.type] || escapeHtml(a.type),
    `<span class="sev sev-${a.severity}">${escapeHtml(a.severity)}</span>`,
    a.acknowledged ? 'Yes' : 'No',
  ]));

  const requestRows = deviceRequests.map((r) => row([
    fmtDateTime(r.timestamp),
    escapeHtml(memberName(members, r.memberId)),
    REQUEST_LABELS[r.type] || escapeHtml(r.type),
    r.responseSentAt ? fmtDateTime(r.responseSentAt) : '—',
    r.acknowledged ? 'Yes' : 'No',
  ]));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>MADRAN Mission Report — ${escapeHtml(mission.locationName || 'Mission')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1A2634; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 28px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #D6DBE2; }
  .subtitle { color: #5B6673; margin: 0 0 20px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 24px; background: #F5F7FA; padding: 16px; border-radius: 8px; }
  .summary-item .label { color: #5B6673; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .summary-item .value { font-weight: 700; font-size: 13px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E5E9EE; font-size: 11px; }
  th { color: #5B6673; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
  .empty { color: #8A93A0; font-style: italic; margin: 4px 0; }
  .sev { padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: capitalize; }
  .sev-critical { background: #FDEDED; color: #C0362C; }
  .sev-warning { background: #FDF3DC; color: #7A5B00; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #D6DBE2; color: #8A93A0; font-size: 10px; }
</style>
</head>
<body>
  <h1>MADRAN Mission Report</h1>
  <p class="subtitle">SINMAR — Safety Intelligent Network for Monitoring &amp; Advanced Response</p>

  <div class="summary-grid">
    <div class="summary-item"><div class="label">Location</div><div class="value">${escapeHtml(mission.locationName || 'Unnamed location')}</div></div>
    <div class="summary-item"><div class="label">Status</div><div class="value">${escapeHtml(mission.status)}</div></div>
    <div class="summary-item"><div class="label">Team size (planned / actual)</div><div class="value">${mission.teamSize} / ${members.length}</div></div>
    <div class="summary-item"><div class="label">Start time</div><div class="value">${fmtDateTime(mission.startTime)}</div></div>
    <div class="summary-item"><div class="label">End time</div><div class="value">${fmtDateTime(mission.endTime)}</div></div>
    <div class="summary-item"><div class="label">Duration</div><div class="value">${fmtDuration(mission.startTime, mission.endTime)}</div></div>
    <div class="summary-item"><div class="label">Location Node</div><div class="value">${escapeHtml(mission.locationNode?.status || '—')}</div></div>
    <div class="summary-item"><div class="label">Synced to cloud</div><div class="value">${mission.syncedAt ? fmtDateTime(mission.syncedAt) : 'Not yet synced'}</div></div>
  </div>

  <h2>Team Roster (${members.length})</h2>
  ${table(['Name', 'Badge #', 'Devices (final status)'], rosterRows, 'No team members recorded.')}

  <h2>Alerts (${alerts.length})</h2>
  ${table(['Time', 'Member', 'Type', 'Severity', 'Acknowledged'], alertRows, 'No alerts during this mission.')}

  <h2>Device Requests (${deviceRequests.length})</h2>
  ${table(['Time', 'Member', 'Type', 'Response Sent', 'Acknowledged'], requestRows, 'No device requests during this mission.')}

  <h2>Vitals History (${vitals.length} readings)</h2>
  ${table(['Time', 'Member', 'Heart Rate', 'SpO₂', 'Body Temp', 'Confidence'], vitalsRows, 'No vitals recorded.')}

  <div class="footer">
    Generated ${fmtDateTime(Date.now())} · Location/coordinate fields are provisional pending MLP v1.0 sign-off (SIN-PD-KH-09).
  </div>
</body>
</html>`;
}

module.exports = { buildMissionReportHtml };
