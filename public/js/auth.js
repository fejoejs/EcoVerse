// auth.js — Firebase Auth with Google, Email/Password, Forgot PW, EmailJS
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile,
  sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, set, get, update, increment, onValue }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function waitEco(cb, t = 0) {
  if (window._eco?.auth && window._eco?.db) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 100);
}

waitEco(() => {
  const auth     = window._eco.auth;
  const db       = window._eco.db;
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  emailjs.init("VM98H-QQX_ovr2dGY");

  let broadcastUnsub = null;
  let suspensionUnsub = null;
  let isMaintenanceActive = false;
  let maintenanceUnsub = null;

  function checkMaintenanceOverlay(active) {
    const overlay = document.getElementById("maintenance-overlay");
    if (!overlay) return;
    const isAdmin = window._eco.isAdmin === true;
    if (active && !isAdmin) {
      overlay.style.display = "flex";
    } else {
      overlay.style.display = "none";
    }
  }

  function setupMaintenanceListener() {
    if (maintenanceUnsub) maintenanceUnsub();
    maintenanceUnsub = onValue(ref(db, "broadcast/maintenanceMode"), (snap) => {
      isMaintenanceActive = snap.exists() && (snap.val() === true || snap.val() === "true");
      checkMaintenanceOverlay(isMaintenanceActive);
    });
  }

  setupMaintenanceListener();

  // Bind announcement close button
  document.getElementById("announcement-close")?.addEventListener("click", () => {
    const banner = document.getElementById("global-announcement");
    const textEl = document.getElementById("announcement-text");
    if (banner && textEl) {
      sessionStorage.setItem("eco_dismissed_broadcast", textEl.textContent);
      banner.classList.remove("show");
      setTimeout(() => banner.classList.add("hidden"), 350);
    }
  });

  // Helper to render user avatars cleanly across the app
  function renderAvatarElement(el, photoURL, displayName) {
    if (!el) return;
    if (photoURL && (photoURL.startsWith("http") || photoURL.startsWith("data:"))) {
      el.style.backgroundImage = `url("${photoURL}")`;
      el.style.backgroundSize  = "cover";
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
  
  let selectedAvatar = "";

  // ── EmailJS helper ────────────────────────
  async function sendEmail(toName, toEmail, msg) {
    try {
      await emailjs.send("service_66ol554", "template_hm1cskx", {
        to_name:   toName, to_email: toEmail,
        from_name: "EcoVerse", message: msg,
        reply_to:  "support.ecoverse@gmail.com"
      });
    } catch (e) { console.warn("Email failed:", e); }
  }

  // ── Setup new user in DB ──────────────────
  async function setupUser(user, country = "IN") {
    const profRef = ref(db, `users/${user.uid}/profile`);
    const snap    = await get(profRef);
    const name    = user.displayName || user.email.split("@")[0];
    if (!snap.exists()) {
      await set(profRef, {
        name, email: user.email, photoURL: user.photoURL || "",
        country, joinedAt: Date.now(), lastLogin: Date.now(),
        xp: 0, level: 1, streak: 0, ecoPoints: 0,
        notifEmail: true, notifApp: true
      });
      try { await update(ref(db, "globalStats"), { totalUsers: increment(1) }); }
      catch (e) { console.error("Failed to increment totalUsers — check Firebase RTDB rules:", e); }
      await writeEmailIndex(user.email, user.uid);
      sendEmail(name, user.email,
        `Welcome to EcoVerse, ${name}! 🌍\n\nStart tracking your carbon footprint today and join thousands of eco-warriors making a real difference.\n\nVisit your dashboard to get started!\n\n— The EcoVerse Team`);
      return true; // new user
    } else {
      const lastLogin = snap.val().lastLogin || 0;
      const streak    = snap.val().streak    || 0;
      await update(profRef, { lastLogin: Date.now() });
      await writeEmailIndex(user.email, user.uid); // backfill for pre-existing accounts
      if (Date.now() - lastLogin > 20 * 3600 * 1000 && snap.val().notifEmail !== false) {
        sendEmail(name, user.email,
          `Hey ${name}! 🌿\n\nDon't forget to log today's carbon footprint. You're on a ${streak}-day streak — keep it going!\n\n— EcoVerse`);
      }
      return false;
    }
  }


  async function writeEmailIndex(email, uid) {
    try {
      const emailKey = email.toLowerCase().replace(/[.#$\[\]]/g, ",");
      await set(ref(db, `emailToUid/${emailKey}`), uid);
    } catch (e) { console.error("Failed to write email index — check Firebase RTDB rules:", e); }
  }

  // ── Auth state listener ───────────────────
  onAuthStateChanged(auth, async user => {
    const ov = document.getElementById("loading-overlay");
    if (ov) { ov.classList.add("hidden"); setTimeout(() => ov.style.display = "none", 600); }
    window._eco.currentUser = user;

    if (user) {
      let isNew = false;
      let prof = {};
      let isAdminTrue = false;
      try {
        isNew = await setupUser(user);
        const pSnap = await get(ref(db, `users/${user.uid}/profile`));
        if (pSnap.exists()) prof = pSnap.val();
      } catch (err) {
        console.warn("[Auth] Failed to load profile data:", err);
      }

      try {
        const adminSnap = await get(ref(db, `users/${user.uid}/isAdmin`));
        isAdminTrue = adminSnap.exists() && (adminSnap.val() === true || adminSnap.val() === "true");
        console.log(`[Auth Debug] User: ${user.email}, UID: ${user.uid}, isAdmin node exists: ${adminSnap.exists()}, val:`, adminSnap.val());
      } catch (err) {
        console.warn("[Auth] Failed to load admin status:", err);
      }

      window._eco.isAdmin = isAdminTrue;
      prof.isAdmin = isAdminTrue;
      
      checkMaintenanceOverlay(isMaintenanceActive);
      
      // Real-time suspension listener
      if (suspensionUnsub) suspensionUnsub();
      suspensionUnsub = onValue(ref(db, `users/${user.uid}/profile/isSuspended`), async snap => {
        if (snap.exists() && (snap.val() === true || snap.val() === "true")) {
          window._eco.showToast("Your account has been suspended by an administrator.", true);
          if (suspensionUnsub) { suspensionUnsub(); suspensionUnsub = null; }
          if (broadcastUnsub) { broadcastUnsub(); broadcastUnsub = null; }
          await signOut(auth);
          window.location.reload();
        }
      });

      // Real-time broadcast listener
      const banner = document.getElementById("global-announcement");
      const textEl = document.getElementById("announcement-text");
      if (banner && textEl) {
        if (broadcastUnsub) broadcastUnsub();
        broadcastUnsub = onValue(ref(db, "broadcast"), snap => {
          if (snap.exists()) {
            const data = snap.val();
            if (data && data.active === true && data.message) {
              const msg = data.message;
              const dismissed = sessionStorage.getItem("eco_dismissed_broadcast");
              if (dismissed !== msg) {
                textEl.textContent = msg;
                banner.classList.remove("hidden");
                setTimeout(() => banner.classList.add("show"), 50);
              } else {
                banner.classList.remove("show");
                banner.classList.add("hidden");
              }

              // Push new broadcast to in-app notification history
              const lastBroadcastTs = parseInt(localStorage.getItem("eco_last_broadcast_ts") || "0");
              if (data.timestamp && data.timestamp > lastBroadcastTs) {
                if (typeof window._eco.addNotification === "function") {
                  window._eco.addNotification("📢 System Announcement", msg);
                  localStorage.setItem("eco_last_broadcast_ts", data.timestamp);
                }
              }
            } else {
              banner.classList.remove("show");
              banner.classList.add("hidden");
            }
          } else {
            banner.classList.remove("show");
            banner.classList.add("hidden");
          }
        });
      }

      renderUserUI(user, prof);
      if (window._eco.isAdmin === true) {
        if (window._eco.setupAdminNotificationListeners) {
          window._eco.setupAdminNotificationListeners();
        }
        try {
          const keysSnap = await get(ref(db, "apiKeys"));
          let needsUpdate = false;
          let currentKeys = {};
          if (keysSnap.exists() && keysSnap.val()) {
            currentKeys = keysSnap.val();
          } else {
            needsUpdate = true;
          }

          const defaultGemini = "YOUR_API_KEY";
          const defaultChatbot = "YOUR_API_KEY";
          const defaultWeather = "YOUR_API_KEY";
          
          const oldBrokenGemini = "YOUR_API_KEY";

          if (!currentKeys.gemini || currentKeys.gemini === oldBrokenGemini) {
            currentKeys.gemini = defaultGemini;
            needsUpdate = true;
          }
          if (!currentKeys.chatbot) {
            currentKeys.chatbot = defaultChatbot;
            needsUpdate = true;
          }
          if (!currentKeys.openweather) {
            currentKeys.openweather = defaultWeather;
            needsUpdate = true;
          }

          if (needsUpdate) {
            await update(ref(db, "apiKeys"), currentKeys);
            console.log("[Auth] Successfully seeded/healed API keys in database.");
          }
        } catch (e) {
          console.warn("[Auth] Failed to seed API keys in database:", e);
        }
      } else {
        if (window._eco.clearAdminNotificationListeners) {
          window._eco.clearAdminNotificationListeners();
        }
      }
      if (window._eco.publishLeaderboardEntry) window._eco.publishLeaderboardEntry();
      if (window._eco.showPage)     window._eco.showPage("summary");
      if (window._eco.updateSummary) window._eco.updateSummary();
      setTodayDate();
      window._eco.showToast(isNew
        ? `Welcome, ${user.displayName || "Eco Warrior"}! 🌱 Check your email.`
        : `Welcome back, ${user.displayName || "Eco Warrior"}! 🌿`);
      if (window._eco.syncGlobalStats) window._eco.syncGlobalStats(true);
    } else {
      window._eco.isAdmin = false;
      checkMaintenanceOverlay(isMaintenanceActive);
      if (broadcastUnsub) { broadcastUnsub(); broadcastUnsub = null; }
      if (suspensionUnsub) { suspensionUnsub(); suspensionUnsub = null; }
      const banner = document.getElementById("global-announcement");
      if (banner) {
        banner.classList.remove("show");
        banner.classList.add("hidden");
      }

      if (window._eco.syncGlobalStats) window._eco.syncGlobalStats(false);
      if (window._eco.clearAdminNotificationListeners) window._eco.clearAdminNotificationListeners();
      hideUserUI();
      if (window._eco.showPage) window._eco.showPage("intro");
    }
  });

  // ── Render logged-in UI ───────────────────
  function renderUserUI(user, prof) {
    document.getElementById("auth-buttons").style.display = "none";
    document.getElementById("user-menu").style.display    = "flex";
    const name = user.displayName || user.email.split("@")[0];
    setText("profile-name-text", name);
    setText("pd-name",           name);
    setText("pd-email",          user.email);
    
    const av = document.getElementById("user-avatar");
    renderAvatarElement(av, prof.photoURL || user.photoURL, name);
    
    setText("user-level-badge", `Lv.${prof.level || 1}`);
    
    // Toggle Admin Visibility
    const navAdmin = document.getElementById("nav-admin");
    const mnAdmin = document.getElementById("mn-admin");

    const isRealAdmin = window._eco.isAdmin === true;

    if (isRealAdmin) {
      if (navAdmin) navAdmin.style.display = "inline-flex";
      if (mnAdmin) mnAdmin.style.display = "block";
    } else {
      if (navAdmin) navAdmin.style.display = "none";
      if (mnAdmin) mnAdmin.style.display = "none";
    }
    
    // Pre-fill settings
    const sdn = document.getElementById("setting-display-name");
    if (sdn) sdn.value = user.displayName || "";
    const sne = document.getElementById("setting-notif-email");
    if (sne) sne.checked = prof.notifEmail !== false;
    const sna = document.getElementById("setting-notif-app");
    if (sna) sna.checked = prof.notifApp   !== false;

    // Prefill Settings Avatar
    selectedAvatar = prof.photoURL || user.photoURL || "";
    const previewEl = document.getElementById("settings-avatar-preview");
    renderAvatarElement(previewEl, selectedAvatar, name);

    const fileInput = document.getElementById("setting-avatar-file");
    if (fileInput) fileInput.value = "";

  }
  function hideUserUI() {
    document.getElementById("auth-buttons").style.display = "flex";
    document.getElementById("user-menu").style.display    = "none";
    const navAdmin = document.getElementById("nav-admin");
    if (navAdmin) navAdmin.style.display = "none";
    const mnAdmin = document.getElementById("mn-admin");
    if (mnAdmin) mnAdmin.style.display = "none";
  }
  function setTodayDate() {
    const inp = document.getElementById("date-select");
    if (inp) inp.value = inp.max = new Date().toISOString().split("T")[0];
  }

  // ── Google Sign-In ────────────────────────
  async function googleSignIn() {
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged handles everything else
    } catch (err) {
      console.error("Google sign-in error:", err.code, err.message);
      if (err.code === "auth/popup-closed-by-user" ||
          err.code === "auth/cancelled-popup-request") {
        return; // user closed popup — not a real error, stay silent
      }
      if (err.code === "auth/unauthorized-domain") {
        const currentDomain = window.location.hostname;
        window._eco.showToast(
          `Add "${currentDomain}" to Firebase Console → Authentication → Settings → Authorized domains, then refresh and try again.`,
          true
        );
        console.error(`[EcoVerse] Google sign-in blocked. Add this exact domain to Firebase: "${currentDomain}"`);
        return;
      }
      if (err.code === "auth/popup-blocked") {
        try {
          const { signInWithRedirect } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
          await signInWithRedirect(auth, provider);
        } catch (_) {
          window._eco.showToast("Popup blocked. Please allow popups for this site.", true);
        }
        return;
      }
      window._eco.showToast(ferr(err.code) + (err.code ? "" : " (" + (err.message || "unknown error") + ")"), true);
    }
  }
  document.getElementById("googleLoginBtn")?.addEventListener("click",  googleSignIn);
  document.getElementById("googleSignupBtn")?.addEventListener("click", googleSignIn);

  // ── Email login ───────────────────────────
  document.getElementById("login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const pw    = document.getElementById("password").value;
    const btn   = e.target.querySelector("button[type=submit]");
    setLoading(btn, true, "Logging in…");
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch (err) { window._eco.showToast(ferr(err.code), true); }
    finally { setLoading(btn, false, '<i class="fas fa-sign-in-alt"></i> Login'); }
  });

  // ── Email signup ──────────────────────────
  document.getElementById("signup-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name    = document.getElementById("signup-name").value.trim();
    const email   = document.getElementById("signup-email").value.trim();
    const pw      = document.getElementById("signup-password").value;
    const country = document.getElementById("signup-country")?.value || "IN";
    const btn     = e.target.querySelector("button[type=submit]");
    setLoading(btn, true, "Creating account…");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      await updateProfile(cred.user, { displayName: name });
      await set(ref(db, `users/${cred.user.uid}/profile/country`), country);
    } catch (err) { window._eco.showToast(ferr(err.code), true); }
    finally { setLoading(btn, false, '<i class="fas fa-user-plus"></i> Create Account'); }
  });

  // ── Forgot password ───────────────────────
  document.getElementById("forgot-link")?.addEventListener("click", async e => {
    e.preventDefault();
    const emailVal = document.getElementById("email")?.value.trim();
    const email    = emailVal || prompt("Enter your registered email address:");
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      window._eco.showToast("If that email is registered, a reset link was sent. Check your inbox AND spam/junk folder 📧", false);
      console.log(`[EcoVerse] Password reset requested for: ${email}. Note: Firebase always reports success here even if no account exists with this email, as a security/privacy measure — it won't confirm or deny which emails are registered.`);
    } catch (err) { window._eco.showToast(ferr(err.code), true); }
  });

  // ── Logout ────────────────────────────────
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    hideUserUI();
    window._eco.showPage("thank-you");
    window._eco.showToast("Logged out. See you soon! 🌿");
  });

  // ── Password visibility toggles ───────────
  document.querySelectorAll(".pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.innerHTML = inp.type === "password"
        ? '<i class="fas fa-eye"></i>'
        : '<i class="fas fa-eye-slash"></i>';
    });
  });

  // ── Settings save ─────────────────────────
  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const user = auth.currentUser; if (!user) return;
    const notifEmail = document.getElementById("setting-notif-email")?.checked ?? true;
    const notifApp   = document.getElementById("setting-notif-app")?.checked   ?? true;
    const dispName   = document.getElementById("setting-display-name")?.value.trim();
    
    const profSnap = await get(ref(db, `users/${user.uid}/profile`));
    const prof     = profSnap.exists() ? profSnap.val() : {};
    const currentPhoto = prof.photoURL || user.photoURL || "";

    if (dispName && dispName !== (prof.name || user.displayName)) {
      try {
        await updateProfile(user, { displayName: dispName });
      } catch (e) { console.warn("updateProfile displayName failed:", e); }
      await update(ref(db, `users/${user.uid}/profile`), { name: dispName });
      setText("profile-name-text", dispName);
      setText("pd-name",           dispName);
    }
    
    // Save Avatar
    if (selectedAvatar !== currentPhoto) {
      if (!selectedAvatar || (!selectedAvatar.startsWith("data:") && selectedAvatar.length < 2048)) {
        try {
          await updateProfile(user, { photoURL: selectedAvatar });
        } catch (e) {
          console.warn("Failed to update auth photoURL:", e);
        }
      }
      await update(ref(db, `users/${user.uid}/profile`), { photoURL: selectedAvatar });
      
      const av = document.getElementById("user-avatar");
      renderAvatarElement(av, selectedAvatar, dispName || user.displayName || user.email.split("@")[0]);
      
      if (window._eco.publishLeaderboardEntry) {
        await window._eco.publishLeaderboardEntry();
      }
      if (document.getElementById("community")?.classList.contains("active")) {
        if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
        if (window._eco.renderFriends)   window._eco.renderFriends();
      }
    }

    await update(ref(db, `users/${user.uid}/profile`), { notifEmail, notifApp });
    window._eco.showToast("Settings saved ✓");
    document.getElementById("settings-modal").style.display = "none";
  });

  // Bind settings avatar inputs
  const initAvatarControllers = () => {
    const previewEl = document.getElementById("settings-avatar-preview");
    const fileInput = document.getElementById("setting-avatar-file");
    const removeBtn = document.getElementById("btn-remove-avatar");

    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5242880) {
        window._eco.showToast("Image too large. Please select a photo under 5 MB.", true);
        fileInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        selectedAvatar = reader.result;
        const user = auth.currentUser;
        const name = user ? (user.displayName || user.email.split("@")[0]) : "User";
        renderAvatarElement(previewEl, selectedAvatar, name);
      };
      reader.readAsDataURL(file);
    });

    removeBtn?.addEventListener("click", () => {
      selectedAvatar = "";
      if (fileInput) fileInput.value = "";
      const user = auth.currentUser;
      const name = user ? (user.displayName || user.email.split("@")[0]) : "User";
      renderAvatarElement(previewEl, "", name);
    });
  };

  initAvatarControllers();

  // ── Nav helpers ───────────────────────────
  document.getElementById("loginBtn")?.addEventListener("click",
    () => window._eco.showPage(auth.currentUser ? "summary" : "login-page"));
  document.getElementById("signupBtn")?.addEventListener("click",
    () => window._eco.showPage("signup-page"));
  document.getElementById("show-signup")?.addEventListener("click", e => {
    e.preventDefault(); window._eco.showPage("signup-page");
  });
  document.getElementById("show-login")?.addEventListener("click", e => {
    e.preventDefault(); window._eco.showPage("login-page");
  });

  // ── Helpers ───────────────────────────────
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  function setLoading(btn, on, label) { btn.disabled = on; btn.innerHTML = on ? `<i class="fas fa-spinner fa-spin"></i> ${label}` : label; }
  function ferr(code) {
    return ({
      "auth/email-already-in-use":  "That email is already registered.",
      "auth/invalid-email":         "Please enter a valid email address.",
      "auth/weak-password":         "Password must be at least 6 characters.",
      "auth/user-not-found":        "No account found with that email.",
      "auth/wrong-password":        "Incorrect password. Try again.",
      "auth/invalid-credential":    "Invalid email or password.",
      "auth/too-many-requests":     "Too many attempts. Try again later.",
      "auth/popup-blocked":         "Popup blocked. Please allow popups for this site.",
      "auth/operation-not-allowed": "Google sign-in isn't enabled for this project yet. Enable it in Firebase Console → Authentication → Sign-in method.",
      "auth/network-request-failed":"Network error. Check your internet connection and try again.",
      "auth/account-exists-with-different-credential":
                                    "An account already exists with this email. Try logging in."
    })[code] || "Something went wrong" + (code ? ` (${code})` : "") + ". Please try again.";
  }
  window._eco.googleSignIn = googleSignIn;
  window._eco.renderAvatarElement = renderAvatarElement;
});