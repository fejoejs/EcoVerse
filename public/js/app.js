// routing, navigation, toast, mobile menu, particles
function waitEco(cb, t = 0) {
  if (window._eco) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 80);
}

const PROTECTED = ["dashboard","diet","transport","energy","achievements","community","environment","summary","recommendations","admin"];

// ── Page router ───────────────────────────
function showPage(id) {
  const user  = window._eco?.auth?.currentUser;
  const gated = PROTECTED.includes(id);
  if (gated && !user) { showToast("Please login to access that page.", true); id = "login-page"; }
  if ((id === "login-page" || id === "signup-page") && user) id = "summary";

  if (id === "admin" && window._eco?.isAdmin !== true) {
    showToast("Access Denied: Admin privileges required.", true);
    id = "summary";
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");

  document.querySelectorAll("#main-nav a, .mn-link").forEach(a =>
    a.classList.toggle("active", a.getAttribute("data-page") === id));

  // close panels
  document.getElementById("mobile-nav")?.classList.remove("open");
  document.getElementById("ham-btn")?.classList.remove("open");
  document.getElementById("profile-dropdown")?.classList.remove("open");
  document.getElementById("notif-panel")?.classList.add("hidden");

  // page hooks
  switch (id) {
    case "dashboard":
      if (window._eco.initCharts)      window._eco.initCharts();
      if (window._eco.updateDashboard) window._eco.updateDashboard();
      if (window._eco.loadDailyQuiz)   window._eco.loadDailyQuiz();
      break;
    case "summary":
      if (window._eco.updateSummary)   window._eco.updateSummary(); break;
    case "achievements":
      if (window._eco.checkAchievements) window._eco.checkAchievements();
      else if (window._eco.renderAchievements) window._eco.renderAchievements(); break;
    case "community":
      if (window._eco.loadLeaderboard) window._eco.loadLeaderboard();
      if (window._eco.renderFriends)   window._eco.renderFriends();
      if (window._eco.setupSharing)    window._eco.setupSharing(); break;
    case "environment":
      if (window._eco.loadEnvironmentData) window._eco.loadEnvironmentData(); break;
    case "recommendations":
      if (window._eco.generateRecs2)   window._eco.generateRecs2(0, 0, 0); break;
    case "admin":
      if (window._eco.loadAdminDashboard) window._eco.loadAdminDashboard(); break;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Toast ─────────────────────────────────
function showToast(msg, isErr = false) {
  const el = document.getElementById("toast");
  const ic = document.getElementById("toast-icon");
  const tx = document.getElementById("toast-msg");
  if (!el) return;
  tx.textContent = msg;
  ic.className   = isErr ? "fas fa-exclamation-circle" : "fas fa-check-circle";
  el.className   = "toast show" + (isErr ? " error" : "");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3800);
}

// ── Particles ─────────────────────────────
function createParticles() {
  const c = document.getElementById("particles"); if (!c) return;
  const n = window.innerWidth < 600 ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div"); p.className = "particle";
    p.style.cssText = `left:${Math.random()*100}%;width:${2+Math.random()*3}px;height:${2+Math.random()*3}px;animation-duration:${9+Math.random()*14}s;animation-delay:${Math.random()*12}s;opacity:${0.3+Math.random()*0.5}`;
    c.appendChild(p);
  }
}

// ── Profile dropdown ──────────────────────
function buildProfileDropdown() {
  document.getElementById("profile-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    document.getElementById("profile-dropdown")?.classList.toggle("open");
    document.getElementById("notif-panel")?.classList.add("hidden");
  });
  document.addEventListener("click", e => {
    const d = document.getElementById("profile-dropdown");
    if (d && !d.contains(e.target) && e.target !== document.getElementById("profile-btn"))
      d.classList.remove("open");
  });
  document.getElementById("pd-dashboard")?.addEventListener("click",     () => showPage("dashboard"));
  document.getElementById("pd-achievements")?.addEventListener("click",  () => showPage("achievements"));
  document.getElementById("pd-settings")?.addEventListener("click", () => {
    document.getElementById("profile-dropdown")?.classList.remove("open");
    openSettings();
  });
}

function openSettings() {
  const m = document.getElementById("settings-modal");
  if (m) m.style.display = "flex";
}

// ── Mobile nav ────────────────────────────
function buildMobileNav() {
  const pages = [
    ["intro","🏠 Home"],["dashboard","📊 Dashboard"],["diet","🥗 Diet"],
    ["transport","🚗 Transport"],["energy","⚡ Energy"],
    ["achievements","🏆 Achievements"],["community","🌐 Community"],
    ["environment","🌍 Live Data"],["recommendations","💡 Tips"],["admin","🛡️ Admin"],["contact","📬 Contact"]
  ];
  const nav = document.getElementById("mobile-nav"); if (!nav) return;
  pages.forEach(([page, label]) => {
    const a = document.createElement("a");
    a.href = "#"; a.className = "mn-link"; a.dataset.page = page; a.textContent = label;
    if (page === "admin") {
      a.id = "mn-admin";
      a.style.display = "none";
      a.style.position = "relative";
      const badge = document.createElement("span");
      badge.id = "mn-admin-badge";
      badge.className = "admin-nav-badge";
      badge.style.display = "none";
      badge.textContent = "0";
      a.appendChild(badge);
    }
    a.addEventListener("click", e => { e.preventDefault(); showPage(page); });
    nav.insertBefore(a, nav.querySelector(".mn-close"));
  });
  document.getElementById("ham-btn")?.addEventListener("click", () => {
    nav.classList.toggle("open");
    document.getElementById("ham-btn").classList.toggle("open");
  });
  document.getElementById("mn-close-btn")?.addEventListener("click", () => {
    nav.classList.remove("open");
    document.getElementById("ham-btn")?.classList.remove("open");
  });
}

// ── Bind nav links ────────────────────────
function bindNavLinks() {
  document.querySelectorAll("[data-page]").forEach(el => {
    if (el.classList.contains("mn-link")) return;
    el.addEventListener("click", e => {
      e.preventDefault();
      const p = el.getAttribute("data-page");
      if (p) showPage(p);
    });
  });
}

// ── Scroll animations ─────────────────────
function initScrollAnim() {
  if (!window.IntersectionObserver) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity    = "1";
        e.target.style.transform  = "translateY(0)";
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.06 });
  document.querySelectorAll(".card,.feature-card,.badge-item,.rec-card,.env-card").forEach(el => {
    el.style.opacity    = "0";
    el.style.transform  = "translateY(18px)";
    el.style.transition = "opacity .45s ease,transform .45s ease";
    obs.observe(el);
  });
}

// ── Header scroll shadow ──────────────────
function initHeaderScroll() {
  const h = document.getElementById("main-header");
  window.addEventListener("scroll", () =>
    h?.classList.toggle("scrolled", window.scrollY > 10), { passive: true });
}


// ── Settings modal ────────────────────────
function initSettingsModal() {
  document.getElementById("close-settings")?.addEventListener("click", () => {
    document.getElementById("settings-modal").style.display = "none";
  });
  document.getElementById("settings-modal")?.addEventListener("click", e => {
    if (e.target === document.getElementById("settings-modal"))
      document.getElementById("settings-modal").style.display = "none";
  });
}

waitEco(() => {
  window._eco.showPage  = showPage;
  window._eco.showToast = showToast;
  window._eco.openSettings = openSettings;

  createParticles();
  buildProfileDropdown();
  buildMobileNav();
  bindNavLinks();
  initHeaderScroll();
  initSettingsModal();
  setTimeout(initScrollAnim, 400);

  // Summary page button helpers
  document.getElementById("goToDashboard")?.addEventListener("click",    () => showPage("dashboard"));
  document.getElementById("goToAchievements")?.addEventListener("click", () => showPage("achievements"));
  document.getElementById("exploreFeatures")?.addEventListener("click",  () => showPage("recommendations"));
  document.getElementById("getStartedBtn")?.addEventListener("click",    () =>
    showPage(window._eco.auth?.currentUser ? "summary" : "login-page"));
  document.getElementById("returnHome")?.addEventListener("click",       () => showPage("intro"));

  // Extra mobile responsive CSS
  const s = document.createElement("style");
  s.textContent = `
    #main-header.scrolled{box-shadow:0 4px 30px rgba(0,0,0,.45)!important}
    @media(max-width:600px){
      .summary-actions{flex-direction:column;align-items:center}
      .summary-actions .btn{width:100%;max-width:270px}
      .footer-bottom{flex-direction:column;text-align:center}
      .community-grid{grid-template-columns:1fr}
      .contact-grid{grid-template-columns:1fr}
      .chart-row{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(s);

  // Disable right-click context menu
  document.addEventListener("contextmenu", e => e.preventDefault());

  // Disable developer tool shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U)
  document.addEventListener("keydown", e => {
    if (e.keyCode === 123) {
      e.preventDefault();
    }
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault();
    }
    if (e.ctrlKey && e.keyCode === 85) {
      e.preventDefault();
    }
  });
});
