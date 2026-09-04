// MOCK MESH BRIDGE
// ------------------
// Stands in for the real Location Node (SIN-PD-KH-01, Layer 2) until the
// BLE-mesh hardware and firmware exist. It emits the same events the real
// Location Node would relay to the Chief laptop:
//
//   deviceStatus     — heartbeat / connection state per wearable
//   locationNode     — connection state of the gateway itself
//   vitals_update    — every 2-3s per member whose harness is connected
//   location_request — occasional, simulates the firefighter's location button
//   sos_request      — rare, simulates the physical SOS / pass-out button
//   fall_alert / threshold_alert — rare, simulates on-device detection (MPU-6050)
//
// Swap this file for a real transport (serial/BLE bridge to the actual Location
// Node) without touching anything else — callers only depend on
// start(missionId, members, callbacks) / stop().

let interval = null;
const timers = new Set();

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function later(fn, ms) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

function start(missionId, members, { onVitals, onDeviceRequest, onAlert, onDeviceStatus, onLocationNode }) {
  stop();

  // Track live state per (memberId, deviceType) so a "turned-off" wearable
  // stays off until it "reconnects", exactly like the real thing.
  const deviceState = new Map(); // key `${memberId}:${type}` -> 'connected' | 'disconnected' | 'alert'
  const key = (memberId, type) => `${memberId}:${type}`;

  function setDevice(memberId, type, status) {
    deviceState.set(key(memberId, type), status);
    onDeviceStatus?.(memberId, type, status);
  }

  // Gateway comes up first, then each wearable joins the mesh over a second or two.
  later(() => onLocationNode?.('connected'), randomBetween(200, 800));
  members.forEach((m) => {
    m.deviceTypes.forEach((type) => {
      deviceState.set(key(m.id, type), 'disconnected');
      later(() => {
        setDevice(m.id, type, 'connected');
        m.onConnected?.(m.id);
      }, randomBetween(400, 2200));
    });
  });

  interval = setInterval(() => {
    members.forEach((member) => {
      const harnessLive = deviceState.get(key(member.id, 'harness')) === 'connected';
      const sosLive = deviceState.get(key(member.id, 'sos'));

      // Heartbeat: refresh last-seen for every wearable that is currently on the mesh.
      member.deviceTypes.forEach((type) => {
        if (deviceState.get(key(member.id, type)) === 'connected') {
          onDeviceStatus?.(member.id, type, 'connected');
        }
      });

      // Occasionally a wearable drops off the mesh, then recovers after a bit.
      member.deviceTypes.forEach((type) => {
        if (deviceState.get(key(member.id, type)) === 'connected' && Math.random() < 0.012) {
          setDevice(member.id, type, 'disconnected');
          onAlert(member.id, 'lost_signal', 'warning');
          later(() => setDevice(member.id, type, 'connected'), randomBetween(8000, 16000));
        }
      });

      if (!harnessLive) return; // no live biometrics without the chest harness

      const spike = Math.random() < 0.03;
      const heartRate = Math.round(spike ? randomBetween(150, 180) : randomBetween(70, 115));
      const spO2 = Math.round(spike ? randomBetween(80, 90) : randomBetween(94, 99));
      const bodyTemperature = Number(randomBetween(36.4, 38.6).toFixed(1));

      onVitals(member.id, {
        heartRate,
        spO2,
        bodyTemperature,
        confidence: Number(randomBetween(0.85, 0.99).toFixed(2)),
        x: Number(randomBetween(0, 100).toFixed(1)),
        y: Number(randomBetween(0, 100).toFixed(1)),
        floor: 1,
      });

      if (heartRate > 160 || spO2 < 85) {
        onAlert(member.id, heartRate > 160 ? 'high_pulse' : 'low_oxygen', 'critical');
      } else if (heartRate > 130 || spO2 < 92) {
        onAlert(member.id, heartRate > 130 ? 'high_pulse' : 'low_oxygen', 'warning');
      }

      // Rare physical button presses / on-device detection — all routed through
      // the SOS / pass-out device on the belt.
      if (sosLive === 'connected') {
        const roll = Math.random();
        if (roll < 0.01) {
          onDeviceRequest(member.id, 'location_request');
        } else if (roll < 0.012) {
          onDeviceRequest(member.id, 'sos_request');
          setDevice(member.id, 'sos', 'alert');
          later(() => setDevice(member.id, 'sos', 'connected'), 6000);
        } else if (roll < 0.015) {
          onAlert(member.id, 'fall_detected', 'critical');
          setDevice(member.id, 'sos', 'alert');
          later(() => setDevice(member.id, 'sos', 'connected'), 6000);
        }
      }
    });
  }, 2500);
}

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
  timers.forEach(clearTimeout);
  timers.clear();
}

module.exports = { start, stop };
