const STORAGE_KEYS = {
  session: "session",
  rules: "rules",
  usage: "usage",
  blocked: "blocked"
};

const DEFAULT_RULES = {
  sites: [],
  dailyLimitMinutes: 30,
  blockMinutes: 60
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  if (!current[STORAGE_KEYS.rules]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.rules]: DEFAULT_RULES });
  }
  chrome.alarms.create("cleanupExpiredBlocks", { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanupExpiredBlocks") {
    cleanupExpiredBlocks();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "heartbeat") {
    handleHeartbeat(sender.tab, sendResponse);
    return true;
  }

  if (message.type === "getStatus") {
    getPageStatus(message.href).then(sendResponse);
    return true;
  }

  if (message.type === "getPopupState") {
    getPopupState().then(sendResponse);
    return true;
  }

  if (message.type === "saveRules") {
    saveRules(message.rules).then(sendResponse);
    return true;
  }

  if (message.type === "signup") {
    signup(message.email, message.password).then(sendResponse);
    return true;
  }

  if (message.type === "login") {
    login(message.email, message.password).then(sendResponse);
    return true;
  }

  if (message.type === "logout") {
    chrome.storage.local.remove(STORAGE_KEYS.session).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function signup(email, password) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password || password.length < 6) {
    return { ok: false, error: "Enter a valid email and a password of at least 6 characters." };
  }

  const { users = {} } = await chrome.storage.local.get("users");
  if (users[cleanEmail]) {
    return { ok: false, error: "This email already has an account. Please log in." };
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  users[cleanEmail] = {
    salt: bytesToHex(salt),
    passwordHash: await hashPassword(password, salt)
  };

  await chrome.storage.local.set({
    users,
    [STORAGE_KEYS.session]: { email: cleanEmail }
  });

  return { ok: true };
}

async function login(email, password) {
  const cleanEmail = normalizeEmail(email);
  const { users = {} } = await chrome.storage.local.get("users");
  const user = users[cleanEmail];

  if (!user) {
    return { ok: false, error: "No account found for this email." };
  }

  const passwordHash = await hashPassword(password, hexToBytes(user.salt));
  if (passwordHash !== user.passwordHash) {
    return { ok: false, error: "Email or password is incorrect." };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.session]: { email: cleanEmail } });
  return { ok: true };
}

async function getPopupState() {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const rules = normalizeRules(data[STORAGE_KEYS.rules]);
  const today = getTodayKey();
  const usage = data[STORAGE_KEYS.usage]?.[today] || {};
  const blocked = await cleanupExpiredBlocks(data[STORAGE_KEYS.blocked]);

  return {
    ok: true,
    loggedIn: Boolean(data[STORAGE_KEYS.session]?.email),
    email: data[STORAGE_KEYS.session]?.email || "",
    rules,
    usage,
    blocked
  };
}

async function saveRules(rawRules) {
  const rules = normalizeRules(rawRules);
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: rules });
  return { ok: true, rules };
}

async function handleHeartbeat(tab, sendResponse) {
  if (!tab?.url) {
    sendResponse({ ok: true, blocked: false });
    return;
  }

  const status = await getPageStatus(tab.url, true);
  sendResponse(status);
}

async function getPageStatus(href, shouldRecordUsage = false) {
  const host = getHost(href);
  if (!host) {
    return { ok: true, blocked: false };
  }

  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const isLoggedIn = Boolean(data[STORAGE_KEYS.session]?.email);
  const rules = normalizeRules(data[STORAGE_KEYS.rules]);
  const matchedSite = findMatchingSite(host, rules.sites);
  const blocked = await cleanupExpiredBlocks(data[STORAGE_KEYS.blocked]);
  const blockedUntil = blocked[matchedSite] || blocked[host];

  if (!isLoggedIn || !matchedSite) {
    return { ok: true, blocked: false };
  }

  if (blockedUntil && blockedUntil > Date.now()) {
    return {
      ok: true,
      blocked: true,
      site: matchedSite,
      blockedUntil,
      remainingMs: blockedUntil - Date.now()
    };
  }

  if (shouldRecordUsage) {
    const result = await recordUsage(matchedSite, rules);
    if (result.blocked) {
      return result;
    }
  }

  const latest = await chrome.storage.local.get(STORAGE_KEYS.usage);
  const usedMs = latest[STORAGE_KEYS.usage]?.[getTodayKey()]?.[matchedSite] || 0;

  return {
    ok: true,
    blocked: false,
    site: matchedSite,
    usedMs,
    limitMs: rules.dailyLimitMinutes * 60 * 1000
  };
}

async function recordUsage(site, rules) {
  const data = await chrome.storage.local.get([STORAGE_KEYS.usage, STORAGE_KEYS.blocked]);
  const today = getTodayKey();
  const usage = data[STORAGE_KEYS.usage] || {};
  usage[today] = usage[today] || {};
  usage[today][site] = (usage[today][site] || 0) + 5000;

  const limitMs = rules.dailyLimitMinutes * 60 * 1000;
  if (usage[today][site] >= limitMs) {
    const blockedUntil = Date.now() + rules.blockMinutes * 60 * 1000;
    const blocked = data[STORAGE_KEYS.blocked] || {};
    blocked[site] = blockedUntil;
    await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usage, [STORAGE_KEYS.blocked]: blocked });
    return {
      ok: true,
      blocked: true,
      site,
      blockedUntil,
      remainingMs: rules.blockMinutes * 60 * 1000
    };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usage });
  return { ok: true, blocked: false };
}

async function cleanupExpiredBlocks(existingBlocked) {
  const data = existingBlocked ? { [STORAGE_KEYS.blocked]: existingBlocked } : await chrome.storage.local.get(STORAGE_KEYS.blocked);
  const blocked = data[STORAGE_KEYS.blocked] || {};
  const now = Date.now();
  let changed = false;
  const expiredSites = [];

  for (const [site, until] of Object.entries(blocked)) {
    if (!until || until <= now) {
      delete blocked[site];
      changed = true;
      expiredSites.push(site);
    }
  }

  if (changed) {
    const updates = { [STORAGE_KEYS.blocked]: blocked };

    if (expiredSites.length) {
      const usageData = await chrome.storage.local.get(STORAGE_KEYS.usage);
      const usage = usageData[STORAGE_KEYS.usage] || {};
      const today = getTodayKey();
      usage[today] = usage[today] || {};

      for (const site of expiredSites) {
        usage[today][site] = 0;
      }

      updates[STORAGE_KEYS.usage] = usage;
    }

    await chrome.storage.local.set(updates);
  }

  return blocked;
}

function normalizeRules(rawRules = {}) {
  const sites = Array.isArray(rawRules.sites) ? rawRules.sites : [];
  return {
    sites: sites
      .map(normalizeSite)
      .filter(Boolean)
      .filter((site, index, list) => list.indexOf(site) === index),
    dailyLimitMinutes: clampNumber(rawRules.dailyLimitMinutes, 1, 1440, DEFAULT_RULES.dailyLimitMinutes),
    blockMinutes: clampNumber(rawRules.blockMinutes, 1, 10080, DEFAULT_RULES.blockMinutes)
  };
}

function findMatchingSite(host, sites) {
  return sites.find((site) => host === site || host.endsWith(`.${site}`));
}

function normalizeSite(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function getHost(href) {
  try {
    return new URL(href).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

async function hashPassword(password, saltBytes) {
  const passwordBytes = new TextEncoder().encode(password);
  const combined = new Uint8Array(saltBytes.length + passwordBytes.length);
  combined.set(saltBytes);
  combined.set(passwordBytes, saltBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
