const authView = document.querySelector("#authView");
const settingsView = document.querySelector("#settingsView");
const accountLabel = document.querySelector("#accountLabel");
const authForm = document.querySelector("#authForm");
const authButton = document.querySelector("#authButton");
const authMessage = document.querySelector("#authMessage");
const loginTab = document.querySelector("#loginTab");
const signupTab = document.querySelector("#signupTab");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const settingsForm = document.querySelector("#settingsForm");
const sitesInput = document.querySelector("#sitesInput");
const limitInput = document.querySelector("#limitInput");
const blockInput = document.querySelector("#blockInput");
const settingsMessage = document.querySelector("#settingsMessage");
const usageList = document.querySelector("#usageList");
const logoutButton = document.querySelector("#logoutButton");

let mode = "login";
let state = null;

init();

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(authMessage, "");

  const response = await chrome.runtime.sendMessage({
    type: mode,
    email: emailInput.value,
    password: passwordInput.value
  });

  if (!response?.ok) {
    setMessage(authMessage, response?.error || "Something went wrong.");
    return;
  }

  passwordInput.value = "";
  await init();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const sites = sitesInput.value
    .split(/\r?\n|,/)
    .map((site) => site.trim())
    .filter(Boolean);

  const response = await chrome.runtime.sendMessage({
    type: "saveRules",
    rules: {
      sites,
      dailyLimitMinutes: limitInput.value,
      blockMinutes: blockInput.value
    }
  });

  if (!response?.ok) {
    setMessage(settingsMessage, "Unable to save settings.");
    return;
  }

  state.rules = response.rules;
  renderSettings();
  setMessage(settingsMessage, "Saved.", true);
});

logoutButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "logout" });
  await init();
});

async function init() {
  state = await chrome.runtime.sendMessage({ type: "getPopupState" });
  if (!state?.ok) {
    setMessage(authMessage, "Extension is not ready yet.");
    return;
  }

  render();
}

function render() {
  authView.classList.toggle("hidden", state.loggedIn);
  settingsView.classList.toggle("hidden", !state.loggedIn);
  accountLabel.textContent = state.loggedIn ? state.email : "Login to start tracking websites";

  if (state.loggedIn) {
    renderSettings();
    renderUsage();
  }
}

function renderSettings() {
  sitesInput.value = state.rules.sites.join("\n");
  limitInput.value = state.rules.dailyLimitMinutes;
  blockInput.value = state.rules.blockMinutes;
}

function renderUsage() {
  const sites = state.rules.sites;
  if (!sites.length) {
    usageList.innerHTML = `<p class="empty">Add websites to start tracking time.</p>`;
    return;
  }

  usageList.innerHTML = sites.map((site) => {
    const usedMs = state.usage[site] || 0;
    const limitMs = state.rules.dailyLimitMinutes * 60 * 1000;
    const percent = Math.min(100, Math.round((usedMs / limitMs) * 100));
    const blockedUntil = state.blocked[site];
    const blockedLabel = blockedUntil ? `Blocked for ${formatMinutes(blockedUntil - Date.now())}` : `${formatMinutes(usedMs)} used`;

    return `
      <article class="usage-item">
        <div class="usage-line">
          <span class="usage-site">${escapeHtml(site)}</span>
          <span class="usage-time">${blockedLabel}</span>
        </div>
        <div class="progress" aria-label="${percent}% used">
          <span style="width: ${percent}%"></span>
        </div>
      </article>
    `;
  }).join("");
}

function setMode(nextMode) {
  mode = nextMode;
  loginTab.classList.toggle("active", mode === "login");
  signupTab.classList.toggle("active", mode === "signup");
  authButton.textContent = mode === "login" ? "Login" : "Create account";
  authMessage.textContent = "";
}

function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}

function formatMinutes(ms = 0) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}
