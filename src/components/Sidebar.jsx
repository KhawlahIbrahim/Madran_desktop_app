import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'home', label: 'Missions' },
  { key: 'create', label: 'New Mission' },
  { key: 'team', label: 'Team Roster' },
  { key: 'live', label: 'Live Monitoring' },
  { key: 'alerts', label: 'Alerts' },
];

export default function Sidebar({ current, onNavigate, leader, missionActive, syncState, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">S</div>
        <div>
          <div className="sidebar-brand-name">SINMAR</div>
          <div className="sidebar-brand-sub">MADRAN Control</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const disabled = (item.key === 'live' || item.key === 'alerts') && !missionActive;
          return (
            <button
              key={item.key}
              className={`sidebar-item ${current === item.key ? 'active' : ''}`}
              onClick={() => !disabled && onNavigate(item.key)}
              disabled={disabled}
              title={disabled ? 'Start a mission to enable this' : undefined}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-sync">
        <span className={`sync-dot ${syncState}`} />
        {syncState === 'synced' && 'Synced with Firebase'}
        {syncState === 'offline' && 'Offline — saved locally'}
        {syncState === 'pending' && 'Sync pending…'}
      </div>

      <div className="sidebar-leader">
        <div className="sidebar-leader-avatar">{(leader?.name || '?')[0]}</div>
        <div className="sidebar-leader-info">
          <div className="sidebar-leader-name">{leader?.name || 'Not signed in'}</div>
          <div className="sidebar-leader-role">Chief</div>
        </div>
        <button className="sidebar-signout" onClick={onSignOut} title="Sign out">Sign out</button>
      </div>
    </aside>
  );
}
