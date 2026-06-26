// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app = initializeApp({
  apiKey: "API-key",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
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
