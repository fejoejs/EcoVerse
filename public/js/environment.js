//  Real-time AQI, Weather, Carbon Intensity, Renewable %
//  Uses OpenWeatherMap + Carbon Intensity API + fallback estimates
function waitEco(cb, tries = 0) {
  if (window._eco) cb();
  else if (tries < 40) setTimeout(() => waitEco(cb, tries + 1), 100);
}

let envInterval = null;

async function fetchEnvironmentData() {
  return new Promise(resolve => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        err => {
          console.warn("[EcoVerse] Geolocation failed:", err.message, "— falling back to IP-based location.");
          resolve({ lat: null, lon: null, fallback: true });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      resolve({ lat: null, lon: null, fallback: true });
    }
  });
}

// IP-based location fallback when browser geolocation is denied/unavailable
async function fetchIpLocation() {
  try {
    const r = await fetch("https://ipapi.co/json/");
    const d = await r.json();
    return { lat: d.latitude, lon: d.longitude, city: d.city, country: d.country_code };
  } catch (_) {
    return { lat: 8.5241, lon: 76.9366, city: "Thiruvananthapuram", country: "IN" }; // last-resort default
  }
}

// Real, live AQI from Open-Meteo's free Air Quality API (no key required)
async function fetchRealAQI(lat, lon) {
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10`);
    const d = await r.json();
    const aqi = Math.round(d.current?.us_aqi ?? NaN);
    if (isNaN(aqi)) throw new Error("No AQI value returned");
    return aqi;
  } catch (err) {
    console.warn("[EcoVerse] Live AQI fetch failed, using regional estimate:", err.message);
    return estimateAQI(lat, lon); // fallback only if the real API is unreachable
  }
}

// Estimate AQI from coordinates (fallback simulation with realistic ranges)
function estimateAQI(lat, lon) {
  // Deterministic estimate based on lat/lon to give consistent results
  const seed = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453);
  const base  = seed - Math.floor(seed);
  // Range: 20–150 (realistic urban/rural mix)
  return Math.round(20 + base * 130);
}

function aqiCategory(aqi) {
  if (aqi <= 50)  return { label: "Good",        color: "#52b788", barPct: 20 };
  if (aqi <= 100) return { label: "Moderate",    color: "#e9c46a", barPct: 45 };
  if (aqi <= 150) return { label: "Unhealthy*",  color: "#f4a261", barPct: 65 };
  if (aqi <= 200) return { label: "Unhealthy",   color: "#e63946", barPct: 80 };
  return             { label: "Hazardous",    color: "#7b2d8b", barPct: 100 };
}

// Carbon intensity estimates by country (gCO2/kWh)
const CARBON_BY_REGION = {
  IN: { intensity: 710, renewable: 22, label:"India" },
  US: { intensity: 386, renewable: 21, label:"USA" },
  GB: { intensity: 233, renewable: 35, label:"UK" },
  DE: { intensity: 385, renewable: 42, label:"Germany" },
  FR: { intensity: 85,  renewable: 78, label:"France" },
  AU: { intensity: 710, renewable: 23, label:"Australia" },
  CN: { intensity: 620, renewable: 29, label:"China" },
  DEFAULT: { intensity: 475, renewable: 30, label:"Global" }
};

async function detectCountry(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const d = await r.json();
    return d.address?.country_code?.toUpperCase() || "DEFAULT";
  } catch (_) { return "IN"; }
}

async function fetchWeather(lat, lon) {
  const key = await window._eco.getApiKey("openweather", "YOUR_API_KEY");
  if (key) {
    try {
      const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`);
      const d = await r.json();
      return {
        temp: Math.round(d.main?.temp || 28),
        humidity: d.main?.humidity || 65,
        desc: d.weather?.[0]?.main || "Clear",
        icon: getWeatherEmoji(d.weather?.[0]?.main || "Clear"),
        city: d.name || "Your Location"
      };
    } catch (_) {}
  }
  // Open-Meteo free API (no key required!)
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weathercode&timezone=auto`);
    const d = await r.json();
    const cur = d.current || {};
    const code = cur.weathercode || 0;
    const desc = wmoToDesc(code);
    return {
      temp: Math.round(cur.temperature_2m || 28),
      humidity: Math.round(cur.relative_humidity_2m || 65),
      desc: desc,
      icon: getWeatherEmoji(desc),
      city: "Your Location"
    };
  } catch (_) {
    return { temp: 28, humidity: 65, desc: "Partly Cloudy", icon: "⛅", city: "Your Location" };
  }
}

function wmoToDesc(code) {
  if (code === 0)         return "Clear";
  if (code <= 2)          return "Partly Cloudy";
  if (code <= 3)          return "Overcast";
  if (code <= 49)         return "Foggy";
  if (code <= 59)         return "Drizzle";
  if (code <= 69)         return "Rain";
  if (code <= 79)         return "Snow";
  if (code <= 82)         return "Rain Showers";
  if (code <= 85)         return "Snow Showers";
  if (code <= 99)         return "Thunderstorm";
  return "Cloudy";
}

function getWeatherEmoji(desc) {
  const map = {
    "Clear":"☀️","Sunny":"☀️","Partly Cloudy":"⛅","Overcast":"☁️",
    "Clouds":"☁️","Rain":"🌧","Drizzle":"🌦","Thunderstorm":"⛈",
    "Snow":"❄️","Foggy":"🌫","Mist":"🌫","Haze":"🌫","Windy":"💨"
  };
  return map[desc] || "🌤";
}

async function loadEnvironmentData() {

  const locText = document.getElementById("env-location-text");
  if (locText) locText.textContent = "Detecting your location…";

  let { lat, lon, fallback } = await fetchEnvironmentData();
  let cityName = "Your Location";

  if (lat == null || lon == null) {
    // Browser geolocation denied/unavailable — use IP-based location instead
    const ipLoc = await fetchIpLocation();
    lat = ipLoc.lat; lon = ipLoc.lon; cityName = ipLoc.city || "Your Location";
    fallback = true;
  } else {
    // Reverse-geocode the precise GPS coordinates for a city name
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const d = await r.json();
      cityName = d.address?.city || d.address?.town || d.address?.village || d.address?.state || "Your Location";
    } catch (_) {}
  }

  if (locText) locText.textContent = `📍 ${cityName}${fallback ? " (approximate — enable location permission for precise data)" : ""}`;

  // Weather (already live via Open-Meteo)
  const weather = await fetchWeather(lat, lon);
  setTxt("env-temp",         weather.temp + "°C");
  setTxt("env-weather-desc", weather.desc);
  setTxt("env-humidity",     `💧 Humidity: ${weather.humidity}%`);
  setTxt("env-weather-icon", weather.icon);

  // AQI — now genuinely live, not a hash-based guess
  const aqi = await fetchRealAQI(lat, lon);
  const aqiInfo = aqiCategory(aqi);
  setTxt("env-aqi", aqi);
  setTxt("env-aqi-label", aqiInfo.label);
  setBar("env-aqi-bar", aqiInfo.barPct, `linear-gradient(90deg,${aqiInfo.color},${aqiInfo.color}aa)`);

  // Carbon intensity
  let carbonData = CARBON_BY_REGION["DEFAULT"];
  let countryCode = "DEFAULT";
  try {
    countryCode = await detectCountry(lat, lon);
    carbonData  = CARBON_BY_REGION[countryCode] || CARBON_BY_REGION["DEFAULT"];
  } catch (_) {}

  let intensity = carbonData.intensity, renewable = carbonData.renewable;
  try {
    if (countryCode === "GB") {
      const r = await fetch("https://api.carbonintensity.org.uk/intensity");
      const d = await r.json();
      intensity = d.data?.[0]?.intensity?.actual || intensity;
    }
  } catch (_) {}

  setTxt("env-carbon", intensity);
  setTxt("env-carbon-label", "gCO₂/kWh");
  setBar("env-carbon-bar", Math.min(100, (intensity / 900) * 100));
  setTxt("env-renewable", renewable + "%");
  setBar("env-renewable-bar", renewable);

  generateEnvAdvice(aqi, weather, intensity, renewable);
}

function generateEnvAdvice(aqi, weather, intensity, renewable) {
  const box = document.getElementById("env-advice");
  if (!box) return;
  const tips = [];
  if (aqi > 100)    tips.push({ icon:"😷", text:"Air quality is poor today. Avoid outdoor exercise and keep windows closed if possible." });
  if (aqi <= 50)    tips.push({ icon:"🌬", text:"Air quality is excellent today! Great day for outdoor activities and fresh air." });
  if (intensity > 400) tips.push({ icon:"⚡", text:"Grid carbon intensity is high right now. Postpone running dishwashers, washing machines, or EV charging if possible." });
  if (intensity < 200) tips.push({ icon:"🌱", text:"The grid is running clean right now! Great time to charge EVs or run high-energy appliances." });
  if (renewable > 40)  tips.push({ icon:"☀️", text:`${renewable}% of the grid is renewable today — your electricity is relatively green!` });
  if (weather.temp > 30) tips.push({ icon:"🌡️", text:"It's hot today. Use fans instead of AC when possible, and stay hydrated to reduce energy use." });
  if (weather.temp < 10) tips.push({ icon:"🧥", text:"Cold day! Layer up before raising your thermostat to save heating energy." });
  if (weather.desc?.includes("Rain")) tips.push({ icon:"🚶", text:"Rainy day — a good excuse to work from home and cut commute emissions!" });
  if (weather.desc === "Clear" || weather.desc === "Sunny") tips.push({ icon:"🌞", text:"Sunny day — perfect for solar panel generation and outdoor walking or cycling!" });
  tips.push({ icon:"🌿", text:"Every low-carbon choice today contributes to long-term climate stability." });

  box.innerHTML = tips.map(t => `
    <div class="env-advice-item">
      <i class="fas fa-${t.icon === "🌿"?"leaf":t.icon === "⚡"?"bolt":t.icon === "😷"?"mask":t.icon === "🌡️"?"thermometer-half":"circle"}" style="color:var(--leaf)"></i>
      <span>${t.text}</span>
    </div>`).join("");
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setBar(id, pct, bg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(100, Math.max(0, pct)) + "%";
  if (bg) el.style.background = bg;
}

waitEco(() => {
  document.getElementById("refreshEnvBtn")?.addEventListener("click", loadEnvironmentData);
  window._eco.loadEnvironmentData = loadEnvironmentData;
});