import { ref, get, update, increment }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getDayData, getWeekData, sumCat } from "./data.js?v=1.4";

function waitEco(cb, t = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (t < 50) setTimeout(() => waitEco(cb, t + 1), 100);
}

// ── Badge definitions ─────────────────────
const BADGES = [
  { id:"first_log",     emoji:"🌱", name:"First Step",         desc:"Log your very first carbon entry",               xp:20  },
  { id:"week_streak",   emoji:"🔥", name:"7-Day Streak",       desc:"Track carbon for 7 consecutive days",            xp:100 },
  { id:"plant_meal",    emoji:"🥗", name:"Plant Powered",      desc:"Log a plant-based meal",                         xp:30  },
  { id:"cycle_hero",    emoji:"🚲", name:"Cycle Hero",         desc:"Log a bicycle journey",                          xp:40  },
  { id:"solar_user",    emoji:"☀️", name:"Solar Advocate",    desc:"Log solar energy usage",                         xp:50  },
  { id:"low_day",       emoji:"💚", name:"Green Day",          desc:"Keep total daily CO₂ below 3 kg",               xp:60  },
  { id:"ultra_low",     emoji:"🏆", name:"Eco Champion",       desc:"Keep total daily CO₂ below 1 kg",               xp:150 },
  { id:"no_car",        emoji:"🚶", name:"Car-Free Day",       desc:"Log a day with zero car transport",              xp:70  },
  { id:"month_tracker", emoji:"📅", name:"Month Master",       desc:"Track carbon for 30 total days",                 xp:200 },
  { id:"ev_user",       emoji:"⚡", name:"EV Pioneer",         desc:"Log an electric vehicle journey",                xp:45  },
  { id:"train_rider",   emoji:"🚆", name:"Rail Rider",         desc:"Log a train journey",                            xp:35  },
  { id:"renewable_nrg", emoji:"🌬", name:"Renewable Warrior",  desc:"Log wind or solar energy",                       xp:55  },
  { id:"three_cats",    emoji:"🌍", name:"Triple Tracker",     desc:"Log all 3 categories in one day",                xp:80  },
  { id:"ten_days",      emoji:"📆", name:"Dedicated",          desc:"Track carbon for 10 total days",                 xp:90  },
  { id:"walk_hero",     emoji:"👟", name:"Step Counter",       desc:"Log a walking journey",                          xp:25  },
];

const LEVELS = [
  { level:1,  title:"Eco Seedling",     minXP:0    },
  { level:2,  title:"Green Sprout",     minXP:50   },
  { level:3,  title:"Leaf Keeper",      minXP:150  },
  { level:4,  title:"Forest Friend",    minXP:300  },
  { level:5,  title:"Carbon Cutter",    minXP:500  },
  { level:6,  title:"Eco Warrior",      minXP:750  },
  { level:7,  title:"Planet Protector", minXP:1100 },
  { level:8,  title:"Green Champion",   minXP:1600 },
  { level:9,  title:"Eco Legend",       minXP:2200 },
  { level:10, title:"Earth Guardian",   minXP:3000 },
];

const CHALLENGES = [
  { id:"c1", icon:"🌿", name:"Meat-Free Day",      desc:"Log zero red meat for one day",           xp:40 },
  { id:"c2", icon:"🚴", name:"Cycle Commute",       desc:"Log a bicycle journey this week",         xp:60 },
  { id:"c3", icon:"💡", name:"Energy Saver",        desc:"Log under 2 kWh electricity today",       xp:30 },
  { id:"c4", icon:"🌍", name:"Carbon Budget Day",   desc:"Keep total below 5 kg CO₂ today",         xp:80 },
  { id:"c5", icon:"🚶", name:"Walk It",             desc:"Log a walking journey instead of driving", xp:35 },
  { id:"c6", icon:"🌱", name:"Plant-based Meal",    desc:"Log a plant-based food entry",             xp:45 },
];

// ── DB check helpers ──────────────────────
async function getAllData(uid, db) {
  const snap = await get(ref(db, `users/${uid}/data`));
  return snap.exists() ? snap.val() : {};
}
function hasAnyEntry(all) {
  return Object.values(all).some(d => d.diet || d.transport || d.energy);
}
function hasDietType(all, type) {
  return Object.values(all).some(d => d.diet && Object.values(d.diet).some(e => e.foodType === type));
}
function hasTransportType(all, type) {
  return Object.values(all).some(d => d.transport && Object.values(d.transport).some(e => e.transportType === type));
}
function hasEnergyType(all, type) {
  return Object.values(all).some(d => d.energy && Object.values(d.energy).some(e => e.energyType === type));
}
function hasLowDay(all, threshold) {
  return Object.values(all).some(d => {
    const t = sumCat(d,"diet") + sumCat(d,"transport") + sumCat(d,"energy");
    return t > 0 && t < threshold;
  });
}
function hasCarFreeDay(all) {
  return Object.values(all).some(d => {
    const hasCar = d.transport && Object.values(d.transport).some(
      e => ["car-petrol","car-diesel","car-hybrid","car-electric"].includes(e.transportType));
    return (d.diet || d.transport || d.energy) && !hasCar;
  });
}
function totalDaysTracked(all) {
  return Object.values(all).filter(d => d.diet || d.transport || d.energy).length;
}
function getStreak(all) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const dd = all[ds];
    if (dd && (dd.diet || dd.transport || dd.energy)) streak++;
    else break;
  }
  return streak;
}
function hasAllCats(all) {
  return Object.values(all).some(d => d.diet && d.transport && d.energy);
}

function hasMeatFreeDay(all) {
  return Object.values(all).some(d => {
    return d.diet && Object.values(d.diet).length > 0 && 
           !Object.values(d.diet).some(e => e.foodType === "red-meat");
  });
}

function hasEnergySaver(all) {
  return Object.values(all).some(d => {
    if (!d.energy) return false;
    const elect = Object.values(d.energy).filter(e => e.energyType === "electricity-grid");
    if (elect.length === 0) return false;
    const totalKwh = elect.reduce((s, e) => s + (e.amount || 0), 0);
    return totalKwh < 2;
  });
}

const CHALLENGE_CHECKS = {
  c1: (all) => hasMeatFreeDay(all),
  c2: (all) => hasTransportType(all,"bicycle"),
  c3: (all) => hasEnergySaver(all),
  c4: (all) => hasLowDay(all,5),
  c5: (all) => hasTransportType(all,"walking"),
  c6: (all) => hasDietType(all,"plant-based"),
};

// ── Badge unlock check map ─────────────────
const BADGE_CHECKS = {
  first_log:     (all) => hasAnyEntry(all),
  week_streak:   (all) => getStreak(all) >= 7,
  plant_meal:    (all) => hasDietType(all,"plant-based"),
  cycle_hero:    (all) => hasTransportType(all,"bicycle"),
  solar_user:    (all) => hasEnergyType(all,"solar"),
  low_day:       (all) => hasLowDay(all,3),
  ultra_low:     (all) => hasLowDay(all,1),
  no_car:        (all) => hasCarFreeDay(all),
  month_tracker: (all) => totalDaysTracked(all) >= 30,
  ev_user:       (all) => hasTransportType(all,"car-electric"),
  train_rider:   (all) => hasTransportType(all,"train"),
  renewable_nrg: (all) => hasEnergyType(all,"wind") || hasEnergyType(all,"solar"),
  three_cats:    (all) => hasAllCats(all),
  ten_days:      (all) => totalDaysTracked(all) >= 10,
  walk_hero:     (all) => hasTransportType(all,"walking"),
};

// ── XP & Level ────────────────────────────
function getLvl(xp) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXP) lv = l;
  return lv;
}
function getNextLvl(xp) {
  for (const l of LEVELS) if (xp < l.minXP) return l;
  return null;
}
async function addXP(uid, db, amount) {
  const profRef = ref(db, `users/${uid}/profile`);
  const snap    = await get(profRef);
  const prof    = snap.exists() ? snap.val() : {};
  const oldXP   = prof.xp  || 0;
  const newXP   = oldXP + amount;
  const oldLv   = getLvl(oldXP).level;
  const newLv   = getLvl(newXP).level;
  await update(profRef, { xp: newXP, level: newLv });
  if (newLv > oldLv) {
    window._eco.showToast(`🎉 Level Up! You are now ${getLvl(newXP).title} (Level ${newLv})!`);
    const badge = document.getElementById("user-level-badge");
    if (badge) badge.textContent = `Lv.${newLv}`;
  }
}

// ── Check & award badges ──────────────────
async function checkAchievements() {
  const user = window._eco.auth?.currentUser;
  const db   = window._eco.db;
  if (!user) return;

  const allData = await getAllData(user.uid, db);

  const earnedSnap = await get(ref(db, `users/${user.uid}/badges`));
  const earned     = earnedSnap.exists() ? earnedSnap.val() : {};

  for (const badge of BADGES) {
    if (earned[badge.id]) continue;
    try {
      const check   = BADGE_CHECKS[badge.id];
      const unlocked = check ? check(allData) : false;
      if (unlocked) {
        await update(ref(db, `users/${user.uid}/badges`), {
          [badge.id]: { unlockedAt: new Date().toISOString() }
        });
        await addXP(user.uid, db, badge.xp);
        try { await update(ref(db, "globalStats"), { badgesAwarded: increment(1) }); }
        catch (e) { console.error("Failed to increment badgesAwarded — check Firebase RTDB rules:", e); }
        showBadgeModal(badge);
        if (window._eco.addNotification)
          window._eco.addNotification(`🏆 Badge Unlocked: ${badge.name}`, badge.desc);
      }
    } catch (_) {}
  }

  // Check & award individual challenges
  const earnedChallengesSnap = await get(ref(db, `users/${user.uid}/challenges`));
  const earnedChallenges     = earnedChallengesSnap.exists() ? earnedChallengesSnap.val() : {};

  for (const c of CHALLENGES) {
    if (earnedChallenges[c.id]) continue;
    try {
      const check = CHALLENGE_CHECKS[c.id];
      const unlocked = check ? check(allData) : false;
      if (unlocked) {
        await update(ref(db, `users/${user.uid}/challenges`), {
          [c.id]: { unlockedAt: new Date().toISOString() }
        });
        await addXP(user.uid, db, c.xp);
        window._eco.showToast(`🏆 Challenge Completed: ${c.name}!`);
        if (window._eco.addNotification)
          window._eco.addNotification(`🏆 Challenge Completed: ${c.name}`, c.desc);
      }
    } catch (_) {}
  }

  renderAchievements();
  if (window._eco.publishLeaderboardEntry) {
    window._eco.publishLeaderboardEntry();
  }
}

function showBadgeModal(badge) {
  setText("bm-icon",  badge.emoji);
  setText("bm-title", `${badge.name} Unlocked!`);
  setText("bm-desc",  badge.desc);
  setText("bm-xp",    `+${badge.xp} XP`);
  const modal = document.getElementById("badge-modal");
  if (modal) modal.style.display = "flex";
  // Close button — also re-enables scrolling
  const closeBtn = document.getElementById("closeBadgeModal");
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = "none";
    };
  }
  // Click backdrop to close
  modal.onclick = e => { if (e.target === modal) modal.style.display = "none"; };
}

async function renderAchievements() {
  const user = window._eco.auth?.currentUser;
  const db   = window._eco.db;
  if (!user) return;

  const earnedSnap = await get(ref(db, `users/${user.uid}/badges`));
  const earned     = earnedSnap.exists() ? earnedSnap.val() : {};
  const profSnap   = await get(ref(db, `users/${user.uid}/profile`));
  const prof       = profSnap.exists() ? profSnap.val() : {};
  const xp         = prof.xp    || 0;
  const lv         = getLvl(xp);
  const nextLv     = getNextLvl(xp);

  // Level card
  setText("level-number", lv.level);
  setText("level-title",  lv.title);
  const fill = document.getElementById("level-xp-fill");
  if (nextLv) {
    const pct = Math.round((xp - lv.minXP) / (nextLv.minXP - lv.minXP) * 100);
    if (fill) fill.style.width = pct + "%";
    setText("level-xp-text", `${xp} / ${nextLv.minXP} XP`);
  } else {
    if (fill) fill.style.width = "100%";
    setText("level-xp-text", `${xp} XP — MAX LEVEL! 👑`);
  }

  // Badges grid
  const grid = document.getElementById("badges-grid");
  if (grid) {
    const unlockedBadges = BADGES.filter(b => earned[b.id]);
    const lockedBadges   = BADGES.filter(b => !earned[b.id]);
    grid.innerHTML = [...unlockedBadges, ...lockedBadges].map(b => {
      const un = !!earned[b.id];
      return `<div class="card badge-item ${un ? "unlocked" : "locked"}">
        ${un ? '<div class="badge-ribbon">Earned</div>' : ""}
        <div class="badge-emoji">${b.emoji}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
        <div class="badge-xp">${un ? "✓ " : ""}+${b.xp} XP</div>
      </div>`;
    }).join("");
  }

  // Personal badge count 
  setText("my-badge-count", `${unlockedCountSafe(earned)} / ${BADGES.length}`);

  // Challenges
  const cList = document.getElementById("challenges-list");
  if (cList) {
    const earnedChallengesSnap = await get(ref(db, `users/${user.uid}/challenges`));
    const earnedChallenges     = earnedChallengesSnap.exists() ? earnedChallengesSnap.val() : {};
    cList.innerHTML = CHALLENGES.map(c => {
      const isDone = !!earnedChallenges[c.id];
      return `
      <div class="challenge-item ${isDone ? "completed" : ""}">
        <div class="challenge-icon">${c.icon}</div>
        <div class="challenge-info">
          <div class="challenge-name">${c.name}</div>
          <div class="challenge-desc">${c.desc}</div>
          <div class="challenge-prog">${isDone ? "✔️ Completed" : "📍 In progress"}</div>
        </div>
        <div class="challenge-xp">${isDone ? "✓ " : ""}+${c.xp} XP</div>
      </div>`;
    }).join("");
  }
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function unlockedCountSafe(earned) { return Object.keys(earned || {}).length; }

waitEco(() => {
  window._eco.checkAchievements  = checkAchievements;
  window._eco.renderAchievements = renderAchievements;
  window._eco.addXP              = addXP;
});