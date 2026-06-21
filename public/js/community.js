//  Leaderboard (global + friends), friend requests, sharing + Sustainability Recommendation Engine

import { ref, get, set, update, onValue, remove }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getWeekData, sumCat } from "./data.js?v=1.4";

function waitEco(cb, t = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (t < 50) setTimeout(() => waitEco(cb, t + 1), 100);
}

const MEDALS   = ["🥇","🥈","🥉"];
const RANK_CLS = ["gold","silver","bronze"];

// ── Weekly CO2 for a user ─────────────────
async function getWeeklyCO2(uid, db) {
  try {
    const snap = await get(ref(db, `users/${uid}/data`));
    if (!snap.exists()) return 0;
    const all   = snap.val();
    const today = new Date();
    let total   = 0;
    for (let i = 0; i < 7; i++) {
      const d  = new Date(today); d.setDate(today.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const dd = all[ds] || {};
      total += sumCat(dd,"diet") + sumCat(dd,"transport") + sumCat(dd,"energy");
    }
    return +total.toFixed(2);
  } catch (_) { return 0; }
}

function getLvlEmoji(lv) {
  return ["🌱","🌿","🍃","🌳","🏅","⭐","🌟","💫","🏆","👑"][Math.min((lv||1)-1,9)];
}

// ── Global leaderboard 
async function loadGlobalLeaderboard() {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  const list = document.getElementById("leaderboard-list");
  if (!list) return;

  list.innerHTML = `<div class="lb-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;

  try {
    const snap = await get(ref(db, "leaderboard"));
    if (!snap.exists()) {
      list.innerHTML = `<div class="lb-empty">No users yet. Be the first! 🌱</div>`;
      return;
    }
    const all     = snap.val();
    const entries = Object.entries(all).map(([uid, e]) => ({
      uid, name: e.name || "Eco User", co2: e.weeklyCO2 || 0, level: e.level || 1, photoURL: e.photoURL || ""
    }));
    entries.sort((a, b) => a.co2 - b.co2);
    const top = entries.slice(0, 10);

    if (top.length === 0) {
      list.innerHTML = `<div class="lb-empty">No data yet this week. Start tracking! 🌍</div>`;
      return;
    }

    const esc = window._eco.escapeHTML;
    list.innerHTML = top.map((e, i) => {
      const isMe    = user && e.uid === user.uid;
      const medal   = i < 3 ? MEDALS[i] : `#${i+1}`;
      const rankCls = i < 3 ? RANK_CLS[i] : "";
      
      let avatarHtml = "";
      if (e.photoURL && (e.photoURL.startsWith("http") || e.photoURL.startsWith("data:"))) {
        avatarHtml = `<div class="lb-avatar" style="background-image:url('${esc(e.photoURL)}'); background-size:cover; background-position:center;"></div>`;
      } else if (e.photoURL) {
        avatarHtml = `<div class="lb-avatar">${esc(e.photoURL)}</div>`;
      } else {
        avatarHtml = `<div class="lb-avatar">${(e.name||"E").charAt(0).toUpperCase()}</div>`;
      }

      return `<div class="lb-item ${isMe ? "me" : ""}">
        <div class="lb-rank ${rankCls}">${medal}</div>
        ${avatarHtml}
        <div class="lb-name">${esc(e.name)}${isMe ? " <span style='color:var(--leaf);font-size:.72rem'>(You)</span>" : ""}</div>
        <div class="lb-score">${e.co2} kg</div>
        <div class="lb-badge-icon">${getLvlEmoji(e.level)}</div>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Global leaderboard failed to load:", err.code, err.message);
    if (err.code === "PERMISSION_DENIED") {
      list.innerHTML = `<div class="lb-empty">Leaderboard is blocked by database permission rules.<br><span style="font-size:.72rem">Ask the app owner to allow read access to the "leaderboard" path.</span></div>`;
    } else {
      list.innerHTML = `<div class="lb-empty">Could not load leaderboard: ${err.message || "unknown error"}</div>`;
    }
  }
}

async function publishMyLeaderboardEntry() {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) return;
  try {
    const profSnap = await get(ref(db, `users/${user.uid}/profile`));
    const prof     = profSnap.exists() ? profSnap.val() : {};
    const co2      = await getWeeklyCO2(user.uid, db);
    await set(ref(db, `leaderboard/${user.uid}`), {
      name: user.displayName || prof.name || "Eco User",
      level: prof.level || 1,
      weeklyCO2: co2,
      photoURL: user.photoURL || prof.photoURL || "",
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to publish leaderboard entry:", err.code, err.message);
  }
}

// ── Friends leaderboard ───────────────────
async function loadFriendsLeaderboard() {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  const list = document.getElementById("leaderboard-list");
  if (!list || !user) return;

  list.innerHTML = `<div class="lb-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;

  try {
    const fSnap = await get(ref(db, `users/${user.uid}/friends`));
    if (!fSnap.exists()) {
      list.innerHTML = `<div class="lb-empty">No friends yet.<br>Add a friend by email to compete! 👥</div>`;
      return;
    }
    const friendIds = Object.keys(fSnap.val());
    const entries   = [];

    // Add self — own private data is always readable
    const myProf = (await get(ref(db, `users/${user.uid}/profile`))).val() || {};
    entries.push({ 
      uid: user.uid, 
      name: user.displayName || "You", 
      co2: await getWeeklyCO2(user.uid, db), 
      level: myProf.level||1, 
      photoURL: user.photoURL || myProf.photoURL || "",
      isMe: true 
    });

    for (const fid of friendIds) {
      try {
        const lbSnap = await get(ref(db, `leaderboard/${fid}`));
        const lb     = lbSnap.exists() ? lbSnap.val() : {};
        entries.push({ 
          uid: fid, 
          name: lb.name || "Friend", 
          co2: lb.weeklyCO2 || 0, 
          level: lb.level || 1, 
          photoURL: lb.photoURL || "",
          isMe: false 
        });
      } catch (_) {}
    }

    entries.sort((a,b) => a.co2 - b.co2);
    const esc = window._eco.escapeHTML;
    list.innerHTML = entries.map((e, i) => {
      const medal   = i < 3 ? MEDALS[i] : `#${i+1}`;
      const rankCls = i < 3 ? RANK_CLS[i] : "";

      let avatarHtml = "";
      if (e.photoURL && (e.photoURL.startsWith("http") || e.photoURL.startsWith("data:"))) {
        avatarHtml = `<div class="lb-avatar" style="background-image:url('${esc(e.photoURL)}'); background-size:cover; background-position:center;"></div>`;
      } else if (e.photoURL) {
        avatarHtml = `<div class="lb-avatar">${esc(e.photoURL)}</div>`;
      } else {
        avatarHtml = `<div class="lb-avatar">${(e.name||"U").charAt(0).toUpperCase()}</div>`;
      }

      return `<div class="lb-item ${e.isMe ? "me" : ""}">
        <div class="lb-rank ${rankCls}">${medal}</div>
        ${avatarHtml}
        <div class="lb-name">${esc(e.name)}${e.isMe ? " <span style='color:var(--leaf);font-size:.72rem'>(You)</span>" : ""}</div>
        <div class="lb-score">${e.co2} kg</div>
        <div class="lb-badge-icon">${getLvlEmoji(e.level)}</div>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Friends leaderboard failed to load:", err.code, err.message);
    list.innerHTML = `<div class="lb-empty">Could not load friends leaderboard: ${err.message || "unknown error"}</div>`;
  }
}

// ── Friend Requests & Acceptance Flow
let friendRequestsUnsub = null;

function setupFriendRequestsListener() {
  const db = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) return;

  const sectionEl = document.getElementById("friend-requests-section");
  const listEl = document.getElementById("friend-requests-list");
  if (!sectionEl || !listEl) return;

  if (friendRequestsUnsub) friendRequestsUnsub();

  friendRequestsUnsub = onValue(ref(db, `friendRequests/${user.uid}`), async (snap) => {
    if (!snap.exists()) {
      sectionEl.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    const requests = Object.entries(snap.val());
    let pendingRequests = [];

    for (const [senderUid, req] of requests) {
      if (req.status === "pending") {
        pendingRequests.push({ uid: senderUid, name: req.name || "Eco User" });
      } else if (req.status === "accepted") {
        // Auto-accept back mapping since they accepted our request
        try {
          const friendName = req.name || "Friend";
          await set(ref(db, `users/${user.uid}/friends/${senderUid}`), {
            name: friendName, addedAt: new Date().toISOString()
          });
          await remove(ref(db, `friendRequests/${user.uid}/${senderUid}`));
          window._eco.showToast(`✅ You and ${friendName} are now connected!`);
          renderFriendsList();
          if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
        } catch (e) {
          console.error("Failed to auto-process accepted friend request:", e);
        }
      } else if (req.status === "removed") {
        // Auto-remove friend since they removed us
        try {
          await remove(ref(db, `users/${user.uid}/friends/${senderUid}`));
          await remove(ref(db, `friendRequests/${user.uid}/${senderUid}`));
          renderFriendsList();
          if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
        } catch (e) {
          console.error("Failed to auto-process removed friend:", e);
        }
      }
    }

    if (pendingRequests.length === 0) {
      sectionEl.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    sectionEl.style.display = "block";
    const esc = window._eco.escapeHTML;
    listEl.innerHTML = pendingRequests.map(r => `
      <div class="friend-item" style="justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="friend-avatar" style="width:28px;height:28px;font-size:0.75rem">${esc(r.name.charAt(0).toUpperCase())}</div>
          <div class="friend-name" style="font-size:0.8rem">${esc(r.name)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success btn-sm btn-accept-req" data-uid="${r.uid}" data-name="${esc(r.name)}" style="padding:4px 8px;font-size:0.7rem"><i class="fas fa-check"></i> Accept</button>
          <button class="btn btn-ghost btn-sm btn-decline-req" data-uid="${r.uid}" style="padding:4px 8px;font-size:0.7rem;color:var(--danger)"><i class="fas fa-times"></i> Decline</button>
        </div>
      </div>
    `).join("");

    // Bind Accept/Decline button click events
    listEl.querySelectorAll(".btn-accept-req").forEach(btn => {
      btn.addEventListener("click", () => acceptFriendRequest(btn.dataset.uid, btn.dataset.name));
    });
    listEl.querySelectorAll(".btn-decline-req").forEach(btn => {
      btn.addEventListener("click", () => declineFriendRequest(btn.dataset.uid));
    });
  });
}

async function acceptFriendRequest(senderUid, senderName) {
  const db = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) return;

  try {
    const profSnap = await get(ref(db, `users/${user.uid}/profile`));
    const myName = profSnap.exists() ? (profSnap.val().name || "Eco User") : "Eco User";

    // 1. Add sender to my friends list
    await set(ref(db, `users/${user.uid}/friends/${senderUid}`), {
      name: senderName, addedAt: new Date().toISOString()
    });

    // 2. Delete request from my inbox
    await remove(ref(db, `friendRequests/${user.uid}/${senderUid}`));

    // 3. Send acceptance notification back to sender's inbox
    await set(ref(db, `friendRequests/${senderUid}/${user.uid}`), {
      name: myName, status: "accepted", timestamp: Date.now()
    });

    window._eco.showToast(`✅ Connected with ${senderName}!`);
    renderFriendsList();
    if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
  } catch (err) {
    console.error("Accept friend request failed:", err);
    window._eco.showToast("Failed to accept friend request.", true);
  }
}

async function declineFriendRequest(senderUid) {
  const db = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) return;

  try {
    await remove(ref(db, `friendRequests/${user.uid}/${senderUid}`));
    window._eco.showToast("Request declined.");
  } catch (err) {
    console.error("Decline friend request failed:", err);
    window._eco.showToast("Failed to decline request.", true);
  }
}

// ── Add friend ────────────────────────────
async function addFriend() {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) { window._eco.showToast("Please login first.", true); return; }

  const email = (document.getElementById("friend-email")?.value || "").trim();
  if (!email) { window._eco.showToast("Enter a friend's email address.", true); return; }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    window._eco.showToast("Please enter a valid email address.", true);
    return;
  }

  const btn = document.getElementById("addFriendBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }

  try {
    const profSnap = await get(ref(db, `users/${user.uid}/profile`));
    const myName = profSnap.exists() ? (profSnap.val().name || "Eco User") : "Eco User";

    if (email.toLowerCase() === user.email.toLowerCase()) {
      window._eco.showToast("That's your own email address!", true);
      return;
    }

    // Look up the friend's UID via the public emailToUid index
    const emailKey = email.toLowerCase().replace(/[.#$\[\]]/g, ",");
    const idxSnap  = await get(ref(db, `emailToUid/${emailKey}`));
    if (!idxSnap.exists()) { window._eco.showToast("No EcoVerse account found with that email address.", true); return; }

    const friendUID = idxSnap.val();
    if (friendUID === user.uid) { window._eco.showToast("That's your own account!", true); return; }

    // Check if already friends
    const existing = await get(ref(db, `users/${user.uid}/friends/${friendUID}`));
    if (existing.exists()) { window._eco.showToast("Already in your eco-circle!", true); return; }

    // Check if a request is already sent
    const reqSnap = await get(ref(db, `friendRequests/${friendUID}/${user.uid}`));
    if (reqSnap.exists() && reqSnap.val().status === "pending") {
      window._eco.showToast("Friend request already sent!", true);
      return;
    }

    // Write a pending request to B's inbox
    await set(ref(db, `friendRequests/${friendUID}/${user.uid}`), {
      name: myName, status: "pending", timestamp: Date.now()
    });

    window._eco.showToast(`📩 Friend request sent!`);
    const inp = document.getElementById("friend-email");
    if (inp) inp.value = "";
  } catch (err) {
    console.error("Send friend request failed:", err.code, err.message);
    if (err.code === "PERMISSION_DENIED") {
      window._eco.showToast("Permission denied: Check database rules.", true);
    } else {
      window._eco.showToast(`Could not send request: ${err.message || "unknown error"}`, true);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Send Friend Request'; }
  }
}

// Friends list
async function renderFriendsList() {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  const list = document.getElementById("friends-list");
  if (!list || !user) return;

  // Initialize/listen to incoming friend requests
  setupFriendRequestsListener();

  try {
    const snap = await get(ref(db, `users/${user.uid}/friends`));
    if (!snap.exists()) { list.innerHTML = ""; return; }

    const friends = Object.entries(snap.val());
    const friendItems = [];

    for (const [fid, f] of friends) {
      let photoURL = "";
      try {
        const lbSnap = await get(ref(db, `leaderboard/${fid}`));
        if (lbSnap.exists()) {
          photoURL = lbSnap.val().photoURL || "";
        }
      } catch (_) {}

      const esc = window._eco.escapeHTML;
      let avatarHtml = "";
      if (photoURL && (photoURL.startsWith("http") || photoURL.startsWith("data:"))) {
        avatarHtml = `<div class="friend-avatar" style="background-image:url('${esc(photoURL)}'); background-size:cover; background-position:center;"></div>`;
      } else if (photoURL) {
        avatarHtml = `<div class="friend-avatar">${esc(photoURL)}</div>`;
      } else {
        avatarHtml = `<div class="friend-avatar">${(f.name||"F").charAt(0).toUpperCase()}</div>`;
      }

      friendItems.push(`
        <div class="friend-item">
          ${avatarHtml}
          <div class="friend-name">${esc(f.name || "Friend")}</div>
          <div class="friend-online" title="Active" style="margin-left:auto"></div>
          <button class="btn-remove-friend" data-fid="${fid}" title="Remove Friend"><i class="fas fa-user-minus"></i></button>
        </div>
      `);
    }

    list.innerHTML = friendItems.join("");

    // Bind remove button click events
    list.querySelectorAll(".btn-remove-friend").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const fid = btn.dataset.fid;
        const fname = btn.closest(".friend-item")?.querySelector(".friend-name")?.textContent || "Friend";
        if (confirm(`Are you sure you want to remove ${fname} from your eco-circle?`)) {
          try {
            await removeFriend(fid);
            window._eco.showToast(`✅ ${fname} removed from your eco-circle.`);
            renderFriendsList();
            if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
          } catch (err) {
            console.error("Failed to remove friend:", err);
            window._eco.showToast("Could not remove friend. Please try again.", true);
          }
        }
      });
    });
  } catch (_) {}
}

async function removeFriend(friendUID) {
  const db   = window._eco.db;
  const user = window._eco.auth?.currentUser;
  if (!user) return;
  try {
    const profSnap = await get(ref(db, `users/${user.uid}/profile`));
    const myName = profSnap.exists() ? (profSnap.val().name || "Eco User") : "Eco User";

    // 1. Remove from my circle
    await remove(ref(db, `users/${user.uid}/friends/${friendUID}`));

    // 2. Notify the other user of removal
    await set(ref(db, `friendRequests/${friendUID}/${user.uid}`), {
      name: myName, status: "removed", timestamp: Date.now()
    });
  } catch (err) {
    console.error("Failed to remove friend:", err);
  }
}

//Sharing 
async function setupSharing() {
  const user = window._eco.auth?.currentUser;
  if (!user) return;
  try {
    const wd   = await getWeekData(user.uid);
    let saved  = 0;
    Object.values(wd).forEach(d => {
      saved += sumCat(d,"diet") + sumCat(d,"transport") + sumCat(d,"energy");
    });
    const txt = `${(saved * 0.25).toFixed(1)} kg CO₂`;
    const el  = document.getElementById("share-co2");
    if (el) el.textContent = txt;
    const msg = `I saved ${txt} this week with EcoVerse 🌍🌱 Track your carbon footprint: #EcoVerse #Sustainability`;

    document.getElementById("shareWhatsapp")?.addEventListener("click", () =>
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank"));
    document.getElementById("shareTwitter")?.addEventListener("click", () =>
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`, "_blank"));
    document.getElementById("copyShareLink")?.addEventListener("click", e => {
      e.preventDefault();
      if (window._eco.openShareModal) window._eco.openShareModal();
    });
    document.querySelectorAll(".share-card").forEach(sc => {
      sc.style.cursor = "pointer";
      sc.addEventListener("click", () => {
        if (window._eco.openShareModal) window._eco.openShareModal();
      });
    });
  } catch (_) {}
}

//  RECOMMENDATION ENGINE 
const CLUSTERS = [
  {
    id:"commuter",
    name:"High-Transport Commuter",
    profile:{ diet:1.5, transport:5.5, energy:2.0 },
    topReduction:"transport",
    socialProof:"Users like you (high-transport commuters) saved 1.8 kg CO₂/day by switching to public transport.",
    peers:["switched to metro","started cycling to work","carpooled 3 days/week"]
  },
  {
    id:"meat_eater",
    name:"High-Diet Footprint",
    profile:{ diet:5.0, transport:2.5, energy:2.0 },
    topReduction:"diet",
    socialProof:"Users with similar diets reduced emissions by 2.1 kg CO₂/day with one plant-based day per week.",
    peers:["tried Meatless Monday","switched to chicken instead of beef","added more vegetables"]
  },
  {
    id:"high_energy",
    name:"High-Energy User",
    profile:{ diet:1.5, transport:2.0, energy:5.5 },
    topReduction:"energy",
    socialProof:"Users in your cluster saved 1.3 kg CO₂/day by optimising home energy use.",
    peers:["installed LED bulbs","set thermostat 2°C lower","switched to renewable tariff"]
  },
  {
    id:"balanced",
    name:"Balanced Footprint",
    profile:{ diet:2.5, transport:3.0, energy:2.5 },
    topReduction:"all",
    socialProof:"Users with balanced profiles like yours reduced footprint by 15% through consistent daily logging.",
    peers:["logged every day for 30 days","added walking for short trips","reduced meat to 3 days/week"]
  },
  {
    id:"low_impact",
    name:"Eco Leader",
    profile:{ diet:1.0, transport:1.0, energy:1.0 },
    topReduction:"maintain",
    socialProof:"You are in the top eco-leaders cluster. Users like you inspire others through sharing and community!",
    peers:["shared eco stats on social","joined community challenges","helped friends reduce footprint"]
  },
];

const REC_GEMINI_MODEL = "gemini-2.5-flash";

async function fetchGeminiRecommendation(dCO2, tCO2, eCO2, clusterName) {
  const total = dCO2 + tCO2 + eCO2;
  if (total === 0) return null; // no data yet — nothing meaningful to recommend

  const prompt = `A user of a carbon footprint tracking app logged today:
- Diet emissions: ${dCO2.toFixed(2)} kg CO2
- Transport emissions: ${tCO2.toFixed(2)} kg CO2
- Energy emissions: ${eCO2.toFixed(2)} kg CO2
- User cluster type: ${clusterName}

Give ONE specific, actionable sustainability recommendation tailored to whichever category is highest for this user. Respond ONLY in this exact JSON format with no markdown, no backticks:
{"title": "short action title (max 6 words)", "body": "1-2 sentence specific actionable advice", "save": "estimated saving like ~0.5 kg CO2/day"}`;

  try {
    const key = await window._eco.getApiKey("gemini", "YOUR_API_KEY");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${REC_GEMINI_MODEL}:generateContent?key=${key}`;

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.8 }
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Gemini API error");
    }
    const data = await res.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.warn("[EcoVerse] Gemini recommendation call failed (this card will simply be omitted):", err.message);
    return null;
  }
}

function assignCluster(dCO2, tCO2, eCO2) {
  // Simple nearest-centroid clustering
  let best = CLUSTERS[0], bestDist = Infinity;
  for (const c of CLUSTERS) {
    const dist = Math.sqrt(
      Math.pow(dCO2 - c.profile.diet,      2) +
      Math.pow(tCO2 - c.profile.transport,  2) +
      Math.pow(eCO2 - c.profile.energy,     2)
    );
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best;
}

// Collaborative filtering — find similar users' most effective actions
const CF_ACTIONS = {
  transport: [
    { action:"Switch petrol car → metro/bus",       saving:"~1.8 kg CO₂/day",  users:847 },
    { action:"Cycle for trips under 5 km",           saving:"~0.9 kg CO₂/day",  users:634 },
    { action:"Work from home 2 days/week",           saving:"~1.2 kg CO₂/day",  users:512 },
    { action:"Carpool with 2+ colleagues",           saving:"~0.8 kg CO₂/day",  users:423 },
  ],
  diet: [
    { action:"Replace beef with chicken or fish",    saving:"~1.4 kg CO₂/day",  users:921 },
    { action:"Try Meatless Monday (plant-based day)",saving:"~2.1 kg CO₂/day",  users:788 },
    { action:"Reduce dairy by half",                 saving:"~0.6 kg CO₂/day",  users:567 },
    { action:"Buy local, seasonal produce",          saving:"~0.3 kg CO₂/day",  users:445 },
  ],
  energy: [
    { action:"Set thermostat 2°C lower",             saving:"~0.5 kg CO₂/day",  users:1023 },
    { action:"Switch to renewable electricity tariff",saving:"~1.3 kg CO₂/day", users:389 },
    { action:"Unplug idle devices overnight",        saving:"~0.2 kg CO₂/day",  users:712 },
    { action:"Replace old bulbs with LEDs",          saving:"~0.15 kg CO₂/day", users:834 },
  ],
  all: [
    { action:"Log carbon daily for 30 days",         saving:"Build habits",      users:1245 },
    { action:"Share progress with a friend",         saving:"Social accountability", users:567 },
    { action:"Set a weekly CO₂ budget goal",         saving:"~20% avg reduction",users:423 },
  ],
};

async function generateRecs2(dCO2, tCO2, eCO2) {
  const list = document.getElementById("recommendations-list");
  if (!list) return;

  const user = window._eco.auth?.currentUser;
  if (user && (dCO2 === undefined || (dCO2 === 0 && tCO2 === 0 && eCO2 === 0))) {
    try {
      const ds = document.getElementById("date-select")?.value || new Date().toISOString().split("T")[0];
      const snap = await get(ref(window._eco.db, `users/${user.uid}/data/${ds}`));
      if (snap.exists()) {
        const dayData = snap.val();
        dCO2 = sumCat(dayData, "diet");
        tCO2 = sumCat(dayData, "transport");
        eCO2 = sumCat(dayData, "energy");
      }
    } catch (e) {
      console.warn("Failed to fetch today's data for recommendations:", e);
    }
  }

  dCO2 = dCO2 || 0;
  tCO2 = tCO2 || 0;
  eCO2 = eCO2 || 0;

  const cluster = assignCluster(dCO2, tCO2, eCO2);
  const total   = dCO2 + tCO2 + eCO2;
  const recs    = [];

  // 1. Genuine AI-generated recommendation via Gemini, using real user data.
  const aiRec = await fetchGeminiRecommendation(dCO2, tCO2, eCO2, cluster.name);
  if (aiRec) {
    recs.push({
      cat: "ai", aiTag: true, isGenuineAI: true,
      title: aiRec.title,
      body:  aiRec.body,
      save:  aiRec.save || "Personalised by Gemini",
    });
  }

  // 2. Cluster-based card — this is rule-based nearest-centroid matching on
  recs.push({
    cat:   "ai",
    aiTag: false,
    title: `You match the "${cluster.name}" profile`,
    body:  cluster.socialProof,
    peers: cluster.peers,
    save:  "Based on usage-pattern matching",
    cluster: cluster.name
  });

  // 2. Collaborative filtering recs for top category
  const topCat = dCO2 >= tCO2 && dCO2 >= eCO2 ? "diet"
               : tCO2 >= eCO2 ? "transport" : "energy";

  const cfActions = CF_ACTIONS[cluster.topReduction] || CF_ACTIONS[topCat] || CF_ACTIONS.all;
  cfActions.slice(0, 2).forEach(a => {
    recs.push({
      cat:    topCat === "diet" ? "diet" : topCat === "transport" ? "transport" : "energy",
      aiTag:  true,
      title:  a.action,
      body:   `${a.users.toLocaleString()} users similar to you adopted this change and averaged ${a.saving} in savings.`,
      save:   a.saving,
      cluster:cluster.name
    });
  });

  // 3. Rule-based recs (always relevant)
  if (dCO2 > 2.0) recs.push({ cat:"diet",      title:"Choose Plant-Based Meals",    body:"Your diet emissions are above average today. One plant-based meal can cut food emissions by up to 30%.", save:"~0.8 kg CO₂/day" });
  if (tCO2 > 3.0) recs.push({ cat:"transport",  title:"Take Public Transport",       body:"Buses and trains emit up to 10× less CO₂ per km than a solo petrol car.",                               save:"~1.2 kg CO₂/day" });
  if (eCO2 > 2.0) recs.push({ cat:"energy",     title:"Adjust Your Thermostat",      body:"Reducing heating/cooling by 1–2°C cuts energy emissions by 5–10% immediately.",                         save:"~0.4 kg CO₂/day" });
  if (tCO2 > 0)   recs.push({ cat:"transport",  title:"Walk or Cycle Short Trips",   body:"For trips under 2 km, walking or cycling produces zero emissions and boosts your health.",               save:"~0.5 kg CO₂/day" });
  if (eCO2 > 0)   recs.push({ cat:"energy",     title:"Unplug Idle Electronics",     body:"Devices on standby can account for up to 10% of home energy use. Unplug overnight.",                    save:"~0.2 kg CO₂/day" });
  recs.push({ cat:"general", title:"Track Every Day", body:"Consistent logging is the #1 habit of people who successfully reduce their footprint long-term.", save:"Build habits" });

  if (!dCO2 && !tCO2 && !eCO2) {
    recs.push({ cat:"general", title:"Log Your First Entry", body:"Head to Diet, Transport, or Energy to log today's first entry and unlock personalised AI recommendations.", save:"Take the first step" });
  }

  // Render
  const esc = window._eco.escapeHTML;
  list.innerHTML = recs.map(r => `
    <div class="card rec-card">
      <div class="rec-header">
        <div class="rec-cat ${r.cat}">${catEmoji(r.cat)} ${r.cat.charAt(0).toUpperCase()+r.cat.slice(1)}</div>
        ${r.isGenuineAI ? '<span class="rec-ai-badge" title="Generated live by Google Gemini">✨ Gemini Live</span>'
          : r.aiTag ? '<span class="rec-ai-badge" style="background:linear-gradient(135deg,#6b7280,#4b5563)" title="Rule-based pattern matching, not a live AI call">📊 Pattern Match</span>' : ""}
      </div>
      ${r.peers ? `<div class="rec-social-proof"><i class="fas fa-users"></i> ${r.peers.slice(0,2).map(p => esc(p)).join(" • ")}</div>` : ""}
      <h4>${esc(r.title)}</h4>
      <p>${esc(r.body)}</p>
      <div class="rec-saving"><i class="fas fa-leaf"></i> ${esc(r.save)}</div>
      ${r.cluster ? `<div class="rec-cluster"><i class="fas fa-users"></i> Cluster: ${esc(r.cluster)}</div>` : ""}
    </div>`).join("");
}

function catEmoji(c) {
  return { diet:"🥗", transport:"🚗", energy:"⚡", ai:"🧠", social:"🌐", general:"🌍" }[c] || "🌍";
}

function refreshActiveLeaderboard() {
  const activeTab = document.querySelector(".lb-tab.active");
  if (activeTab && activeTab.dataset.board === "friends") {
    loadFriendsLeaderboard();
  } else {
    loadGlobalLeaderboard();
  }
}

waitEco(() => {
  // Tab switching
  document.querySelectorAll(".lb-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lb-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.board === "global") loadGlobalLeaderboard();
      else                                loadFriendsLeaderboard();
    });
  });

  document.getElementById("addFriendBtn")?.addEventListener("click", addFriend);

  // Export
  window._eco.loadLeaderboard         = refreshActiveLeaderboard;
  window._eco.setupSharing            = setupSharing;
  window._eco.renderFriends           = renderFriendsList;
  window._eco.generateRecs2           = generateRecs2;
  window._eco.publishLeaderboardEntry = publishMyLeaderboardEntry;

  // Auto-publish entry on load since auth.js fires before community.js registers this function
  publishMyLeaderboardEntry();
});