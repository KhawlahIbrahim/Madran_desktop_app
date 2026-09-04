const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const local = require('./db');
const mesh = require('./mesh-simulator');
const sync = require('./sync');

const isDev = !app.isPackaged;
let mainWindow;
let activeMissionId = null;

function hasInternet() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '8.8.8.8', port: 53, timeout: 1500 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0B1E33',
    icon: path.join(__dirname, isDev ? '../build/icon.png' : '../dist/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  local.init(app.getPath('userData'));
  createWindow();

  // Firebase config is optional at first run — see README for setup.
  try {
    const firebaseConfig = require('./firebase-config.json');
    sync.configure(firebaseConfig);
  } catch {
    console.log('[MADRAN] No firebase-config.json yet — cloud sync disabled until configured. See README.');
  }

  // Opportunistic sync loop — checks connectivity every 30s, never blocks the UI.
  setInterval(async () => {
    if (!activeMissionId || !sync.isConfigured()) return;
    const online = await hasInternet();
    if (!online) return;
    const leader = local.getLeader();
    if (!leader) return;
    try {
      const result = await sync.syncMission(local, activeMissionId);
      if (result.synced) mainWindow?.webContents.send('sync:completed', result);
    } catch (err) {
      console.warn('[MADRAN] Sync attempt failed, will retry:', err.message);
    }
  }, 30000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  mesh.stop();
  if (process.platform !== 'darwin') app.quit();
});

// ---------------- IPC: Leader / Auth ----------------
ipcMain.handle('leader:get', () => local.getLeader());
ipcMain.handle('leader:save', (_e, data) => local.upsertLeader(data));
ipcMain.handle('leader:clear', () => local.clearLeader());
const OFFLINE_AUTH_CODES = new Set([
  'auth/network-request-failed',
  'auth/timeout',
  'auth/internal-error',
]);

const AUTH_MESSAGES = {
  'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
  'auth/invalid-email': 'That doesn’t look like a valid email address.',
  'auth/weak-password': 'Password is too weak — use at least 6 characters.',
  'auth/missing-password': 'Please enter a password.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account found for this email — register first.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/missing-email': 'Please enter your email address first.',
};
function authError(err) {
  return new Error(AUTH_MESSAGES[err.code] || err.message || 'Authentication failed.');
}

ipcMain.handle('cloud:signIn', async (_e, { email, password }) => {
  try {
    const user = await sync.signIn(email, password);
    return local.upsertLeader({ name: user.displayName || email, email, tabletDeviceId: null });
  } catch (err) {
    // If we're just offline and this Chief has signed in on this laptop before,
    // let them straight through — missions run fully local anyway.
    const existing = local.getLeader();
    if (OFFLINE_AUTH_CODES.has(err.code) && existing && existing.email === email) {
      return { ...existing, offlineFallback: true };
    }
    throw authError(err);
  }
});
ipcMain.handle('cloud:signUp', async (_e, { email, password, name }) => {
  try {
    const user = await sync.signUp(email, password, name);
    return local.upsertLeader({ name: user.displayName || name || email, email, tabletDeviceId: null });
  } catch (err) {
    // Online registration is preferred, but if the network is down we still
    // create the Chief locally so the app is usable now; the account can be
    // registered online later.
    if (OFFLINE_AUTH_CODES.has(err.code)) {
      const leader = local.upsertLeader({ name: name || email, email, tabletDeviceId: null });
      return { ...leader, offlineFallback: true };
    }
    throw authError(err);
  }
});
ipcMain.handle('cloud:resetPassword', async (_e, { email }) => {
  try {
    await sync.resetPassword(email);
    return { sent: true };
  } catch (err) {
    throw authError(err);
  }
});
ipcMain.handle('cloud:isConfigured', () => sync.isConfigured());

// ---------------- IPC: Roster ----------------
ipcMain.handle('roster:list', () => local.listRoster());
ipcMain.handle('roster:add', (_e, member) => local.addRosterMember(member));
ipcMain.handle('roster:remove', (_e, id) => local.removeRosterMember(id));

// ---------------- IPC: Missions ----------------
ipcMain.handle('mission:list', () => local.listMissions());
ipcMain.handle('mission:create', (_e, payload) => local.createMission(payload));
ipcMain.handle('mission:get', (_e, missionId) => local.getMission(missionId));

ipcMain.handle('mission:start', (_e, missionId) => {
  const mission = local.startMission(missionId);
  activeMissionId = missionId;

  mesh.start(
    missionId,
    mission.members.map((m) => ({
      id: m.id,
      deviceTypes: m.devices.map((d) => d.type),
      onConnected: (id) => local.setMemberMeshStatus(id, true),
    })),
    {
      onDeviceStatus: (memberId, type, status) => {
        const device = local.setDeviceStatus(missionId, memberId, type, status);
        if (device) mainWindow?.webContents.send('mesh:deviceStatus', device);
      },
      onLocationNode: (status) => {
        local.setLocationNodeStatus(missionId, status);
        mainWindow?.webContents.send('mesh:locationNode', { code: 'LOCATION-01', status, lastSeen: Date.now() });
      },
      onVitals: (memberId, reading) => {
        const v = local.recordVitals(missionId, memberId, reading);
        mainWindow?.webContents.send('mesh:vitals', v);
      },
      onDeviceRequest: (memberId, type) => {
        const r = local.createDeviceRequest(missionId, memberId, type);
        if (type === 'location_request') {
          // Tablet computes shortest exit path (placeholder coords pending MLP v1.0)
          local.respondToLocationRequest(r.id, { x: 0, y: 0, floor: 1 });
        }
        mainWindow?.webContents.send('mesh:deviceRequest', r);
      },
      onAlert: (memberId, type, severity) => {
        const a = local.createAlert(missionId, memberId, type, severity);
        mainWindow?.webContents.send('mesh:alert', a);
      },
    }
  );
  return mission;
});

ipcMain.handle('mission:end', (_e, missionId) => {
  mesh.stop();
  activeMissionId = null;
  return local.endMission(missionId);
});

ipcMain.handle('mission:latestVitals', (_e, missionId) => local.latestVitalsForMission(missionId));
ipcMain.handle('mission:alerts', (_e, missionId) => local.listAlerts(missionId));
ipcMain.handle('mission:deviceRequests', (_e, missionId) => local.listDeviceRequests(missionId));
ipcMain.handle('alert:acknowledge', (_e, alertId) => local.acknowledgeAlert(alertId));
ipcMain.handle('request:acknowledge', (_e, requestId) => local.acknowledgeDeviceRequest(requestId));

ipcMain.handle('mission:syncNow', async (_e, missionId) => {
  const leader = local.getLeader();
  if (!leader) return { synced: false, reason: 'no-leader' };
  return sync.syncMission(local, missionId);
});
