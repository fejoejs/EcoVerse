//CO2 calculations, form handling, Firebase CRUD
import { ref, push, set, get, update, increment }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function waitEco(cb, t = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 100);
}

// CO2 factor tables
const DIET_F  = { "red-meat":27,"poultry":6.9,"fish":5.1,"dairy":3.2,"plant-based":1.0,"beverages":0.5 };
const TRANS_F = { "car-petrol":0.192,"car-diesel":0.171,"car-electric":0.053,"car-hybrid":0.110,"bus":0.089,"train":0.041,"bicycle":0,"walking":0,"motorcycle":0.103,"flight-domestic":0.255 };
const NRGY_F  = { "electricity-grid":0.5,"electricity-renewable":0.05,"natural-gas":0.185,"heating-oil":0.245,"propane":0.214,"solar":0,"wind":0 };

export function calcDietCO2(type, amount, unit) {
  let kg = amount;
  if (unit === "servings") kg = amount * 0.2;
  return +(kg * (DIET_F[type] || 1)).toFixed(4);
}
export function calcTransportCO2(type, amount, unit) {
  let km = amount;
  if (unit === "miles")  km = amount * 1.60934;
  if (unit === "liters") km = amount * 12;
  if (unit === "kwh")    km = amount * 6;
  return +(km * (TRANS_F[type] || 0.1)).toFixed(4);
}
export function calcEnergyCO2(type, amount, unit) {
  let kwh = amount;
  if (unit === "m3")     kwh = amount * 10.55;
  if (unit === "liters") kwh = amount * 10.35;
  return +(kwh * (NRGY_F[type] || 0.3)).toFixed(4);
}

// DB helpers
function getDateStr() {
  return document.getElementById("date-select")?.value || new Date().toISOString().split("T")[0];
}
async function saveEntry(uid, category, data) {
  const db  = window._eco.db;
  const ds  = getDateStr();
  const entry = { ...data, timestamp: new Date().toISOString(), date: ds };
  await set(push(ref(db, `users/${uid}/data/${ds}/${category}`)), entry);
  try { await update(ref(db, "globalStats"), { totalCO2Tracked: increment(data.co2Impact || 0) }); } catch (_) {}
}
export async function getDayData(uid, ds) {
  const snap = await get(ref(window._eco.db, `users/${uid}/data/${ds}`));
  return snap.exists() ? snap.val() : {};
}
export async function getWeekData(uid) {
  const snap = await get(ref(window._eco.db, `users/${uid}/data`));
  const all  = snap.exists() ? snap.val() : {};
  const result = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    result[ds] = all[ds] || {};
  }
  return result;
}
export function sumCat(dayData, cat) {
  if (!dayData[cat]) return 0;
  return Object.values(dayData[cat]).reduce((s, e) => s + (e.co2Impact || 0), 0);
}

// Display name maps
export const FOOD_NAMES  = { "red-meat":"Red Meat","poultry":"Poultry","fish":"Fish & Seafood","dairy":"Dairy","plant-based":"Plant-based","beverages":"Beverages" };
export const TRANS_NAMES = { "car-petrol":"Petrol Car","car-diesel":"Diesel Car","car-electric":"Electric Car","car-hybrid":"Hybrid Car","bus":"Bus","train":"Train","bicycle":"Bicycle","walking":"Walking","motorcycle":"Motorcycle","flight-domestic":"Domestic Flight" };
export const NRG_NAMES   = { "electricity-grid":"Grid Electricity","electricity-renewable":"Renewable","natural-gas":"Natural Gas","heating-oil":"Heating Oil","propane":"Propane","solar":"Solar","wind":"Wind" };

// Live preview on input
function setupPreview(amtId, typeId, unitId, previewId, txtId, calcFn, warnId, limits) {
  const run = () => {
    const amt  = parseFloat(document.getElementById(amtId)?.value);
    const type = document.getElementById(typeId)?.value;
    const unit = document.getElementById(unitId)?.value;
    const prev = document.getElementById(previewId);
    const warn = document.getElementById(warnId);
    if (!amt || amt <= 0) { prev && (prev.style.display = "none"); warn && (warn.style.display = "none"); return; }
    const co2 = calcFn(type, amt, unit);
    const t   = document.getElementById(txtId);
    if (t) t.textContent = `Estimated carbon: ${co2.toFixed(3)} kg CO₂`;
    if (prev) prev.style.display = "flex";
    const lim = limits[type];
    if (warn) {
      if (lim && amt > lim.max && lim.max > 0) { warn.textContent = `⚠️ ${lim.msg}`; warn.style.display = "block"; }
      else warn.style.display = "none";
    }
  };
  ["input","change"].forEach(ev =>
    [amtId, typeId, unitId].forEach(id => document.getElementById(id)?.addEventListener(ev, run)));
}

const DIET_LIMITS  = { "red-meat":{ max:0.1, msg:"Red meat: limit 100g/day — very high emissions!" }, "poultry":{ max:0.3, msg:"Poultry: limit 300g/day." }, "dairy":{ max:0.6, msg:"Dairy: limit 600g/L per day." } };
const TRANS_LIMITS = { "car-petrol":{ max:30, msg:"Petrol car: consider limiting to 30 km/day." }, "flight-domestic":{ max:0, msg:"Domestic flight: very high emissions — avoid if possible!" } };
const NRGY_LIMITS  = { "electricity-grid":{ max:10, msg:"Grid electricity: try to stay under 10 kWh/day." }, "heating-oil":{ max:3, msg:"Heating oil: try to limit to 3 L/day." } };

waitEco(() => {
  const auth = window._eco.auth;

  setupPreview("food-amount","food-type","food-unit","diet-preview","diet-preview-text",calcDietCO2,"diet-limit-warning",DIET_LIMITS);
  setupPreview("transport-amount","transport-type","transport-unit","transport-preview","transport-preview-text",calcTransportCO2,"transport-limit-warning",TRANS_LIMITS);
  setupPreview("energy-amount","energy-type","energy-unit","energy-preview","energy-preview-text",calcEnergyCO2,"energy-limit-warning",NRGY_LIMITS);

  document.getElementById("date-select")?.addEventListener("change", () => {
    if (auth.currentUser && window._eco.updateDashboard) window._eco.updateDashboard();
  });

  // Diet form
  document.getElementById("diet-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!auth.currentUser) { window._eco.showToast("Please login first.", true); return; }
    const type = document.getElementById("food-type").value;
    const amt  = parseFloat(document.getElementById("food-amount").value);
    const unit = document.getElementById("food-unit").value;
    if (!amt || amt <= 0) { window._eco.showToast("Enter a valid amount.", true); return; }
    const co2 = calcDietCO2(type, amt, unit);
    await saveEntry(auth.currentUser.uid, "diet", { foodType:type, amount:amt, unit, co2Impact:co2 });
    window._eco.showToast(`🥗 Meal logged — ${co2.toFixed(3)} kg CO₂`);
    e.target.reset(); document.getElementById("diet-preview").style.display = "none";
    if (window._eco.updateDashboard)  window._eco.updateDashboard();
    if (window._eco.checkAchievements) window._eco.checkAchievements();
  });

  // Transport form
  document.getElementById("transport-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!auth.currentUser) { window._eco.showToast("Please login first.", true); return; }
    const type = document.getElementById("transport-type").value;
    const amt  = parseFloat(document.getElementById("transport-amount").value);
    const unit = document.getElementById("transport-unit").value;
    if (!amt || amt <= 0) { window._eco.showToast("Enter a valid amount.", true); return; }
    const co2 = calcTransportCO2(type, amt, unit);
    await saveEntry(auth.currentUser.uid, "transport", { transportType:type, amount:amt, unit, co2Impact:co2 });
    window._eco.showToast(`🚗 Journey logged — ${co2.toFixed(3)} kg CO₂`);
    e.target.reset(); document.getElementById("transport-preview").style.display = "none";
    if (window._eco.updateDashboard)   window._eco.updateDashboard();
    if (window._eco.checkAchievements) window._eco.checkAchievements();
  });

  // Energy form
  document.getElementById("energy-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!auth.currentUser) { window._eco.showToast("Please login first.", true); return; }
    const type = document.getElementById("energy-type").value;
    const amt  = parseFloat(document.getElementById("energy-amount").value);
    const unit = document.getElementById("energy-unit").value;
    if (!amt || amt <= 0) { window._eco.showToast("Enter a valid amount.", true); return; }
    const co2 = calcEnergyCO2(type, amt, unit);
    await saveEntry(auth.currentUser.uid, "energy", { energyType:type, amount:amt, unit, co2Impact:co2 });
    window._eco.showToast(`⚡ Usage logged — ${co2.toFixed(3)} kg CO₂`);
    e.target.reset(); document.getElementById("energy-preview").style.display = "none";
    if (window._eco.updateDashboard)   window._eco.updateDashboard();
    if (window._eco.checkAchievements) window._eco.checkAchievements();
  });
});
