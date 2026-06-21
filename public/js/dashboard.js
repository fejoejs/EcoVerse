//  Charts, dashboard update, summary, real-time global stats
import { getDayData, getWeekData, sumCat, FOOD_NAMES, TRANS_NAMES, NRG_NAMES } from "./data.js?v=1.4";
import { ref, onValue, get, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const GEMINI_MODEL = "gemini-2.5-flash";

const LEVELS = [
  { level: 1,  title: "Eco Seedling",     minXP: 0    },
  { level: 2,  title: "Green Sprout",     minXP: 50   },
  { level: 3,  title: "Leaf Keeper",      minXP: 150  },
  { level: 4,  title: "Forest Friend",    minXP: 300  },
  { level: 5,  title: "Carbon Cutter",    minXP: 500  },
  { level: 6,  title: "Eco Warrior",      minXP: 750  },
  { level: 7,  title: "Planet Protector", minXP: 1100 },
  { level: 8,  title: "Green Champion",   minXP: 1600 },
  { level: 9,  title: "Eco Legend",       minXP: 2200 },
  { level: 10, title: "Earth Guardian",   minXP: 3000 }
];

function getLvl(xp) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXP) lv = l;
  return lv;
}

function waitEco(cb, t = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 100);
}

let pie = null, line = null;

function initCharts() {
  const pc = document.getElementById("footprintChart")?.getContext("2d");
  const lc = document.getElementById("trendChart")?.getContext("2d");
  if (!pc || !lc) return;
  if (pie)  { pie.destroy();  pie  = null; }
  if (line) { line.destroy(); line = null; }

  pie = new Chart(pc, {
    type: "doughnut",
    data: { labels:["Diet","Transport","Energy"], datasets:[{ data:[0,0,0], backgroundColor:["#3d9970","#f0a500","#90e0ef"], borderWidth:0, hoverOffset:8 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:"65%", plugins:{ legend:{ position:"bottom", labels:{ color:"#3d5a46", font:{ family:"Plus Jakarta Sans", size:12 }, padding:12 } }, tooltip:{ callbacks:{ label: ctx => `${ctx.label}: ${Number(ctx.raw).toFixed(3)} kg CO₂` } } } }
  });
  line = new Chart(lc, {
    type: "line",
    data: { labels:["Day-6","Day-5","Day-4","Day-3","Day-2","Yesterday","Today"], datasets:[{ label:"Daily CO₂ (kg)", data:[0,0,0,0,0,0,0], borderColor:"#3d9970", backgroundColor:"rgba(61,153,112,0.1)", borderWidth:2.5, fill:true, tension:.42, pointBackgroundColor:"#3d9970", pointRadius:4, pointHoverRadius:7 }] },
    options: { responsive:true, maintainAspectRatio:false, scales:{ x:{ grid:{ color:"rgba(0,0,0,0.04)" }, ticks:{ color:"#3d5a46", font:{ size:11 } } }, y:{ beginAtZero:true, grid:{ color:"rgba(0,0,0,0.04)" }, ticks:{ color:"#3d5a46", font:{ size:11 } }, title:{ display:true, text:"kg CO₂", color:"#3d5a46", font:{ size:11 } } } }, plugins:{ legend:{ display:false } } }
  });
}

async function updateDashboard() {
  const user = window._eco.auth?.currentUser; if (!user) return;
  const ds       = document.getElementById("date-select")?.value || new Date().toISOString().split("T")[0];
  const dayData  = await getDayData(user.uid, ds);
  const weekData = await getWeekData(user.uid);
  const dCO2 = sumCat(dayData,"diet"), tCO2 = sumCat(dayData,"transport"), eCO2 = sumCat(dayData,"energy");
  const total = dCO2 + tCO2 + eCO2;

  // Top metrics
  setH("daily-footprint", `${total.toFixed(2)}<span>kg CO₂</span>`);
  setH("daily-savings",   `${(total*.25).toFixed(2)}<span>kg CO₂</span>`);
  setH("overall-score",   `${total.toFixed(2)}<small> kg</small>`);
  setH("diet-score",      `${dCO2.toFixed(2)}<small> kg</small>`);
  setH("transport-score", `${tCO2.toFixed(2)}<small> kg</small>`);
  setH("energy-score",    `${eCO2.toFixed(2)}<small> kg</small>`);

  // Percentages
  const dp = total > 0 ? Math.round(dCO2/total*100) : 0;
  const tp = total > 0 ? Math.round(tCO2/total*100) : 0;
  const ep = total > 0 ? Math.round(eCO2/total*100) : 0;
  setT("diet-percent", dp+"%"); setT("transport-percent", tp+"%"); setT("energy-percent", ep+"%");

  // Progress bars (goal 10 kg/day)
  setProg("overall-progress",   (total/10)*100);
  setProg("diet-progress",      (dCO2/4)*100);
  setProg("transport-progress", (tCO2/4)*100);
  setProg("energy-progress",    (eCO2/4)*100);

  // Weekly average + streak
  let wT = 0, wD = 0, streak = 0;
  const sorted = Object.keys(weekData).sort().reverse();
  for (const d of sorted) {
    const dt = sumCat(weekData[d],"diet") + sumCat(weekData[d],"transport") + sumCat(weekData[d],"energy");
    if (dt > 0) { wT += dt; wD++; streak++; } else if (d !== ds) break;
  }
  const wAvg = wD > 0 ? wT/wD : 0;
  setH("weekly-avg",  `${wAvg.toFixed(1)}<span>kg/day</span>`);
  setH("streak-days", `${streak}<span>days</span>`);
  const comp = wAvg > 0 ? Math.max(0, Math.min(100, 100-(total/wAvg)*100)) : 100;
  setT("overall-percent", Math.round(comp)+"%");

  // Activity log
  const list = document.getElementById("recent-activity");
  if (list) {
    const acts = [];
    if (dayData.diet)      Object.values(dayData.diet).forEach(e      => acts.push({ t:`🥗 ${e.amount} ${e.unit} ${FOOD_NAMES[e.foodType]||e.foodType} — ${e.co2Impact?.toFixed(3)} kg CO₂`,  ts:e.timestamp }));
    if (dayData.transport) Object.values(dayData.transport).forEach(e => acts.push({ t:`🚗 ${e.amount} ${e.unit} ${TRANS_NAMES[e.transportType]||e.transportType} — ${e.co2Impact?.toFixed(3)} kg CO₂`, ts:e.timestamp }));
    if (dayData.energy)    Object.values(dayData.energy).forEach(e    => acts.push({ t:`⚡ ${e.amount} ${e.unit} ${NRG_NAMES[e.energyType]||e.energyType} — ${e.co2Impact?.toFixed(3)} kg CO₂`,  ts:e.timestamp }));
    acts.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    list.innerHTML = acts.length
      ? acts.map(a => `<li class="activity-item"><span class="activity-dot"></span>${a.t}</li>`).join("")
      : `<li class="activity-item"><span class="activity-dot"></span>No entries yet — start logging above.</li>`;
  }

  // Sub-page numbers
  setT("diet-impact",      dCO2.toFixed(3));
  setT("transport-impact", tCO2.toFixed(3));
  setT("energy-impact",    eCO2.toFixed(3));
  setCmp("diet-comparison",      dCO2, 2.0);
  setCmp("transport-comparison", tCO2, 3.0);
  setCmp("energy-comparison",    eCO2, 2.5);

  // Charts
  if (pie) { pie.data.datasets[0].data = [dCO2, tCO2, eCO2]; pie.update(); }
  if (line) {
    const dates = Object.keys(weekData).sort();
    line.data.labels = dates.map(d => new Date(d+"T00:00:00").toLocaleDateString("en-US",{ weekday:"short" }));
    line.data.datasets[0].data = dates.map(d => (sumCat(weekData[d],"diet")+sumCat(weekData[d],"transport")+sumCat(weekData[d],"energy")).toFixed(3));
    line.update();
  }

  // Trigger recs engine
  if (window._eco.generateRecs2) window._eco.generateRecs2(dCO2, tCO2, eCO2);
  if (window._eco.publishLeaderboardEntry) window._eco.publishLeaderboardEntry();
}

async function updateSummary() {
  const user = window._eco.auth?.currentUser; if (!user) return;
  const name  = (user.displayName || user.email.split("@")[0]).split(" ")[0];
  const hr    = new Date().getHours();
  const greet = hr < 12 ? "Good Morning" : hr < 17 ? "Good Afternoon" : "Good Evening";
  setT("summary-greeting-text", `${greet}, ${name}!`);
  setT("summary-name-h", (user.displayName || name) + " 🌿");

  const snap = await get(ref(window._eco.db, `users/${user.uid}/data`));
  let totalSaved = 0, goals = 0;
  if (snap.exists()) {
    Object.values(snap.val()).forEach(dd => {
      const dt = sumCat(dd,"diet") + sumCat(dd,"transport") + sumCat(dd,"energy");
      if (dt > 0) { totalSaved += dt * .25; if (dt < 5) goals++; }
    });
  }
  const wd = await getWeekData(user.uid);
  let streak = 0;
  for (const d of Object.keys(wd).sort().reverse()) {
    const dt = sumCat(wd[d],"diet") + sumCat(wd[d],"transport") + sumCat(wd[d],"energy");
    if (dt > 0) streak++; else break;
  }
  const pSnap = await get(ref(window._eco.db, `users/${user.uid}/profile`));
  const lvl   = pSnap.exists() ? (pSnap.val().level || 1) : 1;
  setT("summary-total",  totalSaved.toFixed(1));
  setT("summary-streak", streak);
  setT("summary-goals",  goals);
  setT("summary-level",  lvl);
}

// Real-time global stats on landing page
let globalStatsUnsub = null;

function syncGlobalStats(isAuthenticated) {
  const updateUI = (s) => {
    const data = (s && typeof s === "object" && s.totalUsers > 0) ? s : {
      totalUsers: 154,
      totalCO2Tracked: 2450,
      badgesAwarded: 312
    };
    animNum("stat-users",   data.totalUsers,  0);
    animNum("stat-co2",     (data.totalCO2Tracked || 0) / 1000, 2);
    const avg = data.totalUsers > 0 ? ((data.totalCO2Tracked||0) * .25 / data.totalUsers).toFixed(1) : "0.0";
    animNum("stat-saving",  parseFloat(avg), 1);
    animNum("stat-badges",  data.badgesAwarded || 0,  0);
  };

  // 1. Initial UI population from cache or seed defaults
  try {
    const cached = localStorage.getItem("eco_global_stats");
    if (cached) {
      const s = JSON.parse(cached);
      updateUI(s);
    } else {
      updateUI({
        totalUsers: 154,
        totalCO2Tracked: 2450,
        badgesAwarded: 312
      });
    }
  } catch (_) {
    updateUI({
      totalUsers: 154,
      totalCO2Tracked: 2450,
      badgesAwarded: 312
    });
  }

  // 2. Manage the Realtime Database listener based on Auth state
  if (globalStatsUnsub) {
    globalStatsUnsub();
    globalStatsUnsub = null;
  }

  if (isAuthenticated && window._eco?.db) {
    console.log("[EcoVerse] Subscribing to globalStats database listener.");
    try {
      globalStatsUnsub = onValue(ref(window._eco.db, "globalStats"), snap => {
        const s = snap.exists() ? snap.val() : {};
        console.log("[EcoVerse] globalStats raw value from database:", s);
        try {
          localStorage.setItem("eco_global_stats", JSON.stringify(s));
        } catch (_) {}
        updateUI(s);
      }, err => {
        console.warn("[EcoVerse] globalStats database listener failed:", err.code, err.message);
      });
    } catch (e) {
      console.error("[EcoVerse] Failed to register globalStats database listener:", e);
    }
  } else {
    console.log("[EcoVerse] Guest / Logged out state. Using cached global stats.");
  }
}

function animNum(id, target, decimals) {
  const el = document.getElementById(id); if (!el) return;
  const suffixEl = el.querySelector(".stat-suffix");
  const cur = parseFloat(el.dataset.cur || "0");
  el.dataset.cur = target;
  const steps = 30, dur = 800;
  const inc = (target - cur) / steps;
  let c = cur, i = 0;

  if (el._animInterval) {
    clearInterval(el._animInterval);
  }

  el._animInterval = setInterval(() => {
    c += inc; i++;
    if (i >= steps || Math.abs(c - target) < 0.001) {
      c = target;
      clearInterval(el._animInterval);
      el._animInterval = null;
    }
    const valStr = (typeof decimals === "number" && decimals > 0) ? c.toFixed(decimals) : Math.round(c).toLocaleString();
    if (suffixEl) {
      el.innerHTML = "";
      el.appendChild(document.createTextNode(valStr));
      el.appendChild(suffixEl);
    } else {
      el.textContent = valStr;
    }
  }, dur / steps);
}

function setCmp(id, val, avg) {
  const el = document.getElementById(id); if (!el) return;
  if (val === 0) { el.textContent = "No data yet for today."; return; }
  const d = ((val - avg) / avg * 100);
  el.textContent = d > 0
    ? `${Math.abs(Math.round(d))}% above your average — consider reducing.`
    : `${Math.abs(Math.round(d))}% below your average — great job! 🌱`;
}
function setH(id, h)   { const el = document.getElementById(id); if (el) el.innerHTML  = h; }
function setT(id, t)   { const el = document.getElementById(id); if (el) el.textContent = t; }
function setProg(id, p){ const el = document.getElementById(id); if (el) el.style.width = Math.min(100, Math.max(0, p)) + "%"; }

async function openShareModal() {
  const modal = document.getElementById("share-modal");
  const copyBtn = document.getElementById("copyShareCardBtn");
  if (!modal) return;

  const user = window._eco.auth?.currentUser;
  const db = window._eco.db;
  if (!user) {
    window._eco.showToast("Please login first.", true);
    return;
  }

  try {
    // 1. Calculate total savings
    const snap = await get(ref(db, `users/${user.uid}/data`));
    let totalSaved = 0;
    if (snap.exists()) {
      Object.values(snap.val()).forEach(dd => {
        totalSaved += (sumCat(dd, "diet") + sumCat(dd, "transport") + sumCat(dd, "energy")) * 0.25;
      });
    }

    // 2. Calculate streak
    const wd = await getWeekData(user.uid);
    let streak = 0;
    for (const d of Object.keys(wd).sort().reverse()) {
      const dt = sumCat(wd[d], "diet") + sumCat(wd[d], "transport") + sumCat(wd[d], "energy");
      if (dt > 0) streak++; else break;
    }

    // 3. Get profile level
    const pSnap = await get(ref(db, `users/${user.uid}/profile`));
    const prof = pSnap.exists() ? pSnap.val() : {};
    const level = prof.level || 1;

    // 4. Calculate rank (wrapped in try-catch to prevent leaderboard permission rule failures from crashing the feature)
    let rankText = "#--";
    try {
      const lbSnap = await get(ref(db, "leaderboard"));
      if (lbSnap.exists()) {
        const entries = Object.entries(lbSnap.val()).map(([uid, e]) => ({ uid, co2: e.weeklyCO2 || 0 }));
        entries.sort((a, b) => a.co2 - b.co2); // best is lowest footprint
        const idx = entries.findIndex(e => e.uid === user.uid);
        if (idx !== -1) {
          rankText = `#${idx + 1}`;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch rank for share card:", e);
    }

    // Update modal DOM
    document.getElementById("sc-total-saved").textContent = `${totalSaved.toFixed(1)} kg`;
    document.getElementById("sc-trees-equivalent").textContent = Math.floor(totalSaved / 10);
    document.getElementById("sc-streak").textContent = `${streak} days`;
    document.getElementById("sc-level").textContent = `Lv.${level}`;
    document.getElementById("sc-rank").textContent = rankText;

    // Open modal
    modal.style.display = "flex";

    // Setup copy button link
    copyBtn.onclick = () => {
      const shareMsg = `I saved ${totalSaved.toFixed(1)} kg of CO₂ (equivalent to planting ${Math.floor(totalSaved / 10)} trees) and achieved Level ${level} on EcoVerse! 🌍 Join me in saving the planet: https://ecoverse.web.app/invite/${user.uid}`;
      navigator.clipboard.writeText(shareMsg)
        .then(() => window._eco.showToast("Share stats copied to clipboard! 📋"))
        .catch(() => window._eco.showToast("Failed to copy share link.", true));
    };

  } catch (err) {
    console.error("Failed to generate share card:", err);
    window._eco.showToast("Could not generate share card.", true);
  }
}

function setupShareCardModal() {
  const openBtn = document.getElementById("generateShareCardBtn");
  const closeBtn = document.getElementById("closeShareModal");
  const modal = document.getElementById("share-modal");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      openShareModal();
    });
  }

  closeBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  modal?.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });

  window._eco.openShareModal = openShareModal;
}

// Daily Quiz Functions
async function loadDailyQuiz() {
  const user = window._eco.auth?.currentUser;
  if (!user) return;
  const db = window._eco.db;
  
  const loadingEl = document.getElementById("quiz-loading");
  const contentEl = document.getElementById("quiz-content");
  const completedEl = document.getElementById("quiz-completed");
  const incorrectEl = document.getElementById("quiz-incorrect");
  
  if (!loadingEl || !contentEl || !completedEl || !incorrectEl) return;
  
  // Clear any existing error messages
  const existingErr = document.getElementById("quiz-error-msg");
  if (existingErr) existingErr.remove();
  
  loadingEl.style.display = "block";
  contentEl.style.display = "none";
  completedEl.style.display = "none";
  incorrectEl.style.display = "none";
  
  const todayStr = new Date().toISOString().split("T")[0];
  
  try {
    let userCompletedDate = "";
    try {
      const userCompletedSnap = await get(ref(db, `users/${user.uid}/profile/lastQuizCompleted`));
      userCompletedDate = userCompletedSnap.exists() ? userCompletedSnap.val() : "";
    } catch (readUserErr) {
      console.warn("Failed to read user completion state from Firebase (permission denied?):", readUserErr);
    }
    
    let quizData = null;
    const localCacheStr = localStorage.getItem("eco_daily_quiz_cache");
    if (localCacheStr) {
      try {
        const localCache = JSON.parse(localCacheStr);
        if (localCache && localCache.date === todayStr) {
          quizData = localCache;
        }
      } catch (_) {}
    }
    
    if (!quizData) {
      try {
        const quizSnap = await get(ref(db, "broadcast/dailyQuiz"));
        if (quizSnap.exists()) {
          const data = quizSnap.val();
          if (data.date === todayStr) {
            quizData = data;
            localStorage.setItem("eco_daily_quiz_cache", JSON.stringify(quizData));
          }
        }
      } catch (readQuizErr) {
        console.warn("Failed to read dailyQuiz from Firebase (permission denied?):", readQuizErr);
      }
    }
    
    if (!quizData) {
      quizData = await generateDailyQuizWithGemini(todayStr);
      localStorage.setItem("eco_daily_quiz_cache", JSON.stringify(quizData));
      try {
        await set(ref(db, "broadcast/dailyQuiz"), quizData);
      } catch (writeErr) {
        console.warn("Failed to write dailyQuiz to Firebase (permission denied?):", writeErr);
      }
    }
    
    if (userCompletedDate === todayStr) {
      loadingEl.style.display = "none";
      completedEl.style.display = "block";
      const explEl = document.getElementById("quiz-explanation");
      if (explEl) {
        const esc = window._eco?.escapeHTML || (x => x);
        explEl.innerHTML = `<strong>Explanation:</strong> ${esc(quizData.explanation)}`;
      }
    } else {
      renderQuizQuestion(quizData);
    }
  } catch (err) {
    console.error("Failed to load daily quiz:", err);
    loadingEl.style.display = "none";
    
    // Render error state inside daily-quiz-card instead of loading spinner forever
    const errorEl = document.createElement("div");
    errorEl.id = "quiz-error-msg";
    errorEl.style.cssText = "text-align:center;padding:16px;color:var(--danger);font-weight:700;font-size:0.82rem;";
    errorEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> AI Quiz Service is temporarily offline: ${err.message || "unknown error"}. Please check back later!`;
    contentEl.parentNode.appendChild(errorEl);
  }
}

async function generateDailyQuizWithGemini(dateStr) {
  const systemPrompt = `You are a sustainability educator for EcoVerse. Generate a sustainability trivia/quiz question.
You MUST respond with a raw JSON object and nothing else. No markdown formatting, no backticks (e.g. do not wrap in \`\`\`json). Just the raw JSON object matching this schema:
{
  "question": "A trivia question about carbon footprints, climate change, or sustainable living.",
  "options": [
    "Option 1",
    "Option 2",
    "Option 3",
    "Option 4"
  ],
  "answerIndex": 0,
  "explanation": "A concise explanation of why that answer is correct (1-2 sentences)."
}`;

  const key = await window._eco.getApiKey("gemini", "YOUR_API_KEY");
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Generate a new sustainability daily quiz question." }] }],
      system_instruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 2000,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    })
  });
  
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.error?.message || `API error (status ${res.status})`);
  }
  const resData = await res.json();
  const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  
  let cleanText = text.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(json)?/, "");
    cleanText = cleanText.replace(/```$/, "");
    cleanText = cleanText.trim();
  }
  
  const parsed = JSON.parse(cleanText);
  if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length !== 4 || typeof parsed.answerIndex !== "number") {
    throw new Error("Invalid structure from Gemini");
  }
  
  return {
    date: dateStr,
    question: parsed.question,
    options: parsed.options,
    answerIndex: parsed.answerIndex,
    explanation: parsed.explanation || "No explanation provided."
  };
}

function renderQuizQuestion(quizData) {
  const loadingEl = document.getElementById("quiz-loading");
  const contentEl = document.getElementById("quiz-content");
  const questionEl = document.getElementById("quiz-question");
  const optionsEl = document.getElementById("quiz-options");
  const completedEl = document.getElementById("quiz-completed");
  const incorrectEl = document.getElementById("quiz-incorrect");
  
  if (!loadingEl || !contentEl || !questionEl || !optionsEl || !completedEl || !incorrectEl) return;
  
  loadingEl.style.display = "none";
  contentEl.style.display = "block";
  completedEl.style.display = "none";
  incorrectEl.style.display = "none";
  
  questionEl.textContent = quizData.question;
  const esc = window._eco?.escapeHTML || (x => x);
  optionsEl.innerHTML = quizData.options.map((opt, idx) => {
    return `<button class="btn btn-ghost quiz-option-btn" data-idx="${idx}" style="text-align:left;justify-content:flex-start;width:100%;font-size:0.85rem;padding:10px 14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)">${esc(opt)}</button>`;
  }).join("");
  
  const optionBtns = optionsEl.querySelectorAll(".quiz-option-btn");
  optionBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      optionBtns.forEach(b => b.disabled = true);
      const selectedIdx = parseInt(btn.dataset.idx);
      if (selectedIdx === quizData.answerIndex) {
        btn.style.background = "rgba(82, 183, 136, 0.2)";
        btn.style.borderColor = "var(--mint)";
        btn.style.color = "var(--mint)";
        await handleQuizCorrect(quizData);
      } else {
        btn.style.background = "rgba(230, 57, 70, 0.2)";
        btn.style.borderColor = "var(--danger)";
        btn.style.color = "var(--danger)";
        
        optionBtns[quizData.answerIndex].style.borderColor = "var(--mint)";
        optionBtns[quizData.answerIndex].style.color = "var(--mint)";
        
        setTimeout(() => {
          contentEl.style.display = "none";
          incorrectEl.style.display = "block";
        }, 1200);
      }
    });
  });
}

async function handleQuizCorrect(quizData) {
  const user = window._eco.auth?.currentUser;
  const db = window._eco.db;
  if (!user) return;
  
  const todayStr = quizData.date;
  
  try {
    if (window._eco.addXP) {
      await window._eco.addXP(user.uid, db, 10);
    } else {
      const profRef = ref(db, `users/${user.uid}/profile`);
      const snap = await get(profRef);
      if (snap.exists()) {
        const prof = snap.val();
        const oldXP = prof.xp || 0;
        const newXP = oldXP + 10;
        const newLv = getLvl(newXP).level;
        await update(profRef, { xp: newXP, level: newLv });
      }
    }
    
    const profRef = ref(db, `users/${user.uid}/profile`);
    const snap = await get(profRef);
    const prof = snap.exists() ? snap.val() : {};
    const oldEcoPoints = prof.ecoPoints || 0;
    const newEcoPoints = oldEcoPoints + 5;
    await update(profRef, { ecoPoints: newEcoPoints, lastQuizCompleted: todayStr });
    
    if (window._eco.publishLeaderboardEntry) {
      window._eco.publishLeaderboardEntry();
    }
    
    if (window._eco.checkAchievements) {
      await window._eco.checkAchievements();
    }
    
    setTimeout(() => {
      const contentEl = document.getElementById("quiz-content");
      const completedEl = document.getElementById("quiz-completed");
      const explEl = document.getElementById("quiz-explanation");
      if (contentEl && completedEl) {
        contentEl.style.display = "none";
        completedEl.style.display = "block";
        if (explEl) {
          const esc = window._eco?.escapeHTML || (x => x);
          explEl.innerHTML = `<strong>Explanation:</strong> ${esc(quizData.explanation)}`;
        }
      }
      window._eco.showToast("Correct! You earned +10 XP and +5 EcoPoints! 🧠🌱");
    }, 1200);
  } catch (err) {
    console.error("Error saving quiz rewards:", err);
  }
}

// Low-Carbon Recipe Generator
async function generateRecipe() {
  const user = window._eco.auth?.currentUser;
  if (!user) {
    window._eco.showToast("Please login first.", true);
    return;
  }
  const inputEl = document.getElementById("recipe-ingredients-input");
  const btn = document.getElementById("btn-generate-recipe");
  const outputCard = document.getElementById("recipe-output-card");
  const titleEl = document.getElementById("recipe-title");
  const savingsEl = document.getElementById("recipe-savings-badge");
  const bodyEl = document.getElementById("recipe-body");
  
  if (!inputEl || !btn || !outputCard || !titleEl || !savingsEl || !bodyEl) return;
  
  const ingredients = inputEl.value.trim();
  if (!ingredients) {
    window._eco.showToast("Please enter some ingredients.", true);
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating Recipe...`;
  inputEl.disabled = true;
  outputCard.style.display = "none";
  
  try {
    const systemPrompt = `You are a low-carbon recipe developer. Given a list of ingredients, design a healthy, plant-based recipe that uses some or all of the ingredients.
Estimate the carbon savings compared to a meat-heavy alternative (e.g. "1.2 kg CO₂ saved").
You MUST respond with a raw JSON object and nothing else. No markdown formatting, no backticks.
Schema:
{
  "title": "Recipe Title",
  "instructions": "Step-by-step instructions. Keep it concise, simple and easy to follow.",
  "savings": "Estimated CO2 savings (e.g., '1.3 kg CO₂ saved')"
}`;

    const key = await window._eco.getApiKey("gemini", "YOUR_API_KEY");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Create a plant-based recipe using these ingredients: ${ingredients}` }] }],
        system_instruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7,
          responseMimeType: "application/json"
        }
      })
    });
    
    if (!res.ok) {
      const errObj = await res.json().catch(() => ({}));
      throw new Error(errObj.error?.message || `API error (status ${res.status})`);
    }
    const resData = await res.json();
    const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");
    
    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(json)?/, "");
      cleanText = cleanText.replace(/```$/, "");
      cleanText = cleanText.trim();
    }
    
    const recipe = JSON.parse(cleanText);
    if (!recipe.title || !recipe.instructions || !recipe.savings) {
      throw new Error("Invalid structure from Gemini");
    }
    
    titleEl.textContent = recipe.title;
    savingsEl.textContent = recipe.savings;
    bodyEl.textContent = recipe.instructions;
    outputCard.style.display = "block";
    window._eco.showToast("Recipe generated successfully! 🍳🌱");
  } catch (err) {
    console.error("Gemini Recipe generation failed:", err);
    window._eco.showToast(`Recipe generation failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-magic"></i> Generate Plant-Based Recipe`;
    inputEl.disabled = false;
  }
}

waitEco(() => {
  window._eco.syncGlobalStats = syncGlobalStats;
  
  const initialAuth = !!window._eco.auth?.currentUser;
  syncGlobalStats(initialAuth);

  window._eco.updateDashboard = updateDashboard;
  window._eco.updateSummary   = updateSummary;
  window._eco.initCharts      = initCharts;
  
  window._eco.loadDailyQuiz   = loadDailyQuiz;
  window._eco.generateRecipe  = generateRecipe;
  
  // Bind Daily Quiz retry button
  document.getElementById("btn-retry-quiz")?.addEventListener("click", () => {
    loadDailyQuiz();
  });

  // Bind Recipe Generator button
  document.getElementById("btn-generate-recipe")?.addEventListener("click", () => {
    generateRecipe();
  });

  setupShareCardModal();
});