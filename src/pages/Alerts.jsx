import { useEffect, useState } from 'react';

const ALERT_LABELS = {
  fall_detected: 'Fall detected',
  high_pulse: 'Elevated heart rate',
  low_oxygen: 'Low oxygen saturation',
  high_temperature: 'High body temperature',
  lost_signal: 'Device signal lost',
};
const REQUEST_LABELS = {
  location_request: 'Requested exit path',
  sos_request: 'Rescue alert (SOS)',
};

function useCombinedFeed(missionId) {
  const [items, setItems] = useState([]);

  async function refresh() {
    const [alerts, requests] = await Promise.all([
      window.madran.mission.alerts(missionId),
      window.madran.mission.deviceRequests(missionId),
    ]);
    const combined = [
      ...alerts.map((a) => ({ ...a, kind: 'alert' })),
      ...requests.map((r) => ({ ...r, kind: 'request' })),
    ].sort((a, b) => b.timestamp - a.timestamp);
    setItems(combined);
  }

  useEffect(() => {
    refresh();
    const off1 = window.madran.on('mesh:alert', refresh);
    const off2 = window.madran.on('mesh:deviceRequest', refresh);
    return () => { off1(); off2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  return { items, refresh };
}

export default function Alerts({ mission, members }) {
  const { items, refresh } = useCombinedFeed(mission.id);
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  async function acknowledge(item) {
    if (item.kind === 'alert') await window.madran.alertActions.acknowledge(item.id);
    else await window.madran.requestActions.acknowledge(item.id);
    refresh();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p className="page-subtitle">
            Orange items were triggered by a firefighter's physical button. Everything else was
            detected automatically by the wearables.
          </p>
        </div>
      </div>

      <div className="alerts-list">
        {items.length === 0 && <p className="hint">No alerts yet for this mission.</p>}
        {items.map((item) => {
          const member = memberById[item.memberId];
          const isRequest = item.kind === 'request';
          const label = isRequest ? REQUEST_LABELS[item.type] : ALERT_LABELS[item.type];
          const severityClass = isRequest
            ? (item.type === 'sos_request' ? 'critical' : 'device')
            : item.severity;

          return (
            <div key={item.id} className={`alert-row alert-${severityClass} ${item.acknowledged ? 'acknowledged' : ''}`}>
              <div className="alert-row-main">
                <div className="alert-row-title">{label}</div>
                <div className="alert-row-member">{member?.name || 'Unknown member'}</div>
              </div>
              <div className="alert-row-time">{new Date(item.timestamp).toLocaleTimeString()}</div>
              {!item.acknowledged ? (
                <button className="btn btn-secondary btn-sm" onClick={() => acknowledge(item)}>Acknowledge</button>
              ) : (
                <span className="hint">Acknowledged</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
