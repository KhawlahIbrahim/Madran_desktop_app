import { useEffect, useState } from 'react';

const STEPS = ['Mission Details', 'Add Team', 'Confirm & Start'];

export default function CreateMission({ onMissionStarted, onCancel }) {
  const [step, setStep] = useState(0);
  const [locationName, setLocationName] = useState('');
  const [teamSize, setTeamSize] = useState(4);
  const [expectedDurationMin, setExpectedDurationMin] = useState(30);

  const [roster, setRoster] = useState([]);
  const [selected, setSelected] = useState([]);
  const [newName, setNewName] = useState('');
  const [newBadge, setNewBadge] = useState('');

  const [mission, setMission] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    window.madran.roster.list().then(setRoster);
  }, []);

  function toggleSelected(member) {
    setSelected((prev) =>
      prev.find((m) => m.id === member.id) ? prev.filter((m) => m.id !== member.id) : [...prev, member]
    );
  }

  async function addToRoster() {
    if (!newName.trim()) return;
    const member = await window.madran.roster.add({ name: newName.trim(), badgeNumber: newBadge.trim() || null, deviceId: null });
    setRoster((r) => [...r, member]);
    setSelected((s) => [...s, member]);
    setNewName('');
    setNewBadge('');
  }

  async function handleConfirmSetup() {
    const created = await window.madran.mission.create({
      locationName,
      teamSize,
      expectedDurationMin,
      members: selected.map((m) => ({ rosterMemberId: m.id, name: m.name, badgeNumber: m.badgeNumber, deviceId: m.deviceId })),
    });
    setMission(created);
    setStep(2);
  }

  async function handleStart() {
    setStarting(true);
    const started = await window.madran.mission.start(mission.id);
    onMissionStarted(started);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>New Mission</h1>
          <p className="page-subtitle">Step {step + 1} of 3 — {STEPS[step]}</p>
        </div>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            <span className="wizard-step-index">{i + 1}</span> {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card form-card">
          <label>
            Building / location
            <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. Al Rawda Tower, Floor 4–7" />
          </label>
          <label>
            Team size
            <select value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))}>
              {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Expected duration (minutes)
            <input type="number" min="5" value={expectedDurationMin} onChange={(e) => setExpectedDurationMin(Number(e.target.value))} />
          </label>
          <button className="btn btn-primary" disabled={!locationName.trim()} onClick={() => setStep(1)}>Next: Add Team</button>
        </div>
      )}

      {step === 1 && (
        <div className="card form-card">
          <h3>Saved team</h3>
          <p className="hint">Pick from your saved roster, or add a firefighter now.</p>
          <div className="roster-list">
            {roster.map((m) => (
              <label key={m.id} className="roster-row">
                <input type="checkbox" checked={!!selected.find((s) => s.id === m.id)} onChange={() => toggleSelected(m)} />
                <span>{m.name}</span>
                {m.badgeNumber && <span className="hint">#{m.badgeNumber}</span>}
              </label>
            ))}
            {roster.length === 0 && <p className="hint">No saved team members yet — add one below.</p>}
          </div>

          <div className="add-member-row">
            <input placeholder="Firefighter name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input placeholder="Badge # (optional)" value={newBadge} onChange={(e) => setNewBadge(e.target.value)} />
            <button className="btn btn-secondary" onClick={addToRoster}>+ Add</button>
          </div>

          <div className="wizard-actions">
            <button className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary" disabled={selected.length === 0} onClick={handleConfirmSetup}>
              Next: Confirm ({selected.length} selected)
            </button>
          </div>
        </div>
      )}

      {step === 2 && mission && (
        <div className="card form-card">
          <h3>{mission.locationName}</h3>
          <p className="hint">{mission.members.length} team members · {mission.expectedDurationMin} min expected</p>

          <h4>Device readiness</h4>
          <div className="roster-list">
            {mission.members.map((m) => (
              <div key={m.id} className="roster-row">
                <span>{m.name}</span>
                <span className="status-badge status-warning">Awaiting mesh join</span>
              </div>
            ))}
          </div>
          <p className="hint">
            Devices show as ready once they're visible on the MANET after the mission starts. You don't need
            to wait for every device before starting — mesh join happens continuously in the field.
          </p>

          <div className="wizard-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" disabled={starting} onClick={handleStart}>
              {starting ? 'Starting…' : 'Start Mission Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
