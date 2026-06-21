// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "ecoverse-2026.firebaseapp.com",
  databaseURL: "https://ecoverse-2026-default-rtdb.firebaseio.com",
  projectId: "ecoverse-2026",
  storageBucket: "ecoverse-2026.firebasestorage.app",
  messagingSenderId: "824254658379",
  appId: "1:824254658379:web:80f751b5aafad2d8e05ace",
  measurementId: "G-X46VD5M7E6"
});

window._eco        = window._eco || {};
window._eco.auth   = getAuth(app);
window._eco.db     = getDatabase(app);
window._eco.escapeHTML = function(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

window._eco.getApiKey = async function(name, fallback = "") {
  window._eco._apiKeysCache = window._eco._apiKeysCache || {};
  if (window._eco._apiKeysCache[name]) {
    return window._eco._apiKeysCache[name];
  }
  try {
    const snap = await get(ref(window._eco.db, `apiKeys/${name}`));
    if (snap.exists() && snap.val()) {
      window._eco._apiKeysCache[name] = snap.val();
      return snap.val();
    }
  } catch (err) {
    console.warn(`[Config] Failed to fetch API key "${name}" from database:`, err.message);
  }
  return fallback;
};
