import { useState } from 'react';

function duration(start, end) {
  const mins = Math.round((end - start) / 60000);
  return `${mins} min`;
}

export default function EndMission({ mission, onDone }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  async function syncNow() {
    setSyncing(true);
    const result = await window.madran.mission.syncNow(mission.id);
    setSyncResult(result);
    setSyncing(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Mission Ended</h1>
          <p className="page-subtitle">{mission.locationName}</p>
        </div>
      </div>

      <div className="card form-card">
        <h3>Summary</h3>
        <p>Duration: {mission.startTime && mission.endTime ? duration(mission.startTime, mission.endTime) : '—'}</p>
        <p>Team members: {mission.members?.length ?? '—'}</p>
        <p className="hint">The full report is already saved locally on this tablet — that happens unconditionally,
          regardless of connectivity.</p>

        {!syncResult ? (
          <button className="btn btn-primary" disabled={syncing} onClick={syncNow}>
            {syncing ? 'Syncing…' : 'Sync to Firebase now'}
          </button>
        ) : syncResult.synced ? (
          <p className="hint">
            Synced: {syncResult.counts.vitals} vitals readings, {syncResult.counts.alerts} alerts,{' '}
            {syncResult.counts.requests} device requests.
          </p>
        ) : (
          <p className="hint">Couldn't sync right now ({syncResult.reason}). It'll sync automatically once online.</p>
        )}

        <button className="btn btn-secondary" onClick={onDone}>Back to Missions</button>
      </div>
    </div>
  );
}
