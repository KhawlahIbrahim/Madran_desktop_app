export default function SosModal({ request, member, onAcknowledge }) {
  if (!request) return null;
  return (
    <div className="sos-overlay">
      <div className="sos-modal">
        <div className="sos-modal-badge">RESCUE ALERT</div>
        <h2>{member?.name || 'Team member'} pressed the rescue button</h2>
        <p>
          This alert reached you only — MADRAN never broadcasts a rescue request to the
          rest of the team. Coordinate the response now.
        </p>
        <div className="sos-modal-meta">
          Received {new Date(request.timestamp).toLocaleTimeString()}
        </div>
        <button className="btn btn-critical" onClick={() => onAcknowledge(request.id)}>
          Acknowledge
        </button>
      </div>
    </div>
  );
}
