// 6.0 Sync to Cloud (SIN-PD-KH-07) — the single process that touches Firebase.
// Never on the mission-critical path (SIN-PD-KH-01). Batched per mission,
// document IDs reuse local SQLite primary keys so re-sync after a dropped
// connection never creates duplicates (SIN-PD-KH-09 sync strategy notes).
//
// NOTE: the four location-bearing fields below (buildingMap, finalLocation,
// alert location, exitPath) are placeholders pending NE-14 MLP v1.0 sign-off,
// exactly as flagged in SIN-PD-KH-09. Do not treat their shape as final.

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, writeBatch, serverTimestamp } = require('firebase/firestore');
const {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail,
} = require('firebase/auth');

let app, dbCloud, auth;

function configure(firebaseConfig) {
  app = initializeApp(firebaseConfig);
  dbCloud = getFirestore(app);
  auth = getAuth(app);
}

async function signIn(email, password) {
  if (!auth) throw new Error('Firebase not configured yet');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// Self-registration for a new Leader account. The system has exactly one role,
// so there's nothing to assign here — Firestore rules (SIN-PD-KH-09) already
// scope every Leader to their own missions/* subtree by uid.
async function signUp(email, password, displayName) {
  if (!auth) throw new Error('Firebase not configured yet');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

async function resetPassword(email) {
  if (!auth) throw new Error('Firebase not configured yet');
  await sendPasswordResetEmail(auth, email);
}

function isConfigured() {
  return !!dbCloud;
}

// Batches all pending D1/D3/D4 records for one mission into a single write.
// The Firestore path is scoped by the Leader's Firebase Auth uid — that's what
// firestore.rules checks (request.auth.uid == leaderId), not the local DB id.
async function syncMission(local, missionId) {
  if (!dbCloud || !auth?.currentUser) return { synced: false, reason: 'offline-or-unconfigured' };
  const leaderId = auth.currentUser.uid;

  const mission = local.getMission(missionId);
  const pendingVitals = local.pendingVitals(missionId);
  const pendingAlerts = local.pendingAlerts(missionId);
  const pendingRequests = local.pendingDeviceRequests(missionId);

  const batch = writeBatch(dbCloud);
  const missionRef = doc(dbCloud, 'leaders', leaderId, 'missions', missionId);

  batch.set(missionRef, {
    locationName: mission.locationName,
    status: mission.status,
    startTime: mission.startTime,
    endTime: mission.endTime,
    syncedAt: serverTimestamp(),
    // buildingMap: PROVISIONAL — pending MLP v1.0 (SIN-PD-KH-09)
  }, { merge: true });

  for (const v of pendingVitals) {
    const ref = doc(dbCloud, 'leaders', leaderId, 'missions', missionId, 'vitalsHistory', v.id);
    batch.set(ref, {
      memberId: v.memberId,
      heartRate: v.heartRate,
      spO2: v.spO2,
      bodyTemperature: v.bodyTemperature,
      confidence: v.confidence,
      timestamp: v.timestamp,
      // finalLocation: PROVISIONAL x/y/floor — pending MLP v1.0
    });
  }
  for (const a of pendingAlerts) {
    const ref = doc(dbCloud, 'leaders', leaderId, 'missions', missionId, 'alerts', a.id);
    batch.set(ref, {
      memberId: a.memberId, type: a.type, severity: a.severity, timestamp: a.timestamp,
    });
  }
  for (const r of pendingRequests) {
    const ref = doc(dbCloud, 'leaders', leaderId, 'missions', missionId, 'deviceRequests', r.id);
    batch.set(ref, {
      memberId: r.memberId, type: r.type, timestamp: r.timestamp,
      // response.exitPath: PROVISIONAL — pending MLP v1.0
    });
  }

  await batch.commit();

  local.markSynced('vitals', pendingVitals.map((v) => v.id));
  local.markSynced('alert', pendingAlerts.map((a) => a.id));
  local.markSynced('device_request', pendingRequests.map((r) => r.id));
  local.markMissionSynced(missionId);

  return { synced: true, counts: { vitals: pendingVitals.length, alerts: pendingAlerts.length, requests: pendingRequests.length } };
}

module.exports = { configure, signIn, signUp, resetPassword, isConfigured, syncMission };
