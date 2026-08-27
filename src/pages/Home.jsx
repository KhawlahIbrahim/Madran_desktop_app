import { useEffect, useState } from 'react';

function statusLabel(m) {
  if (m.status === 'active') return { text: 'Active', cls: 'safe' };
  if (m.status === 'ended') return { text: 'Ended', cls: 'offline' };
  return { text: 'Setup', cls: 'warning' };
}

export default function Home({ onNavigate, onOpenMission }) {
  const [missions, setMissions] = useState([]);

  useEffect(() => {
    window.madran.mission.list().then(setMissions);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Missions</h1>
          <p className="page-subtitle">Every past and current mission, stored locally on this tablet.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate('create')}>
          + New Mission
        </button>
      </div>

      {missions.length === 0 ? (
        <div className="empty-state">
          <h3>No missions yet</h3>
          <p>Start your first mission to bring your team onto the mesh and begin live monitoring.</p>
          <button className="btn btn-primary" onClick={() => onNavigate('create')}>Create a mission</button>
        </div>
      ) : (
        <div className="mission-list">
          {missions.map((m) => {
            const s = statusLabel(m);
            return (
              <button key={m.id} className="mission-row" onClick={() => onOpenMission(m)}>
                <div>
                  <div className="mission-row-location">{m.locationName || 'Unnamed location'}</div>
                  <div className="mission-row-meta">
                    {m.teamSize} team members planned · {m.expectedDurationMin} min expected
                  </div>
                </div>
                <span className={`status-badge status-${s.cls}`}>{s.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
