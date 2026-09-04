import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Home from './pages/Home';
import CreateMission from './pages/CreateMission';
import LiveMonitoring from './pages/LiveMonitoring';
import TeamManagement from './pages/TeamManagement';
import Alerts from './pages/Alerts';
import EndMission from './pages/EndMission';
import './styles/app.css';

export default function App() {
  const [leader, setLeader] = useState(null);
  const [checkingLeader, setCheckingLeader] = useState(true);
  const [page, setPage] = useState('home');
  const [activeMission, setActiveMission] = useState(null);
  const [endedMission, setEndedMission] = useState(null);
  const [syncState, setSyncState] = useState('offline');

  useEffect(() => {
    window.madran.leader.get().then((l) => {
      setLeader(l);
      setCheckingLeader(false);
    });
    const off = window.madran.on('sync:completed', () => {
      setSyncState('synced');
      setTimeout(() => setSyncState('offline'), 4000);
    });
    return off;
  }, []);

  async function handleSignOut() {
    await window.madran.leader.clear();
    setLeader(null);
    setActiveMission(null);
    setEndedMission(null);
    setPage('home');
  }

  if (checkingLeader) return null;
  if (!leader) return <Login onSignedIn={setLeader} />;

  return (
    <div className="app-shell">
      <Sidebar
        current={page}
        onNavigate={setPage}
        leader={leader}
        missionActive={!!activeMission}
        syncState={syncState}
        onSignOut={handleSignOut}
      />
      <main className="app-main">
        {page === 'home' && (
          <Home
            onNavigate={setPage}
            onOpenMission={async (m) => {
              // Rows from the missions list don't carry members/devices — hydrate first.
              const full = (await window.madran.mission.get(m.id)) || m;
              if (full.status === 'active') { setActiveMission(full); setPage('live'); }
              else if (full.status === 'ended') { setEndedMission(full); setPage('ended'); }
            }}
          />
        )}
        {page === 'create' && (
          <CreateMission
            onCancel={() => setPage('home')}
            onMissionStarted={(m) => { setActiveMission(m); setPage('live'); }}
          />
        )}
        {page === 'live' && activeMission && (
          <LiveMonitoring
            mission={activeMission}
            onNavigate={setPage}
            onMissionEnded={(m) => { setActiveMission(null); setEndedMission(m); setPage('ended'); }}
          />
        )}
        {page === 'alerts' && activeMission && (
          <Alerts mission={activeMission} members={activeMission.members} />
        )}
        {page === 'team' && <TeamManagement />}
        {page === 'ended' && endedMission && (
          <EndMission mission={endedMission} onDone={() => { setEndedMission(null); setPage('home'); }} />
        )}
      </main>
    </div>
  );
}
