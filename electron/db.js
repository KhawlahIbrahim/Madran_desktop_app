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

function id() {
  return crypto.randomUUID();
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
      syncedAt INTEGER
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
  const missionId = id();
  db.prepare(`INSERT INTO mission (id, locationName, teamSize, expectedDurationMin, status)
              VALUES (?,?,?,?, 'setup')`)
    .run(missionId, locationName, teamSize, expectedDurationMin);

  const insertMember = db.prepare(`
    INSERT INTO team_member (id, missionId, rosterMemberId, name, badgeNumber, deviceId, meshConnected, status)
    VALUES (?,?,?,?,?,?,0,'offline')
  `);
  for (const m of members) {
    insertMember.run(id(), missionId, m.rosterMemberId || null, m.name, m.badgeNumber || null, m.deviceId || null);
  }
  return getMission(missionId);
}
function getMission(missionId) {
  const mission = db.prepare('SELECT * FROM mission WHERE id=?').get(missionId);
  if (!mission) return null;
  const members = db.prepare('SELECT * FROM team_member WHERE missionId=?').all(missionId);
  return { ...mission, members };
}
function setMemberMeshStatus(memberId, connected) {
  db.prepare('UPDATE team_member SET meshConnected=? WHERE id=?').run(connected ? 1 : 0, memberId);
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
  recordVitals, latestVitalsForMission,
  createAlert, acknowledgeAlert, listAlerts,
  createDeviceRequest, respondToLocationRequest, acknowledgeDeviceRequest, listDeviceRequests,
  pendingVitals, pendingAlerts, pendingDeviceRequests, markSynced, markMissionSynced,
};
