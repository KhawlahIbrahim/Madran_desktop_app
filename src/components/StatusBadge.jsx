const LABELS = {
  safe: 'Safe',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
};

export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status] || status}</span>;
}
