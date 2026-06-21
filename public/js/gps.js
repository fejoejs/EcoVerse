//  GPS-based travel tracking using Geolocation API
import { ref, push, set, update, increment }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function waitEco(cb, tries = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (tries < 40) setTimeout(() => waitEco(cb, tries + 1), 100);
}

let watchId       = null;
let trackPoints   = [];
let trackStart    = null;
let totalDistance = 0;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function detectMode(speedKmh) {
  if (speedKmh < 1)   return { mode: "walking",   factor: 0,     label: "🚶 Walking" };
  if (speedKmh < 25)  return { mode: "bicycle",   factor: 0,     label: "🚲 Cycling" };
  if (speedKmh < 60)  return { mode: "bus",        factor: 0.089, label: "🚌 Bus/Car" };
  if (speedKmh < 120) return { mode: "car-petrol", factor: 0.192, label: "🚗 Car" };
  return                     { mode: "train",      factor: 0.041, label: "🚆 Train" };
}

function setGPSStatus(msg, active = false) {
  const el = document.getElementById("gps-status");
  if (!el) return;
  el.innerHTML = `<i class="fas fa-${active ? "satellite-dish" : "map-marker-alt"}"></i><span>${msg}</span>`;
  el.className = "gps-status" + (active ? " active" : "");
}

function startGPS() {
  if (!navigator.geolocation) {
    window._eco.showToast("GPS not supported on this device.", true);
    return;
  }
  trackPoints   = [];
  totalDistance = 0;
  trackStart    = Date.now();

  setGPSStatus("Tracking your journey… move to detect route.", true);
  document.getElementById("startGPS").style.display = "none";
  document.getElementById("stopGPS").style.display  = "inline-flex";
  document.getElementById("gps-result").style.display = "none";

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lon, speed } = pos.coords;
      const last = trackPoints[trackPoints.length - 1];
      if (last) {
        const dist = haversine(last.lat, last.lon, lat, lon);
        if (dist > 0.005) { // > 5 metres
          totalDistance += dist;
          const elapsed = (Date.now() - trackStart) / 3600000;
          const avgSpeed = elapsed > 0 ? totalDistance / elapsed : 0;
          const mode = detectMode(speed != null ? speed * 3.6 : avgSpeed);
          setGPSStatus(`${mode.label} detected — ${totalDistance.toFixed(2)} km tracked`, true);
        }
      }
      trackPoints.push({ lat, lon, ts: Date.now() });
    },
    err => {
      setGPSStatus("GPS error: " + (err.message || "Permission denied"));
      stopGPS(false);
      window._eco.showToast("GPS access denied or unavailable.", true);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

async function stopGPS(save = true) {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  document.getElementById("startGPS").style.display = "inline-flex";
  document.getElementById("stopGPS").style.display  = "none";

  if (!save || totalDistance < 0.05) {
    setGPSStatus("GPS stopped. Distance too short to log.");
    return;
  }

  // Determine transport mode from average speed
  const elapsed   = (Date.now() - trackStart) / 3600000;
  const avgSpeed  = elapsed > 0 ? totalDistance / elapsed : 0;
  const modeInfo  = detectMode(avgSpeed);
  const co2       = +(totalDistance * modeInfo.factor).toFixed(4);

  const resultEl  = document.getElementById("gps-result");
  const resultTxt = document.getElementById("gps-result-text");
  if (resultEl && resultTxt) {
    resultTxt.textContent =
      `${modeInfo.label} — ${totalDistance.toFixed(2)} km → ${co2.toFixed(3)} kg CO₂`;
    resultEl.style.display = "flex";
  }

  setGPSStatus(`Journey saved: ${totalDistance.toFixed(2)} km as ${modeInfo.label}`);

  // Save to Firebase
  const user = window._eco.auth?.currentUser;
  if (user) {
    const ds      = new Date().toISOString().split("T")[0];
    const entryRef = push(ref(window._eco.db, `users/${user.uid}/data/${ds}/transport`));
    await set(entryRef, {
      transportType: modeInfo.mode,
      amount: +totalDistance.toFixed(3),
      unit: "km",
      co2Impact: co2,
      source: "gps",
      timestamp: new Date().toISOString(),
      date: ds
    });
    try {
      await update(ref(window._eco.db, "globalStats"), {
        totalCO2Tracked: increment(co2)
      });
    } catch (_) {}
    window._eco.showToast(`📍 Journey logged: ${totalDistance.toFixed(2)} km — ${co2.toFixed(3)} kg CO₂`);
    if (typeof window._eco.updateDashboard === "function") window._eco.updateDashboard();
    if (typeof window._eco.checkAchievements === "function") window._eco.checkAchievements();
  }

  totalDistance = 0;
  trackPoints   = [];
}

waitEco(() => {
  document.getElementById("startGPS")?.addEventListener("click", startGPS);
  document.getElementById("stopGPS")?.addEventListener("click",  () => stopGPS(true));
});
