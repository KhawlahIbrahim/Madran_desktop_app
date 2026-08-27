import { useEffect, useMemo, useState } from 'react';
import MapView from '../components/MapView';
import StatusBadge from '../components/StatusBadge';
import SosModal from '../components/SosModal';

function elapsed(startTime) {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export default function LiveMonitoring({ mission, onMissionEnded, onNavigate }) {
  const [members, setMembers] = useState(mission.members);
  const [vitalsByMember, setVitalsByMember] = useState({});
  const [now, setNow] = useState(Date.now());
  const [activeSos, setActiveSos] = useState(null);
  const [lastRequestByMember, setLastRequestByMember] = useState({});

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    window.madran.mission.get(mission.id).then((m) => m && setMembers(m.members));
    window.madran.mission.latestVitals(mission.id).then((rows) => {
      const map = {};
      rows.forEach((v) => { map[v.memberId] = v; });
      setVitalsByMember(map);
    });
  }, [mission.id]);

  useEffect(() => {
    const offVitals = window.madran.on('mesh:vitals', (v) => {
      setVitalsByMember((prev) => ({ ...prev, [v.memberId]: v }));
      window.madran.mission.get(mission.id).then((m) => m && setMembers(m.members));
    });
    const offRequest = window.madran.on('mesh:deviceRequest', (r) => {
      setLastRequestByMember((prev) => ({ ...prev, [r.memberId]: r }));
      if (r.type === 'sos_request') setActiveSos(r);
    });
    const offAlert = window.madran.on('mesh:alert', () => {
      window.madran.mission.get(mission.id).then((m) => m && setMembers(m.members));
    });
    return () => { offVitals(); offRequest(); offAlert(); };
  }, [mission.id]);

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  async function acknowledgeSos() {
    await window.madran.requestActions.acknowledge(activeSos.id);
    setActiveSos(null);
  }

  async function handleEndMission() {
    const ended = await window.madran.mission.end(mission.id);
    onMissionEnded(ended);
  }

  return (
    <div className="page">
      <SosModal request={activeSos} member={activeSos && memberById[activeSos.memberId]} onAcknowledge={acknowledgeSos} />

      <div className="page-header">
        <div>
          <h1>{mission.locationName}</h1>
          <p className="page-subtitle">Live Monitoring · Elapsed {elapsed(mission.startTime || now)}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => onNavigate('alerts')}>View Alerts</button>
          <button className="btn btn-critical-outline" onClick={handleEndMission}>End Mission</button>
        </div>
      </div>

      <div className="live-grid">
        <div className="card team-panel">
          <h3>Team</h3>
          <div className="team-list">
            {members.map((m) => {
              const v = vitalsByMember[m.id];
              const req = lastRequestByMember[m.id];
              return (
                <div key={m.id} className="team-member-row">
                  <div className="team-member-name">
                    {m.name}
                    <span className="hint">{m.meshConnected ? 'On mesh' : 'Joining mesh…'}</span>
                  </div>
                  <div className="team-member-vitals">
                    <span title="Heart rate">♥ {v?.heartRate ?? '—'} bpm</span>
                    <span title="Oxygen saturation">O₂ {v?.spO2 ?? '—'}%</span>
                  </div>
                  <div className="team-member-request">
                    {req ? (req.type === 'sos_request' ? 'SOS sent' : 'Requested exit path') : '—'}
                  </div>
                  <StatusBadge status={m.meshConnected ? m.status : 'offline'} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="card map-panel">
          <h3>Building Map — current floor</h3>
          <MapView members={members} vitalsByMember={vitalsByMember} />
        </div>
      </div>
    </div>
  );
}
