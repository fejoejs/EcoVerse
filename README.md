# 🌍 EcoVerse
EcoVerse is a modern, interactive, and gamified web application designed to help users track, understand, and reduce their personal carbon footprints. By combining real-time tracking, social features, live environment data, and Google Gemini AI integration, EcoVerse empowers individuals to make smarter, greener choices every day.
---
## 🚀 Key Features
*   **📊 Carbon Dashboard:** A central hub showing daily footprint metrics across key categories (Diet, Transport, and Energy) with visual progression tracking.
*   **🥗 Footprint Calculators:**
    *   **Diet:** Track meat, dairy, and local food consumption.
    *   **Transport:** Log commutes (car, transit, cycling, flying).
    *   **Energy:** Track electricity, heating, and household fuel usage.
*   **🧠 Genuine AI Recommendations:** Leverages Google Gemini to deliver tailored sustainability advice based on the user's specific consumption clusters.
*   **💬 Eco Chatbot:** An integrated AI assistant to answer sustainability questions, suggest recipes, and give tips on cutting carbon emissions.
*   **🏆 Gamification & Progress:** Earn XP, level up (from *Eco Seedling* to *Earth Guardian*), maintain daily streaks, and unlock achievements.
*   **🌐 Eco-Circle (Social):** Add friends, compare impact on global and friend leaderboards, and share your eco cards.
*   **🌍 Live Data & Local Tips:** Integrates real-time weather and grid carbon intensity data to suggest smart actions.
*   **🛡️ Admin Panel:** Manage user accounts, inquiries, guest tips, publish global announcements, toggle maintenance mode, and manage API keys safely.
---
## 🛠️ Tech Stack
*   **Frontend:** HTML5, CSS3 (Vanilla), JavaScript
*   **Backend & Services:** Firebase Suite
    *   **Firebase Auth:** Secure Google & Email/Password Sign-In
    *   **Firebase Realtime Database (RTDB):** Real-time data storage, configurations, and leaderboard syncing
    *   **Firebase Hosting:** Optimized static hosting
*   **APIs & Integrations:**
    *   **Google Gemini API:** Drives chatbot conversations and custom eco recommendations
    *   **OpenWeather API:** Fetches live weather conditions for smart energy advice
    *   **EmailJS:** Handles contact form submissions directly to admin inbox

## 🔐 API Key Management
EcoVerse is configured to retrieve API keys dynamically from the Firebase Realtime Database to prevent exposing sensitive credentials in client-side repositories. 
Ensure the following path is configured in your database:

# 🌍 EcoVerse
**Live Demo:** [https://ecoverse-2026.web.app]
