//  AI Eco-Coach powered by Google Gemini
const GEMINI_MODEL = "gemini-2.5-flash"; 

const SYSTEM_CONTEXT = `You are an expert AI Eco-Coach for EcoVerse, a carbon footprint tracking app.
Your role:
- Give concise, actionable sustainability advice (2-4 sentences per reply)
- Help users understand their carbon footprint (diet, transport, energy)
- Suggest eco-friendly alternatives and lifestyle changes
- Be encouraging, positive, and practical
- Use occasional emojis for warmth (🌱🌍♻️)
- If asked something unrelated to sustainability, gently redirect to eco topics
- Always tailor advice to be achievable for everyday people`;

const QUICK_REPLIES = [
  "How do I reduce my diet carbon footprint?",
  "Best eco-friendly transport options?",
  "How to save energy at home?",
  "What's a carbon footprint?",
  "Tips for going plastic-free?",
];

let chatHistory = []; // Keep conversation context

function waitEco(cb, tries = 0) {
  if (window._eco) cb();
  else if (tries < 40) setTimeout(() => waitEco(cb, tries + 1), 100);
}

function appendMsg(role, text, isTyping = false) {
  const msgs = document.getElementById("chatbot-messages");
  if (!msgs) return null;

  const div  = document.createElement("div");
  div.className = `chat-msg ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.textContent = role === "bot" ? "🤖" : "👤";

  const bubble = document.createElement("div");
  bubble.className = isTyping ? "chat-typing" : "chat-bubble";

  if (isTyping) {
    bubble.innerHTML = "<span></span><span></span><span></span>";
  } else {
    // Escape HTML first to prevent XSS
    const escaped = window._eco?.escapeHTML ? window._eco.escapeHTML(text) : text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Convert **bold** markdown and newlines
    bubble.innerHTML = escaped
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function addQuickReplies() {
  const msgs = document.getElementById("chatbot-messages");
  if (!msgs) return;

  const wrap = document.createElement("div");
  wrap.className = "chat-quick-replies";
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:8px 4px;";

  QUICK_REPLIES.forEach(q => {
    const btn = document.createElement("button");
    btn.textContent = q;
    btn.style.cssText = `
      padding:5px 10px; border-radius:40px; font-size:.72rem; font-weight:600;
      background:rgba(82,183,136,0.12); border:1px solid rgba(82,183,136,0.3);
      color:#2d6a4f; cursor:pointer; transition:all .2s; font-family:inherit;
    `;
    btn.addEventListener("mouseenter", () => btn.style.background = "rgba(82,183,136,0.22)");
    btn.addEventListener("mouseleave", () => btn.style.background = "rgba(82,183,136,0.12)");
    btn.addEventListener("click", () => {
      wrap.remove();
      sendMessage(q);
    });
    wrap.appendChild(btn);
  });

  // Add avatar row wrapper
  const row = document.createElement("div");
  row.className = "chat-msg bot";
  row.style.flexDirection = "column";
  row.style.gap = "6px";

  const label = document.createElement("div");
  label.style.cssText = "font-size:.72rem;color:rgba(183,201,188,.6);padding:0 4px;";
  label.textContent = "Quick questions:";

  row.appendChild(label);
  row.appendChild(wrap);
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendMessage(userText) {
  const text = (userText || document.getElementById("chatbot-input")?.value || "").trim();
  if (!text) return;

  const input = document.getElementById("chatbot-input");
  if (input) input.value = "";

  appendMsg("user", text);
  chatHistory.push({ role: "user", parts: [{ text }] });

  const typingEl = appendMsg("bot", "", true);

  try {
    const key = await window._eco.getApiKey("chatbot");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_CONTEXT }] },
      contents: chatHistory,
      generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
    };

    const res  = await fetch(geminiUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "API error");
    }

    const data   = await res.json();
    const reply  = data.candidates?.[0]?.content?.parts?.[0]?.text
      || "I'm having trouble connecting right now. Please try again! 🌱";

    chatHistory.push({ role: "model", parts: [{ text: reply }] });

    // Replace typing with real message
    if (typingEl) typingEl.remove();
    appendMsg("bot", reply);

    // Keep history to last 10 exchanges (20 messages)
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

  } catch (err) {
    console.error("[EcoVerse AI] Gemini API call failed — chatbot will use offline fallback. Reason:", err.message);
    if (typingEl) typingEl.remove();

    // Fallback offline response
    const fallback = getOfflineResponse(text);
    appendMsg("bot", fallback);
    chatHistory.push({ role: "model", parts: [{ text: fallback }] });
  }
}

// Offline fallback responses when API is unavailable
function getOfflineResponse(text) {
  const t = text.toLowerCase();
  if (t.includes("diet") || t.includes("food") || t.includes("meat"))
    return "🥗 Reducing red meat consumption is one of the biggest ways to cut your food carbon footprint. Try swapping one meal per day to plant-based options — this can save up to 0.8 kg CO₂ per day! Legumes, tofu, and seasonal vegetables are great choices.";
  if (t.includes("transport") || t.includes("car") || t.includes("travel"))
    return "🚌 Transport is often the largest part of a personal carbon footprint. Taking public transport, cycling, or walking instead of driving solo can reduce emissions by up to 80% per journey. For longer trips, trains are far better than flights!";
  if (t.includes("energy") || t.includes("electric") || t.includes("home"))
    return "⚡ Home energy use is a major source of emissions. Switch to renewable energy tariffs, unplug devices on standby, and reduce your thermostat by 1-2°C to cut heating bills by 10%. LED bulbs also use 80% less energy than traditional bulbs!";
  if (t.includes("carbon footprint") || t.includes("what is"))
    return "🌍 A carbon footprint is the total greenhouse gas emissions caused by an individual, product, or activity — measured in kg CO₂ equivalent. The average global footprint is about 4 tonnes per year, but in many countries it's much higher. Tracking yours is the first step to reducing it!";
  if (t.includes("plastic") || t.includes("recycle"))
    return "♻️ Going plastic-free starts with the big wins: reusable bags, bottles, and containers. Refuse single-use plastics, buy products with minimal packaging, and shop local to reduce transport emissions. Recycling is good, but reducing consumption is even better!";
  return "🌱 Great question! I'm currently offline, but here's a quick tip: the three biggest ways to reduce your carbon footprint are eating less meat, driving less, and switching to renewable energy. Track all three in EcoVerse to see your real impact!";
}

waitEco(() => {
  const toggle = document.getElementById("chatbot-toggle");
  const panel  = document.getElementById("chatbot-panel");
  const close  = document.getElementById("chatbot-close");
  const sendBtn = document.getElementById("chatbot-send");
  const inputEl = document.getElementById("chatbot-input");
  let opened   = false;

  toggle?.addEventListener("click", () => {
    panel?.classList.toggle("hidden");
    if (!opened) {
      opened = true;
      setTimeout(() => addQuickReplies(), 400);
    }
  });
  close?.addEventListener("click",   () => panel?.classList.add("hidden"));
  sendBtn?.addEventListener("click",  () => sendMessage());
  inputEl?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  window._eco.sendChatMessage = sendMessage;
});