//In-app panel + scheduled eco tips + daily reminders
function waitEco(cb, t = 0) {
  if (window._eco) cb();
  else if (t < 60) setTimeout(() => waitEco(cb, t + 1), 80);
}

let notifs = [];
try { notifs = JSON.parse(localStorage.getItem("eco_notifs") || "[]"); } catch (_) {}

function save()   { try { localStorage.setItem("eco_notifs", JSON.stringify(notifs.slice(0,30))); } catch (_) {} }
function updateBadge() {
  const badge = document.getElementById("notif-badge");
  const unread = notifs.filter(n => !n.read).length;
  if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? "flex" : "none"; }
}
function render() {
  const list = document.getElementById("notif-list"); if (!list) return;
  if (!notifs.length) { list.innerHTML = `<div class="notif-empty">No notifications yet 🌱</div>`; return; }
  const esc = window._eco?.escapeHTML || (x => x);
  list.innerHTML = notifs.slice(0,25).map((n,i) => `
    <div class="notif-item" data-i="${i}" style="${n.read?"opacity:.6":""}">
      <div class="ni-title">${esc(n.title)}</div>
      <div class="ni-body">${esc(n.body)}</div>
      <div class="ni-time">${ago(n.ts)}</div>
    </div>`).join("");
  list.querySelectorAll(".notif-item").forEach(el => {
    el.addEventListener("click", () => {
      const i = +el.dataset.i;
      if (notifs[i]) notifs[i].read = true;
      save(); updateBadge(); render();
    });
  });
}
function addNotification(title, body) {
  notifs.unshift({ title, body, ts: Date.now(), read: false });
  save(); updateBadge(); render();
}
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

const TIPS = [
  { title:"💡 Eco Tip",    body:"A plant-based diet can reduce food emissions by up to 50%!" },
  { title:"🚲 Travel Tip", body:"Cycling 5 km instead of driving saves ~0.96 kg CO₂ per trip!" },
  { title:"⚡ Energy Tip", body:"Unplugging standby devices can cut home energy use by up to 10%." },
  { title:"🌍 Fun Fact",   body:"The average person produces 4–8 tonnes of CO₂ per year." },
  { title:"♻️ Action Tip", body:"Buying local produce reduces transport emissions by up to 30%." },
  { title:"🌱 Habit Tip",  body:"Daily logging for 30 days reduces footprint by an average of 18%." },
];

function scheduleTip() {
  const KEY = "eco_last_tip", last = +localStorage.getItem(KEY)||0;
  if (Date.now() - last > 6*3600*1000) {
    const tip = TIPS[Math.floor(Math.random()*TIPS.length)];
    setTimeout(() => { addNotification(tip.title, tip.body); localStorage.setItem(KEY, Date.now()); }, 8000);
  }
}
function scheduleReminder() {
  const KEY = "eco_last_reminder", last = +localStorage.getItem(KEY)||0;
  if (Date.now() - last > 23*3600*1000 && window._eco.auth?.currentUser) {
    const today = new Date().toISOString().split("T")[0];
    import("./data.js").then(({ getDayData }) => {
      getDayData(window._eco.auth.currentUser.uid, today).then(data => {
        if (!data.diet && !data.transport && !data.energy) {
          addNotification("⏰ Daily Reminder", "You haven't logged today's carbon footprint. Keep your streak alive! 🔥");
          localStorage.setItem(KEY, Date.now());
        }
      }).catch(() => {});
    }).catch(() => {});
  }
}

waitEco(() => {
  updateBadge(); render();

  const bell  = document.getElementById("notifBtn");
  const panel = document.getElementById("notif-panel");

  bell?.addEventListener("click", e => {
    e.stopPropagation();
    panel?.classList.toggle("hidden");
    if (!panel?.classList.contains("hidden")) {
      notifs.forEach(n => n.read = true);
      save(); updateBadge(); render();
    }
  });
  document.addEventListener("click", e => {
    if (panel && !panel.contains(e.target) && e.target !== bell)
      panel?.classList.add("hidden");
  });
  document.getElementById("clearNotifs")?.addEventListener("click", () => {
    notifs = []; save(); updateBadge(); render();
  });

  scheduleTip();
  scheduleReminder();
  setInterval(scheduleTip,      60*60*1000);
  setInterval(scheduleReminder, 60*60*1000);

  window._eco.addNotification = addNotification;
});
