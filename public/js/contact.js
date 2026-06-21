//  Contact form + Guest submissions via EmailJS + Firebase

import { ref, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

function waitEco(cb, tries = 0) {
  if (window._eco) cb();
  else if (tries < 40) setTimeout(() => waitEco(cb, tries + 1), 100);
}

waitEco(() => {

  // Contact form
  document.getElementById("contact-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name    = document.getElementById("contact-name").value.trim();
    const email   = document.getElementById("contact-email").value.trim();
    const subject = document.getElementById("contact-subject").value;
    const message = document.getElementById("contact-message").value.trim();

    if (!name || !email || !message) {
      window._eco.showToast("Please fill in all fields.", true);
      return;
    }

    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';

    let dbSaved = false;
    let emailSent = false;

    // 1. Save to Firebase RTDB
    const db = window._eco?.db;
    if (db) {
      try {
        await push(ref(db, "inquiries"), {
          name,
          email,
          subject,
          message,
          timestamp: Date.now(),
          status: "pending"
        });
        dbSaved = true;
      } catch (err) {
        console.warn("[EcoVerse] Firebase inquiry save failed:", err.message);
      }
    }

    // 2. Send via EmailJS
    try {
      await emailjs.send("service_66ol554", "template_hm1cskx", {
        to_name:   "EcoVerse Team",
        to_email:  "support.ecoverse@gmail.com",
        from_name: name,
        reply_to:  email,
        message:   `Subject: ${subject}\n\n${message}`
      });
      emailSent = true;

      // Send confirmation to the sender
      try {
        await emailjs.send("service_66ol554", "template_g5175gs", {
          to_name:   name,
          to_email:  email,
          from_name: "EcoVerse Team",
          reply_to:  "support.ecoverse@gmail.com"
        });
      } catch (_) {}
    } catch (err) {
      console.warn("[EcoVerse] EmailJS send failed:", err.message);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';

    if (dbSaved || emailSent) {
      window._eco.showToast(emailSent ? "✅ Message sent! Check your email for confirmation." : "✅ Message received by the support team!");
      e.target.reset();
      showSuccessBanner("contact-form", "Your message has been received! We'll reply within 24–48 hours.");
    } else {
      window._eco.showToast("Failed to send. Please email us directly at support.ecoverse@gmail.com", true);
    }
  });

  //Guest eco tip submission 
  document.getElementById("guest-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("guest-name").value.trim() || "Anonymous";
    const tip  = document.getElementById("guest-tip").value.trim();

    if (!tip) { window._eco.showToast("Please write your eco tip.", true); return; }

    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';

    let dbSaved = false;
    let emailSent = false;

    // 1. Save to Firebase RTDB
    const db = window._eco?.db;
    if (db) {
      try {
        const user = window._eco?.auth?.currentUser;
        const tipData = {
          name,
          tip,
          timestamp: Date.now(),
          status: "pending"
        };
        if (user) {
          tipData.uid = user.uid;
        }
        await push(ref(db, "guestTips"), tipData);
        dbSaved = true;
      } catch (err) {
        console.warn("[EcoVerse] Firebase guest tip save failed:", err.message);
      }
    }

    // 2. Send via EmailJS
    try {
      await emailjs.send("service_66ol554", "template_hm1cskx", {
        to_name:   "EcoVerse Team",
        to_email:  "support.ecoverse@gmail.com",
        from_name: `Guest: ${name}`,
        reply_to:  "support.ecoverse@gmail.com",
        message:   `🌱 NEW ECO TIP SUBMISSION\n\nFrom: ${name}\n\n"${tip}"\n\n[Submitted via EcoVerse Guest Form]`
      });
      emailSent = true;
    } catch (err) {
      console.warn("[EcoVerse] EmailJS guest tip send failed:", err.message);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-leaf"></i> Submit Tip';

    if (dbSaved || emailSent) {
      window._eco.showToast("🌱 Eco tip submitted! Thank you for sharing.");
      e.target.reset();
      const esc = window._eco?.escapeHTML || (x => x);
      showSuccessBanner("guest-form", "Thanks for your eco tip, " + esc(name) + "! We may feature it in our community section.");
      if (typeof window._eco.addNotification === "function") {
        window._eco.addNotification("🌱 Eco Tip Shared", "Your eco tip has been submitted to the EcoVerse team!");
      }
    } else {
      window._eco.showToast("Could not submit. Please try again later.", true);
    }
  });

  function showSuccessBanner(formId, msg) {
    const form = document.getElementById(formId);
    if (!form) return;
    let banner = form.parentElement.querySelector(".success-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "success-banner";
      banner.style.cssText = `
        margin-top:14px; padding:14px 18px; border-radius:10px;
        background:rgba(82,183,136,0.12); border:1px solid rgba(82,183,136,0.3);
        color:#2d6a4f; font-size:.875rem; display:flex; align-items:center; gap:10px;
      `;
      form.parentElement.appendChild(banner);
    }
    banner.innerHTML = `<i class="fas fa-check-circle" style="color:var(--leaf)"></i> ${msg}`;
    setTimeout(() => banner.remove(), 8000);
  }
});
