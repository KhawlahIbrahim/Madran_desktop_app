import { useEffect, useState } from 'react';

export default function TeamManagement() {
  const [roster, setRoster] = useState([]);
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('');

  useEffect(() => { window.madran.roster.list().then(setRoster); }, []);

  async function add() {
    if (!name.trim()) return;
    const member = await window.madran.roster.add({ name: name.trim(), badgeNumber: badge.trim() || null, deviceId: null });
    setRoster((r) => [...r, member]);
    setName(''); setBadge('');
  }

  async function remove(id) {
    await window.madran.roster.remove(id);
    setRoster((r) => r.filter((m) => m.id !== id));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Team Roster</h1>
          <p className="page-subtitle">Your saved firefighters — pick from this list when creating a mission.</p>
        </div>
      </div>

      <div className="card form-card">
        <div className="add-member-row">
          <input placeholder="Firefighter name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Badge # (optional)" value={badge} onChange={(e) => setBadge(e.target.value)} />
          <button className="btn btn-primary" onClick={add}>+ Add to roster</button>
        </div>
      </div>

      <div className="roster-grid">
        {roster.map((m) => (
          <div key={m.id} className="card roster-card">
            <div className="roster-card-avatar">{m.name[0]}</div>
            <div className="roster-card-name">{m.name}</div>
            {m.badgeNumber && <div className="hint">Badge #{m.badgeNumber}</div>}
            <div className="hint">Wearables (harness, SOS, helmet) are assigned when a mission starts</div>
            <button className="btn btn-secondary btn-sm" onClick={() => remove(m.id)}>Remove</button>
          </div>
        ))}
        {roster.length === 0 && <p className="hint">No saved firefighters yet.</p>}
      </div>
    </div>
  );
}
