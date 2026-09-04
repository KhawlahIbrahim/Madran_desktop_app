// Local-first data layer.
//
// This mirrors the four local stores from SIN-PD-KH-02 (class diagram) and
// SIN-PD-KH-07 (data flow diagram): D1 Mission Store, D2 Team/Device Store,
// D3 Vitals & Location History, D4 Alerts & Device Requests Log.
//
// Per SIN-PD-KH-01, this is the source of truth. Firebase is a sync target
// only (see sync.js) and is never on the mission-critical path.

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

let db;

// The physical wearables each firefighter carries (SINMAR MVP scope):
// chest biometrics harness, belt SOS / pass-out device, smart helmet.
// The Location Node is a single mission-level gateway, tracked on the mission row.
const DEVICE_TYPES = ['harness', 'sos', 'helmet'];

function id() {
  return crypto.randomUUID();
}

// Adds a column to an existing table only if it isn't there yet — lets the
// schema evolve without wiping a Chief's local mission history.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function init(userDataPath) {
  db = new Database(path.join(userDataPath, 'madran-local.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leader (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      tabletDeviceId TEXT
    );

    -- D2: saved roster, independent of any one mission
    CREATE TABLE IF NOT EXISTS roster_member (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      badgeNumber TEXT,
      deviceId TEXT,
      createdAt INTEGER
    );

    -- D1: Mission Store
    CREATE TABLE IF NOT EXISTS mission (
      id TEXT PRIMARY KEY,
      locationName TEXT,
      teamSize INTEGER,
      expectedDurationMin INTEGER,
      status TEXT NOT NULL DEFAULT 'setup', -- setup | active | ended
      startTime INTEGER,
      endTime INTEGER,
      syncedAt INTEGER,
      locationNodeStatus TEXT DEFAULT 'disconnected', -- connected | disconnected
      locationNodeLastSeen INTEGER
    );

    -- D2: per-firefighter wearables (harness, SOS device, helmet).
    -- Scoped to a mission; each row is one physical device on the mannequin.
    CREATE TABLE IF NOT EXISTS member_device (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      type TEXT NOT NULL,        -- harness | sos | helmet
      deviceCode TEXT NOT NULL,  -- e.g. HARNESS-01
      status TEXT NOT NULL DEFAULT 'disconnected', -- connected | disconnected | alert
      lastSeen INTEGER,
      FOREIGN KEY (missionId) REFERENCES mission(id)
    );

    -- D2: TeamMember, scoped to a mission
    CREATE TABLE IF NOT EXISTS team_member (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      rosterMemberId TEXT,
      name TEXT NOT NULL,
      badgeNumber TEXT,
      deviceId TEXT,
      meshConnected INTEGER DEFAULT 0,
      status TEXT DEFAULT 'safe', -- safe | warning | critical | offline
      FOREIGN KEY (missionId) REFERENCES mission(id)
    );

    -- D3: VitalSigns history
    CREATE TABLE IF NOT EXISTS vitals (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      heartRate INTEGER,
      spO2 INTEGER,
      bodyTemperature REAL,
      confidence REAL,
      x REAL, y REAL, floor INTEGER, -- placeholder coords, pending MLP v1.0 per SIN-PD-KH-09
      timestamp INTEGER,
      synced INTEGER DEFAULT 0
    );

    -- D4a: Alert (automatic / device-detected only — fall, threshold, lost signal)
    CREATE TABLE IF NOT EXISTS alert (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      type TEXT NOT NULL, -- fall_detected | high_pulse | low_oxygen | high_temperature | lost_signal
      severity TEXT NOT NULL, -- warning | critical
      timestamp INTEGER,
      acknowledged INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0
    );

    -- D4b: DeviceRequest (deliberate button press only — location or SOS)
    CREATE TABLE IF NOT EXISTS device_request (
      id TEXT PRIMARY KEY,
      missionId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      type TEXT NOT NULL, -- location_request | sos_request
      exitPathX REAL, exitPathY REAL, exitPathFloor INTEGER, -- placeholder, pending MLP v1.0
      responseSentAt INTEGER,
      timestamp INTEGER,
      acknowledged INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0
    );
  `);

  // Migrations for databases created before the Location Node columns existed.
  ensureColumn('mission', 'locationNodeStatus', "locationNodeStatus TEXT DEFAULT 'disconnected'");
  ensureColumn('mission', 'locationNodeLastSeen', 'locationNodeLastSeen INTEGER');

  return db;
}

// ---------- Leader ----------
function upsertLeader({ name, email, tabletDeviceId }) {
  const existing = db.prepare('SELECT * FROM leader LIMIT 1').get();
  if (existing) {
    db.prepare('UPDATE leader SET name=?, email=?, tabletDeviceId=? WHERE id=?')
      .run(name, email, tabletDeviceId, existing.id);
    return { ...existing, name, email, tabletDeviceId };
  }
  const leaderId = id();
  db.prepare('INSERT INTO leader (id, name, email, tabletDeviceId) VALUES (?,?,?,?)')
    .run(leaderId, name, email, tabletDeviceId);
  return { id: leaderId, name, email, tabletDeviceId };
}
function getLeader() {
  return db.prepare('SELECT * FROM leader LIMIT 1').get() || null;
}
function clearLeader() {
  db.prepare('DELETE FROM leader').run();
}

// ---------- Roster (saved team, per MVP requirement: "add team from saved list") ----------
function listRoster() {
  return db.prepare('SELECT * FROM roster_member ORDER BY name').all();
}
function addRosterMember({ name, badgeNumber, deviceId }) {
  const mId = id();
  db.prepare('INSERT INTO roster_member (id, name, badgeNumber, deviceId, createdAt) VALUES (?,?,?,?,?)')
    .run(mId, name, badgeNumber, deviceId, Date.now());
  return { id: mId, name, badgeNumber, deviceId };
}
function removeRosterMember(rosterMemberId) {
  db.prepare('DELETE FROM roster_member WHERE id=?').run(rosterMemberId);
}

// ---------- Missions ----------
function listMissions() {
  return db.prepare('SELECT * FROM mission ORDER BY startTime DESC').all();
}
function createMission({ locationName, teamSize, expectedDurationMin, members }) {
  // The team-size chosen in step 1 is a hard cap — the mission can never carry
  // more firefighters than that. The UI also enforces this, this is the backstop.
  if (members.length > teamSize) {
    throw new Error(`This mission is limited to ${teamSize} team members, but ${members.length} were selected.`);
  }

  const missionId = id();
  db.prepare(`INSERT INTO mission (id, locationName, teamSize, expectedDurationMin, status)
              VALUES (?,?,?,?, 'setup')`)
    .run(missionId, locationName, teamSize, expectedDurationMin);

  const insertMember = db.prepare(`
    INSERT INTO team_member (id, missionId, rosterMemberId, name, badgeNumber, deviceId, meshConnected, status)
    VALUES (?,?,?,?,?,?,0,'offline')
  `);
  const insertDevice = db.prepare(`
    INSERT INTO member_device (id, missionId, memberId, type, deviceCode, status)
    VALUES (?,?,?,?,?, 'disconnected')
  `);
  members.forEach((m, i) => {
    const memberId = id();
    insertMember.run(memberId, missionId, m.rosterMemberId || null, m.name, m.badgeNumber || null, m.deviceId || null);
    for (const type of DEVICE_TYPES) {
      const code = `${type.toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
      insertDevice.run(id(), missionId, memberId, type, code);
    }
  });
  return getMission(missionId);
}
function getMission(missionId) {
  const mission = db.prepare('SELECT * FROM mission WHERE id=?').get(missionId);
  if (!mission) return null;
  const members = db.prepare('SELECT * FROM team_member WHERE missionId=?').all(missionId);
  const devices = db.prepare('SELECT * FROM member_device WHERE missionId=?').all(missionId);
  const withDevices = members.map((m) => ({
    ...m,
    devices: devices.filter((d) => d.memberId === m.id).sort((a, b) => DEVICE_TYPES.indexOf(a.type) - DEVICE_TYPES.indexOf(b.type)),
  }));
  const locationNode = {
    code: 'LOCATION-01',
    status: mission.locationNodeStatus || 'disconnected',
    lastSeen: mission.locationNodeLastSeen || null,
  };
  return { ...mission, members: withDevices, locationNode };
}
function setMemberMeshStatus(memberId, connected) {
  db.prepare('UPDATE team_member SET meshConnected=? WHERE id=?').run(connected ? 1 : 0, memberId);
}

// ---------- Member devices (D2 — physical wearables) ----------
function listMemberDevices(missionId) {
  return db.prepare('SELECT * FROM member_device WHERE missionId=?').all(missionId);
}
function setDeviceStatus(missionId, memberId, type, status, lastSeen = Date.now()) {
  const row = db.prepare(
    'UPDATE member_device SET status=?, lastSeen=? WHERE missionId=? AND memberId=? AND type=? RETURNING *'
  ).get(status, lastSeen, missionId, memberId, type);

  // A member is "on mesh" as long as at least one of their wearables is reachable.
  const anyLive = db.prepare(
    "SELECT COUNT(*) AS n FROM member_device WHERE memberId=? AND status IN ('connected','alert')"
  ).get(memberId).n;
  db.prepare('UPDATE team_member SET meshConnected=? WHERE id=?').run(anyLive > 0 ? 1 : 0, memberId);
  if (anyLive === 0) {
    db.prepare("UPDATE team_member SET status='offline' WHERE id=?").run(memberId);
  }
  return row;
}
function setLocationNodeStatus(missionId, status, lastSeen = Date.now()) {
  db.prepare('UPDATE mission SET locationNodeStatus=?, locationNodeLastSeen=? WHERE id=?')
    .run(status, lastSeen, missionId);
}
function startMission(missionId) {
  db.prepare(`UPDATE mission SET status='active', startTime=? WHERE id=?`).run(Date.now(), missionId);
  return getMission(missionId);
}
function endMission(missionId) {
  db.prepare(`UPDATE mission SET status='ended', endTime=? WHERE id=?`).run(Date.now(), missionId);
  return getMission(missionId);
}

// ---------- Vitals (D3) ----------
function recordVitals(missionId, memberId, { heartRate, spO2, bodyTemperature, confidence, x, y, floor }) {
  const vId = id();
  db.prepare(`INSERT INTO vitals (id, missionId, memberId, heartRate, spO2, bodyTemperature, confidence, x, y, floor, timestamp, synced)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`)
    .run(vId, missionId, memberId, heartRate, spO2, bodyTemperature, confidence, x ?? null, y ?? null, floor ?? null, Date.now());

  // derive member status from thresholds — mirrors "Process Automatic Alert" logic conceptually
  let status = 'safe';
  if (heartRate > 160 || spO2 < 85) status = 'critical';
  else if (heartRate > 130 || spO2 < 92) status = 'warning';
  db.prepare('UPDATE team_member SET status=?, meshConnected=1 WHERE id=?').run(status, memberId);

  return { id: vId, missionId, memberId, heartRate, spO2, bodyTemperature, confidence, timestamp: Date.now() };
}
function latestVitalsForMission(missionId) {
  return db.prepare(`
    SELECT v.* FROM vitals v
    INNER JOIN (
      SELECT memberId, MAX(timestamp) AS ts FROM vitals WHERE missionId=? GROUP BY memberId
    ) latest ON v.memberId = latest.memberId AND v.timestamp = latest.ts
  `).all(missionId);
}

// ---------- Alerts (D4a — automatic only) ----------
function createAlert(missionId, memberId, type, severity) {
  const aId = id();
  db.prepare(`INSERT INTO alert (id, missionId, memberId, type, severity, timestamp, acknowledged, synced)
              VALUES (?,?,?,?,?,?,0,0)`)
    .run(aId, missionId, memberId, type, severity, Date.now());
  return { id: aId, missionId, memberId, type, severity, timestamp: Date.now(), acknowledged: 0 };
}
function acknowledgeAlert(alertId) {
  db.prepare('UPDATE alert SET acknowledged=1 WHERE id=?').run(alertId);
}
function listAlerts(missionId) {
  return db.prepare('SELECT * FROM alert WHERE missionId=? ORDER BY timestamp DESC').all(missionId);
}

// ---------- Device Requests (D4b — button press only) ----------
function createDeviceRequest(missionId, memberId, type) {
  const rId = id();
  db.prepare(`INSERT INTO device_request (id, missionId, memberId, type, timestamp, acknowledged, synced)
              VALUES (?,?,?,?,?,0,0)`)
    .run(rId, missionId, memberId, type, Date.now());
  return { id: rId, missionId, memberId, type, timestamp: Date.now(), acknowledged: 0 };
}
function respondToLocationRequest(requestId, { x, y, floor }) {
  db.prepare(`UPDATE device_request SET exitPathX=?, exitPathY=?, exitPathFloor=?, responseSentAt=? WHERE id=?`)
    .run(x, y, floor, Date.now(), requestId);
}
function acknowledgeDeviceRequest(requestId) {
  db.prepare('UPDATE device_request SET acknowledged=1 WHERE id=?').run(requestId);
}
function listDeviceRequests(missionId) {
  return db.prepare('SELECT * FROM device_request WHERE missionId=? ORDER BY timestamp DESC').all(missionId);
}

// ---------- Sync helpers (used by sync.js — 6.0 Sync to Cloud) ----------
function pendingVitals(missionId) {
  return db.prepare('SELECT * FROM vitals WHERE missionId=? AND synced=0').all(missionId);
}
function pendingAlerts(missionId) {
  return db.prepare('SELECT * FROM alert WHERE missionId=? AND synced=0').all(missionId);
}
function pendingDeviceRequests(missionId) {
  return db.prepare('SELECT * FROM device_request WHERE missionId=? AND synced=0').all(missionId);
}
function markSynced(table, ids) {
  if (!ids.length) return;
  const stmt = db.prepare(`UPDATE ${table} SET synced=1 WHERE id=?`);
  const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
  tx(ids);
}
function markMissionSynced(missionId) {
  db.prepare('UPDATE mission SET syncedAt=? WHERE id=?').run(Date.now(), missionId);
}

module.exports = {
  init,
  upsertLeader, getLeader, clearLeader,
  listRoster, addRosterMember, removeRosterMember,
  listMissions, createMission, getMission, setMemberMeshStatus, startMission, endMission,
  listMemberDevices, setDeviceStatus, setLocationNodeStatus,
  recordVitals, latestVitalsForMission,
  createAlert, acknowledgeAlert, listAlerts,
  createDeviceRequest, respondToLocationRequest, acknowledgeDeviceRequest, listDeviceRequests,
  pendingVitals, pendingAlerts, pendingDeviceRequests, markSynced, markMissionSynced,
};
