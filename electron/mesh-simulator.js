// MOCK MESH BRIDGE
// ------------------
// Stands in for the real Location Node (SIN-PD-KH-01, Layer 2) until the
// UWB + Bluetooth Mesh + LoRa hardware and firmware exist. It emits the same
// four events the real Location Node would relay to the tablet:
//
//   vitals_update    — every 2-3s per connected member (Technical Requirements §2.3)
//   location_request — occasional, simulates a firefighter pressing the location button
//   sos_request      — rare, simulates the rescue button
//   fall_alert / threshold_alert — rare, simulates on-device automatic detection
//
// Swap this file for a real transport (serial/BLE/UDP bridge to the actual
// Location Node) without touching anything else — callers only depend on
// start(missionId, members, callbacks) / stop().

let interval = null;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function start(missionId, members, { onVitals, onDeviceRequest, onAlert }) {
  stop();
  // mark everyone connected shortly after mission start, like a real mesh join
  members.forEach((m) => setTimeout(() => m.onConnected?.(m.id), randomBetween(300, 1500)));

  interval = setInterval(() => {
    members.forEach((member) => {
      // baseline vitals with small drift, occasional simulated spike for demo purposes
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

      // rare simulated button presses / automatic events
      const roll = Math.random();
      if (roll < 0.01) onDeviceRequest(member.id, 'location_request');
      else if (roll < 0.012) onDeviceRequest(member.id, 'sos_request');
      else if (roll < 0.015) onAlert(member.id, 'fall_detected', 'critical');
    });
  }, 2500);
}

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
}

module.exports = { start, stop };
