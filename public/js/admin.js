import { ref, get, set, update, remove, increment, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { sendPasswordResetEmail, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function waitEco(cb, t = 0) {
  if (window._eco?.db && window._eco?.auth) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 100);
}

waitEco(() => {
  const db = window._eco.db;
  const auth = window._eco.auth;
  
  let allUsersCache = [];
  let editingUserUid = null;
  let growthChart = null;
  let emissionsChart = null;

  let inquiriesUnsub = null;
  let guestTipsUnsub = null;
  let latestInquiries = {};
  let latestGuestTips = {};

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
    { level:10, title:"Earth Guardian",   minXP:3000 }
  ];

  function getLvl(xp) {
    let lv = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.minXP) lv = l;
    return lv;
  }

  async function awardUserXP(uid, amount) {
    try {
      const profRef = ref(db, `users/${uid}/profile`);
      const snap = await get(profRef);
      if (!snap.exists()) return;
      const prof = snap.val();
      const oldXP = prof.xp || 0;
      const newXP = oldXP + amount;
      const newLv = getLvl(newXP).level;
      
      await update(profRef, { xp: newXP, level: newLv });
      
      const lbRef = ref(db, `leaderboard/${uid}`);
      const lbSnap = await get(lbRef);
      if (lbSnap.exists()) {
        await update(lbRef, { level: newLv });
      }
      
      // Update local admin cache if present
      const idx = allUsersCache.findIndex(u => u.uid === uid);
      if (idx !== -1) {
        allUsersCache[idx].xp = newXP;
        allUsersCache[idx].level = newLv;
        renderUserTable(allUsersCache);
      }
      
      console.log(`[Admin] Awarded ${amount} XP to user ${uid}. New XP: ${newXP}, New Level: ${newLv}`);
    } catch (err) {
      console.error(`[Admin] Failed to award XP to user ${uid}:`, err);
    }
  }

  function updateBadgeElement(id, count, isDot = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count;
      el.style.display = "inline-flex";
    } else {
      el.style.display = "none";
    }
  }

  function updateNotificationBadges() {
    let pendingInquiriesCount = 0;
    if (latestInquiries) {
      Object.values(latestInquiries).forEach(i => {
        if (i && i.status !== "resolved") {
          pendingInquiriesCount++;
        }
      });
    }

    let pendingTipsCount = 0;
    if (latestGuestTips) {
      Object.values(latestGuestTips).forEach(t => {
        if (t && t.status !== "approved") {
          pendingTipsCount++;
        }
      });
    }

    const totalPending = pendingInquiriesCount + pendingTipsCount;

    updateBadgeElement("nav-admin-badge", totalPending, true);
    updateBadgeElement("mn-admin-badge", totalPending, true);

    updateBadgeElement("admin-inquiries-badge", pendingInquiriesCount, false);
    updateBadgeElement("admin-tips-badge", pendingTipsCount, false);
  }

  function setupAdminNotificationListeners() {
    clearAdminNotificationListeners();

    inquiriesUnsub = onValue(ref(db, "inquiries"), (snap) => {
      latestInquiries = snap.exists() ? snap.val() : {};
      updateNotificationBadges();
      const adminPage = document.getElementById("admin");
      if (adminPage && adminPage.classList.contains("active")) {
        renderInquiriesList();
      }
    }, (err) => {
      console.error("Inquiries real-time listener failed:", err);
    });

    guestTipsUnsub = onValue(ref(db, "guestTips"), (snap) => {
      latestGuestTips = snap.exists() ? snap.val() : {};
      updateNotificationBadges();
      const adminPage = document.getElementById("admin");
      if (adminPage && adminPage.classList.contains("active")) {
        renderGuestTipsList();
      }
    }, (err) => {
      console.error("Guest tips real-time listener failed:", err);
    });
  }

  function clearAdminNotificationListeners() {
    if (inquiriesUnsub) { inquiriesUnsub(); inquiriesUnsub = null; }
    if (guestTipsUnsub) { guestTipsUnsub(); guestTipsUnsub = null; }
    latestInquiries = {};
    latestGuestTips = {};
    updateNotificationBadges();
  }

  window._eco = window._eco || {};
  window._eco.setupAdminNotificationListeners = setupAdminNotificationListeners;
  window._eco.clearAdminNotificationListeners = clearAdminNotificationListeners;

  // Render avatar helper
  function renderAvatar(el, photoURL, displayName) {
    if (!el) return;
    if (photoURL && (photoURL.startsWith("http") || photoURL.startsWith("data:"))) {
      el.style.backgroundImage = `url("${photoURL}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.textContent = "";
    } else if (photoURL) {
      el.style.backgroundImage = "";
      el.textContent = photoURL;
    } else {
      el.style.backgroundImage = "";
      el.textContent = displayName ? displayName.charAt(0).toUpperCase() : "U";
    }
  }

  // Load API keys
  async function loadApiKeys() {
    try {
      const keysSnap = await get(ref(db, "apiKeys"));
      if (keysSnap.exists()) {
        const keys = keysSnap.val() || {};
        const geminiInput = document.getElementById("admin-api-key-gemini");
        const chatbotInput = document.getElementById("admin-api-key-chatbot");
        const weatherInput = document.getElementById("admin-api-key-weather");
        if (geminiInput) geminiInput.value = keys.gemini || "";
        if (chatbotInput) chatbotInput.value = keys.chatbot || "";
        if (weatherInput) weatherInput.value = keys.openweather || "";
      }
    } catch (e) {
      console.warn("[Admin] Failed to load API keys:", e);
    }
  }

  // Load Admin Dashboard
  async function loadAdminDashboard() {
    const user = auth.currentUser;
    if (!user) return;

    // Default view: Tab Accounts
    switchTab("users");

    // Fetch and populate lists
    await loadUsers();
    await loadInquiries();
    await loadGuestTips();
    await loadActiveBroadcast();
    await loadApiKeys();
  }

  // 1. Manage Accounts (Users)
  async function loadUsers() {
    const listContainer = document.getElementById("admin-users-list");
    if (!listContainer) return;

    listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr>`;

    try {
      const snap = await get(ref(db, "users"));
      if (!snap.exists()) {
        listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px">No users found.</td></tr>`;
        return;
      }

      const usersObj = snap.val();
      allUsersCache = [];
      let totalLevel = 0;
      let totalLogs = 0;
      let globalEmissions = { diet: 0, transport: 0, energy: 0 };

      Object.entries(usersObj).forEach(([uid, uData]) => {
        const profile = uData.profile || {};
        const dailyLogs = uData.data || {};
        const logCount = Object.keys(dailyLogs).length;
        
        totalLevel += (profile.level || 1);
        totalLogs += logCount;

        // Sum category emissions for stats chart
        Object.values(dailyLogs).forEach(day => {
          const sumCat = (cat) => {
            if (!day[cat]) return 0;
            return Object.values(day[cat]).reduce((s, v) => s + (v.co2Impact || 0), 0);
          };
          globalEmissions.diet += sumCat("diet");
          globalEmissions.transport += sumCat("transport");
          globalEmissions.energy += sumCat("energy");
        });

        allUsersCache.push({
          uid,
          name: profile.name || "Eco User",
          email: profile.email || "No Email",
          country: profile.country || "IN",
          level: profile.level || 1,
          xp: profile.xp || 0,
          photoURL: profile.photoURL || "",
          logsCount: logCount,
          dailyLogs: dailyLogs,
          joinedAt: profile.joinedAt || 0,
          isAdmin: (profile.isAdmin === true || profile.isAdmin === "true" || uData.isAdmin === true || uData.isAdmin === "true"),
          isSuspended: (profile.isSuspended === true || profile.isSuspended === "true" || uData.isSuspended === true || uData.isSuspended === "true"),
          ecoPoints: profile.ecoPoints || 0
        });
      });

      // Sort by joined date descending
      allUsersCache.sort((a, b) => b.joinedAt - a.joinedAt);

      // Render overview stats
      const avgLevel = allUsersCache.length > 0 ? (totalLevel / allUsersCache.length).toFixed(1) : "1.0";
      setText("admin-stat-users", allUsersCache.length);
      setText("admin-stat-level", `Lv.${avgLevel}`);
      setText("admin-stat-logs", totalLogs);

      renderUserTable(allUsersCache);
      initAnalyticsCharts(allUsersCache, globalEmissions);

    } catch (err) {
      console.error("Admin users load failed:", err);
      listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--error)"><i class="fas fa-exclamation-triangle"></i> Access Denied. Make sure your account has admin privileges.</td></tr>`;
    }
  }

  // Render table rows
  function renderUserTable(users) {
    const listContainer = document.getElementById("admin-users-list");
    if (!listContainer) return;

    if (users.length === 0) {
      listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px">No matching users found.</td></tr>`;
      return;
    }

    listContainer.innerHTML = users.map(u => {
      const avatarId = `admin-avatar-${u.uid}`;
      setTimeout(() => {
        const el = document.getElementById(avatarId);
        if (el) renderAvatar(el, u.photoURL, u.name);
      }, 0);

      const esc = window._eco.escapeHTML;
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
          <td style="padding:10px 8px">
            <div id="${avatarId}" class="user-avatar" style="background:linear-gradient(135deg,var(--leaf),var(--mint));color:var(--forest);font-weight:800;border-radius:50%;display:flex;align-items:center;justify-content:center">U</div>
          </td>
          <td style="padding:10px 8px;font-weight:700;color:#fff">${esc(u.name)} ${u.isAdmin ? '<span style="color:var(--mint);font-size:.65rem;border:1px solid var(--mint);padding:2px 4px;border-radius:4px;margin-left:4px">Admin</span>' : ''}</td>
          <td style="padding:10px 8px;color:var(--fog)">${esc(u.email)}</td>
          <td style="padding:10px 8px;color:#fff;font-weight:700">Lv.${u.level}</td>
          <td style="padding:10px 8px;color:var(--slate)">${u.xp} XP</td>
          <td style="padding:10px 8px;text-align:right">
            <button class="btn btn-ghost btn-sm btn-edit-user" data-uid="${u.uid}" style="padding:4px 8px;font-size:0.75rem;margin-right:4px"><i class="fas fa-edit"></i> Edit</button>
            <button class="btn btn-ghost btn-sm btn-view-history" data-uid="${u.uid}" style="padding:4px 8px;font-size:0.75rem"><i class="fas fa-history"></i> History</button>
          </td>
        </tr>
      `;
    }).join("");

    // Bind action buttons
    listContainer.querySelectorAll(".btn-edit-user").forEach(btn => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.uid));
    });
    listContainer.querySelectorAll(".btn-view-history").forEach(btn => {
      btn.addEventListener("click", () => openHistoryModal(btn.dataset.uid));
    });
  }

  // 2. Manage Inquiries 
  function renderInquiriesList() {
    const listContainer = document.getElementById("admin-inquiries-list");
    if (!listContainer) return;

    if (!latestInquiries || Object.keys(latestInquiries).length === 0) {
      listContainer.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--slate)">No contact inquiries submitted yet.</td></tr>`;
      return;
    }

    const inquiries = Object.entries(latestInquiries).map(([id, data]) => ({ id, ...data }));
    inquiries.sort((a, b) => b.timestamp - a.timestamp);

    listContainer.innerHTML = inquiries.map(i => {
      const dateStr = new Date(i.timestamp).toLocaleDateString();
      const isResolved = i.status === "resolved";
      const esc = window._eco.escapeHTML;

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
          <td style="padding:10px 8px;color:#fff;font-weight:600">
            ${esc(i.name)}<br><span style="font-size:0.72rem;color:var(--slate);font-weight:normal">${esc(i.email)}</span>
          </td>
          <td style="padding:10px 8px;color:var(--mint);font-weight:600">${esc(i.subject)}</td>
          <td style="padding:10px 8px;color:var(--fog);line-height:1.4">${esc(i.message)}</td>
          <td style="padding:10px 8px">
            <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:700;${isResolved ? 'background:rgba(82,183,136,0.15);color:var(--mint)' : 'background:rgba(230,57,70,0.15);color:var(--danger)'}">
              ${isResolved ? 'Resolved' : 'Pending'}
            </span>
          </td>
          <td style="padding:10px 8px;text-align:right;white-space:nowrap">
            ${!isResolved ? `<button class="btn btn-ghost btn-sm btn-resolve-inquiry" data-id="${i.id}" style="padding:4px 8px;font-size:0.75rem;margin-right:4px"><i class="fas fa-check"></i> Resolve</button>` : ''}
            <button class="btn btn-ghost btn-sm danger btn-delete-inquiry" data-id="${i.id}" style="padding:4px 8px;font-size:0.75rem"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    }).join("");

    // Bind buttons
    listContainer.querySelectorAll(".btn-resolve-inquiry").forEach(btn => {
      btn.addEventListener("click", () => resolveInquiry(btn.dataset.id));
    });
    listContainer.querySelectorAll(".btn-delete-inquiry").forEach(btn => {
      btn.addEventListener("click", () => deleteInquiry(btn.dataset.id));
    });
  }

  async function loadInquiries() {
    renderInquiriesList();
  }

  async function resolveInquiry(id) {
    try {
      await update(ref(db, `inquiries/${id}`), { status: "resolved" });
      window._eco.showToast("Inquiry marked as resolved ✓");
    } catch (e) {
      window._eco.showToast("Action failed", true);
    }
  }

  async function deleteInquiry(id) {
    if (!confirm("Are you sure you want to delete this inquiry?")) return;
    try {
      await remove(ref(db, `inquiries/${id}`));
      window._eco.showToast("Inquiry deleted");
    } catch (e) {
      window._eco.showToast("Action failed", true);
    }
  }

  // 3. Manage Guest Eco Tips
  function renderGuestTipsList() {
    const listContainer = document.getElementById("admin-tips-list");
    if (!listContainer) return;

    if (!latestGuestTips || Object.keys(latestGuestTips).length === 0) {
      listContainer.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--slate)">No guest eco tips submitted yet.</td></tr>`;
      return;
    }

    const tips = Object.entries(latestGuestTips).map(([id, data]) => ({ id, ...data }));
    tips.sort((a, b) => b.timestamp - a.timestamp);

    listContainer.innerHTML = tips.map(t => {
      const isApproved = t.status === "approved";
      const esc = window._eco.escapeHTML;

      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
          <td style="padding:10px 8px;color:#fff;font-weight:600">${esc(t.name)}</td>
          <td style="padding:10px 8px;color:var(--fog);line-height:1.4">"${esc(t.tip)}"</td>
          <td style="padding:10px 8px">
            <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:700;${isApproved ? 'background:rgba(82,183,136,0.15);color:var(--mint)' : 'background:rgba(255,255,255,0.07);color:var(--slate)'}">
              ${isApproved ? 'Approved' : 'Pending'}
            </span>
          </td>
          <td style="padding:10px 8px;text-align:right;white-space:nowrap">
            ${!isApproved ? `<button class="btn btn-ghost btn-sm btn-approve-tip" data-id="${t.id}" style="padding:4px 8px;font-size:0.75rem;margin-right:4px"><i class="fas fa-thumbs-up"></i> Approve</button>` : ''}
            <button class="btn btn-ghost btn-sm danger btn-delete-tip" data-id="${t.id}" style="padding:4px 8px;font-size:0.75rem"><i class="fas fa-trash-alt"></i></button>
          </td>
        </tr>
      `;
    }).join("");

    // Bind buttons
    listContainer.querySelectorAll(".btn-approve-tip").forEach(btn => {
      btn.addEventListener("click", () => approveTip(btn.dataset.id));
    });
    listContainer.querySelectorAll(".btn-delete-tip").forEach(btn => {
      btn.addEventListener("click", () => deleteTip(btn.dataset.id));
    });
  }

  async function loadGuestTips() {
    renderGuestTipsList();
  }

  async function approveTip(id) {
    try {
      const tipSnap = await get(ref(db, `guestTips/${id}`));
      if (!tipSnap.exists()) {
        window._eco.showToast("Tip not found", true);
        return;
      }
      const tipData = tipSnap.val();

      await update(ref(db, `guestTips/${id}`), { status: "approved" });
      window._eco.showToast("Tip approved ✓");

      if (tipData.uid) {
        await awardUserXP(tipData.uid, 50);
      }
    } catch (e) {
      console.error("Approve tip failed:", e);
      window._eco.showToast("Action failed", true);
    }
  }

  async function deleteTip(id) {
    if (!confirm("Are you sure you want to delete this tip?")) return;
    try {
      await remove(ref(db, `guestTips/${id}`));
      window._eco.showToast("Tip deleted");
    } catch (e) {
      window._eco.showToast("Action failed", true);
    }
  }

  // 4. Analytics Charts Drawing (Chart.js)
  function initAnalyticsCharts(users, emissions) {
    const growthCanvas = document.getElementById("admin-chart-growth");
    if (growthCanvas) {
      if (growthChart) growthChart.destroy();
      
      const signupsByDate = {};
      users.forEach(u => {
        if (!u.joinedAt) return;
        const dStr = new Date(u.joinedAt).toISOString().split("T")[0];
        signupsByDate[dStr] = (signupsByDate[dStr] || 0) + 1;
      });

      const sortedDates = Object.keys(signupsByDate).sort();
      let cumulative = 0;
      const dataPoints = sortedDates.map(date => {
        cumulative += signupsByDate[date];
        return cumulative;
      });

      growthChart = new Chart(growthCanvas, {
        type: "line",
        data: {
          labels: sortedDates.map(d => d.substring(5)),
          datasets: [{
            label: "Total Accounts",
            data: dataPoints,
            borderColor: "#52B788",
            backgroundColor: "rgba(82, 183, 136, 0.08)",
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#9AB5A0" } },
            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#9AB5A0", stepSize: 1 } }
          }
        }
      });
    }

    const emissionsCanvas = document.getElementById("admin-chart-emissions");
    if (emissionsCanvas) {
      if (emissionsChart) emissionsChart.destroy();

      const totalDiet = +emissions.diet.toFixed(1);
      const totalTransport = +emissions.transport.toFixed(1);
      const totalEnergy = +emissions.energy.toFixed(1);

      emissionsChart = new Chart(emissionsCanvas, {
        type: "doughnut",
        data: {
          labels: ["Diet", "Transport", "Energy"],
          datasets: [{
            data: [totalDiet, totalTransport, totalEnergy],
            backgroundColor: ["#74C69D", "#52B788", "#40916C"],
            borderWidth: 2,
            borderColor: "#060f09"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#D8E2DC", font: { size: 10 } }
            }
          }
        }
      });
    }
  }

  // 5. Master Progression Reset
  async function resetAllMembersProgression() {
    if (!confirm("⚠️ DANGER: You are about to reset the levels, XP, badges, challenges, and daily footprint logs for ALL members! This action is irreversible. Are you sure you want to proceed?")) {
      return;
    }
    if (!confirm("⚠️ FINAL WARNING: This will set level = 1, XP = 0, delete all footprint tracking data, and clear all earned badges and challenges for every user. Confirm to execute this reset.")) {
      return;
    }

    const btn = document.getElementById("admin-btn-reset-users-prog");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Resetting...`;
    }

    try {
      const snap = await get(ref(db, "users"));
      if (!snap.exists()) {
        window._eco.showToast("No users found to reset.", true);
        return;
      }

      const usersObj = snap.val();
      const updates = {};

      Object.keys(usersObj).forEach(uid => {
        updates[`users/${uid}/profile/level`] = 1;
        updates[`users/${uid}/profile/xp`] = 0;
        updates[`users/${uid}/profile/ecoPoints`] = 0;
        updates[`users/${uid}/badges`] = null;
        updates[`users/${uid}/challenges`] = null;
        updates[`users/${uid}/data`] = null;
        updates[`leaderboard/${uid}/level`] = 1;
        updates[`leaderboard/${uid}/weeklyCO2`] = 0;
      });

      await update(ref(db), updates);
      window._eco.showToast("Successfully reset all members' progression ✓");

      await loadUsers();

      if (window._eco.loadLeaderboard) {
        window._eco.loadLeaderboard();
      }
    } catch (err) {
      console.error("Progression reset failed:", err);
      window._eco.showToast("Failed to reset members progression", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-undo"></i> Reset All Members Progression`;
      }
    }
  }

  document.getElementById("admin-btn-reset-users-prog")?.addEventListener("click", resetAllMembersProgression);

  let maintenanceModeState = false;
  onValue(ref(db, "broadcast/maintenanceMode"), (snap) => {
    maintenanceModeState = snap.exists() && (snap.val() === true || snap.val() === "true");
    const statusEl = document.getElementById("admin-maintenance-status");
    if (statusEl) {
      statusEl.textContent = maintenanceModeState ? "ON" : "OFF";
      statusEl.style.color = maintenanceModeState ? "var(--danger)" : "var(--mint)";
    }
    const btn = document.getElementById("admin-btn-toggle-maintenance");
    if (btn) {
      btn.style.borderColor = maintenanceModeState ? "rgba(230,57,70,0.4)" : "rgba(255,193,7,0.4)";
      btn.style.color = maintenanceModeState ? "var(--danger)" : "#ffc107";
    }
  });

  document.getElementById("admin-btn-toggle-maintenance")?.addEventListener("click", async () => {
    const btn = document.getElementById("admin-btn-toggle-maintenance");
    if (btn) btn.disabled = true;
    try {
      const newState = !maintenanceModeState;
      await update(ref(db, "broadcast"), { maintenanceMode: newState });
      window._eco.showToast(`Maintenance Mode toggled ${newState ? "ON" : "OFF"} ✓`);
    } catch (e) {
      console.error("[Admin] Failed to toggle maintenance mode:", e);
      window._eco.showToast("Failed to toggle maintenance mode", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Accounts Modal controls
  function openEditModal(uid) {
    const u = allUsersCache.find(user => user.uid === uid);
    if (!u) return;

    editingUserUid = uid;
    document.getElementById("admin-edit-name").value = u.name;
    document.getElementById("admin-edit-country").value = u.country;
    document.getElementById("admin-edit-level").value = u.level;
    document.getElementById("admin-edit-xp").value = u.xp;
    document.getElementById("admin-edit-isadmin").checked = u.isAdmin;
    document.getElementById("admin-edit-issuspended").checked = u.isSuspended || false;

    const modal = document.getElementById("admin-edit-modal");
    if (modal) modal.style.display = "flex";
  }

  function closeEditModal() {
    const modal = document.getElementById("admin-edit-modal");
    if (modal) modal.style.display = "none";
    editingUserUid = null;
  }

  document.getElementById("admin-close-edit-btn")?.addEventListener("click", closeEditModal);
  
  // Save edits (includes Admin role toggler)
  document.getElementById("admin-save-user-btn")?.addEventListener("click", async () => {
    if (!editingUserUid) return;

    const name = document.getElementById("admin-edit-name").value.trim();
    const country = document.getElementById("admin-edit-country").value.trim().toUpperCase();
    const level = parseInt(document.getElementById("admin-edit-level").value) || 1;
    const xp = parseInt(document.getElementById("admin-edit-xp").value) || 0;
    const isAdmin = document.getElementById("admin-edit-isadmin").checked;
    const isSuspended = document.getElementById("admin-edit-issuspended").checked;

    if (!name) {
      window._eco.showToast("Name cannot be empty", true);
      return;
    }

    const btn = document.getElementById("admin-save-user-btn");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;

    try {
      const updates = { name, country, level, xp, isAdmin, isSuspended };
      await update(ref(db, `users/${editingUserUid}/profile`), updates);
      await set(ref(db, `users/${editingUserUid}/isAdmin`), isAdmin);
      
      const idx = allUsersCache.findIndex(u => u.uid === editingUserUid);
      if (idx !== -1) {
        allUsersCache[idx].name = name;
        allUsersCache[idx].country = country;
        allUsersCache[idx].level = level;
        allUsersCache[idx].xp = xp;
        allUsersCache[idx].isAdmin = isAdmin;
        allUsersCache[idx].isSuspended = isSuspended;
      }

      const lbSnap = await get(ref(db, `leaderboard/${editingUserUid}`));
      if (lbSnap.exists()) {
        await update(ref(db, `leaderboard/${editingUserUid}`), {
          name,
          level
        });
      }

      window._eco.showToast("User updated successfully ✓");
      closeEditModal();
      renderUserTable(allUsersCache);

      if (editingUserUid === auth.currentUser?.uid && window._eco.currentUser) {
        window.location.reload();
      }

    } catch (err) {
      console.error("Save edits failed:", err);
      window._eco.showToast("Failed to save changes", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });

  // Password Reset action
  document.getElementById("admin-action-reset-pw")?.addEventListener("click", async () => {
    if (!editingUserUid) return;
    const u = allUsersCache.find(user => user.uid === editingUserUid);
    if (!u) return;

    const btn = document.getElementById("admin-action-reset-pw");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sending...`;

    try {
      await sendPasswordResetEmail(auth, u.email);
      window._eco.showToast(`Password reset link sent to ${u.email} 📧`);
    } catch (err) {
      console.error("Reset password failed:", err);
      window._eco.showToast("Failed to send reset link", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-key"></i> Send Password Reset Link`;
    }
  });

  // History modal open/close
  function openHistoryModal(uid) {
    const u = allUsersCache.find(user => user.uid === uid);
    if (!u) return;

    document.getElementById("admin-history-username").textContent = u.name;
    const listContainer = document.getElementById("admin-history-list");
    if (!listContainer) return;

    const logs = u.dailyLogs;
    const logsEntries = Object.entries(logs);

    if (logsEntries.length === 0) {
      listContainer.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--slate)">No footprint logs recorded yet.</td></tr>`;
    } else {
      logsEntries.sort((a, b) => b[0].localeCompare(a[0]));

      const esc = window._eco.escapeHTML;
      listContainer.innerHTML = logsEntries.map(([date, data]) => {
        const sumCat = (cat) => {
          if (!data[cat]) return 0;
          return Object.values(data[cat]).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        };

        const diet = sumCat("diet");
        const transport = sumCat("transport");
        const energy = sumCat("energy");
        const total = +(diet + transport + energy).toFixed(2);

        return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
            <td style="padding:10px 12px;font-weight:700;color:#fff">${esc(date)}</td>
            <td style="padding:10px 12px;color:var(--fog)">${diet.toFixed(1)} kg</td>
            <td style="padding:10px 12px;color:var(--fog)">${transport.toFixed(1)} kg</td>
            <td style="padding:10px 12px;color:var(--fog)">${energy.toFixed(1)} kg</td>
            <td style="padding:10px 12px;color:var(--mint);font-weight:700">${total.toFixed(1)} kg</td>
          </tr>
        `;
      }).join("");
    }

    const modal = document.getElementById("admin-history-modal");
    if (modal) modal.style.display = "flex";
  }

  function closeHistoryModal() {
    const modal = document.getElementById("admin-history-modal");
    if (modal) modal.style.display = "none";
  }

  document.getElementById("admin-close-history-btn")?.addEventListener("click", closeHistoryModal);

  // Search filter (Users)
  document.getElementById("admin-user-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderUserTable(allUsersCache);
      return;
    }
    const filtered = allUsersCache.filter(u => 
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    renderUserTable(filtered);
  });

  // Tab switching routing
  function switchTab(viewName) {
    document.querySelectorAll(".admin-tabs button").forEach(btn => {
      btn.classList.toggle("active", btn.id === `admin-tab-${viewName}`);
    });

    document.querySelectorAll(".admin-tab-view").forEach(view => {
      view.style.display = view.id === `admin-${viewName}-view` ? "block" : "none";
    });
  }

  document.getElementById("admin-tab-users")?.addEventListener("click", () => switchTab("users"));
  document.getElementById("admin-tab-inquiries")?.addEventListener("click", () => switchTab("inquiries"));
  document.getElementById("admin-tab-tips")?.addEventListener("click", () => switchTab("tips"));
  document.getElementById("admin-tab-stats")?.addEventListener("click", () => switchTab("stats"));

  // Active Broadcast loader
  async function loadActiveBroadcast() {
    const msgInput = document.getElementById("admin-broadcast-message");
    if (!msgInput) return;
    try {
      const snap = await get(ref(db, "broadcast"));
      if (snap.exists()) {
        const data = snap.val();
        if (data && data.active === true && data.message) {
          msgInput.value = data.message;
        } else {
          msgInput.value = "";
        }
      } else {
        msgInput.value = "";
      }
    } catch (err) {
      console.error("Failed to load active broadcast:", err);
    }
  }

  // Bind Broadcast Controls
  document.getElementById("admin-btn-publish-broadcast")?.addEventListener("click", async () => {
    const msgInput = document.getElementById("admin-broadcast-message");
    if (!msgInput) return;
    const text = msgInput.value.trim();
    if (!text) {
      window._eco.showToast("Announcement message cannot be empty", true);
      return;
    }

    const btn = document.getElementById("admin-btn-publish-broadcast");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Publishing...`;

    try {
      await update(ref(db, "broadcast"), {
        message: text,
        active: true,
        timestamp: Date.now()
      });
      window._eco.showToast("Global announcement published successfully ✓");
    } catch (err) {
      console.error("Publish broadcast failed:", err);
      window._eco.showToast("Failed to publish announcement", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-paper-plane"></i> Publish Announcement`;
    }
  });

  document.getElementById("admin-btn-clear-broadcast")?.addEventListener("click", async () => {
    const btn = document.getElementById("admin-btn-clear-broadcast");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Clearing...`;

    try {
      await update(ref(db, "broadcast"), {
        active: false,
        message: "",
        timestamp: Date.now()
      });
      const msgInput = document.getElementById("admin-broadcast-message");
      if (msgInput) msgInput.value = "";
      window._eco.showToast("Announcement cleared globally ✓");
    } catch (err) {
      console.error("Clear broadcast failed:", err);
      window._eco.showToast("Failed to clear announcement", true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-times-circle"></i> Clear Active Announcement`;
    }
  });

  // CSV download helper
  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Bind Exporter Controls
  document.getElementById("admin-btn-export-users")?.addEventListener("click", () => {
    if (allUsersCache.length === 0) {
      window._eco.showToast("No user data loaded to export", true);
      return;
    }
    const headers = ["UID", "Name", "Email", "Country", "Level", "XP", "EcoPoints", "IsAdmin", "IsSuspended", "Joined Date"];
    const rows = allUsersCache.map(u => [
      u.uid,
      `"${u.name.replace(/"/g, '""')}"`,
      u.email,
      u.country,
      u.level,
      u.xp,
      u.ecoPoints || 0,
      u.isAdmin ? "TRUE" : "FALSE",
      u.isSuspended ? "TRUE" : "FALSE",
      new Date(u.joinedAt).toISOString()
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(csvContent, "ecoverse_users.csv");
    window._eco.showToast("Users CSV exported successfully ✓");
  });

  document.getElementById("admin-btn-export-inquiries")?.addEventListener("click", async () => {
    const btn = document.getElementById("admin-btn-export-inquiries");
    btn.disabled = true;
    try {
      const snap = await get(ref(db, "inquiries"));
      if (!snap.exists()) {
        window._eco.showToast("No support inquiries to export", true);
        return;
      }
      const data = snap.val();
      const headers = ["Inquiry ID", "Name", "Email", "Subject", "Message", "Status", "Submitted Date"];
      const rows = Object.entries(data).map(([id, i]) => [
        id,
        `"${(i.name || "").replace(/"/g, '""')}"`,
        i.email || "",
        `"${(i.subject || "").replace(/"/g, '""')}"`,
        `"${(i.message || "").replace(/"/g, '""')}"`,
        i.status || "pending",
        new Date(i.timestamp).toISOString()
      ]);
      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      downloadCSV(csvContent, "ecoverse_inquiries.csv");
      window._eco.showToast("Inquiries CSV exported successfully ✓");
    } catch (err) {
      console.error("Export inquiries failed:", err);
      window._eco.showToast("Export failed", true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("admin-btn-export-tips")?.addEventListener("click", async () => {
    const btn = document.getElementById("admin-btn-export-tips");
    btn.disabled = true;
    try {
      const snap = await get(ref(db, "guestTips"));
      if (!snap.exists()) {
        window._eco.showToast("No guest tips to export", true);
        return;
      }
      const data = snap.val();
      const headers = ["Tip ID", "Author", "Tip Content", "Status", "Submitted Date"];
      const rows = Object.entries(data).map(([id, t]) => [
        id,
        `"${(t.name || "").replace(/"/g, '""')}"`,
        `"${(t.tip || "").replace(/"/g, '""')}"`,
        t.status || "pending",
        new Date(t.timestamp).toISOString()
      ]);
      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      downloadCSV(csvContent, "ecoverse_guest_tips.csv");
      window._eco.showToast("Guest tips CSV exported successfully ✓");
    } catch (err) {
      console.error("Export tips failed:", err);
      window._eco.showToast("Export failed", true);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("admin-btn-save-keys")?.addEventListener("click", async () => {
    const geminiVal = document.getElementById("admin-api-key-gemini")?.value.trim();
    const chatbotVal = document.getElementById("admin-api-key-chatbot")?.value.trim();
    const weatherVal = document.getElementById("admin-api-key-weather")?.value.trim();

    const btn = document.getElementById("admin-btn-save-keys");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    }

    try {
      await update(ref(db, "apiKeys"), {
        gemini: geminiVal,
        chatbot: chatbotVal,
        openweather: weatherVal
      });
      // Clear client cache to force immediate reload of the new keys
      if (window._eco) {
        window._eco._apiKeysCache = {};
      }
      window._eco.showToast("API keys saved successfully ✓");
    } catch (e) {
      console.error("[Admin] Save API keys failed:", e);
      window._eco.showToast("Failed to save API keys", true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-save"></i> Save API Keys`;
      }
    }
  });

  // Helper
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  window._eco.loadAdminDashboard = loadAdminDashboard;

  // Robust real-time auth observer to manage admin listeners
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const snap = await get(ref(db, `users/${user.uid}/isAdmin`));
        if (snap.exists() && (snap.val() === true || snap.val() === "true")) {
          setupAdminNotificationListeners();
        } else {
          clearAdminNotificationListeners();
        }
      } catch (err) {
        console.warn("Failed to check admin status in auth observer:", err);
      }
    } else {
      clearAdminNotificationListeners();
    }
  });
});
