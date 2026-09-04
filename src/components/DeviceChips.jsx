const DEVICE_LABELS = {
  harness: 'Harness',
  sos: 'SOS',
  helmet: 'Helmet',
};

function seenText(lastSeen) {
  if (!lastSeen) return 'never seen';
  const secs = Math.round((Date.now() - lastSeen) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

export default function DeviceChips({ devices = [] }) {
  if (devices.length === 0) return null;
  return (
    <div className="device-chips">
      {devices.map((d) => (
        <span
          key={d.id || d.type}
          className={`device-chip device-chip-${d.status}`}
          title={`${d.deviceCode} · ${d.status} · last seen ${seenText(d.lastSeen)}`}
        >
          <i className="device-chip-dot" />
          {DEVICE_LABELS[d.type] || d.type}
        </span>
      ))}
    </div>
  );
}

export function connectedSummary(devices = []) {
  const live = devices.filter((d) => d.status === 'connected' || d.status === 'alert');
  if (live.length === 0) return 'No devices connected';
  return `Connected with ${live.map((d) => DEVICE_LABELS[d.type] || d.type).join(', ')}`;
}
