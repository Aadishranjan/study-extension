const HEARTBEAT_MS = 5000;
let blockRoot;

checkStatus();
setInterval(() => {
  if (document.visibilityState === "visible") {
    chrome.runtime.sendMessage({ type: "heartbeat" }, applyStatus);
  }
}, HEARTBEAT_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkStatus();
  }
});

function checkStatus() {
  chrome.runtime.sendMessage({ type: "getStatus", href: location.href }, applyStatus);
}

function applyStatus(status) {
  if (!status?.blocked) {
    removeBlock();
    return;
  }

  showBlock(status);
}

function showBlock(status) {
  if (!document.documentElement) {
    requestAnimationFrame(() => showBlock(status));
    return;
  }

  if (!blockRoot) {
    blockRoot = document.createElement("div");
    blockRoot.id = "study-site-timer-block";
    document.documentElement.append(blockRoot);
  }

  blockRoot.innerHTML = `
    <style>
      #study-site-timer-block {
        align-items: center;
        background: #111827;
        color: #f9fafb;
        display: flex;
        font-family: Arial, Helvetica, sans-serif;
        inset: 0;
        justify-content: center;
        padding: 24px;
        position: fixed;
        z-index: 2147483647;
      }

      #study-site-timer-block .panel {
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        color: #111827;
        max-width: 460px;
        padding: 28px;
        text-align: center;
        width: min(100%, 460px);
      }

      #study-site-timer-block h1 {
        font-size: 26px;
        line-height: 1.2;
        margin: 0 0 12px;
      }

      #study-site-timer-block p {
        color: #4b5563;
        font-size: 16px;
        line-height: 1.5;
        margin: 0 0 18px;
      }

      #study-site-timer-block strong {
        color: #111827;
      }

      #study-site-timer-block .timer {
        background: #f3f4f6;
        border-radius: 6px;
        color: #111827;
        display: inline-block;
        font-size: 22px;
        font-weight: 700;
        min-width: 140px;
        padding: 10px 14px;
      }
    </style>
    <div class="panel">
      <h1>Website blocked</h1>
      <p>You used your daily time for <strong>${escapeHtml(status.site || location.hostname)}</strong>.</p>
      <p>Come back when the block time ends.</p>
      <div class="timer">${formatRemaining(status.remainingMs)}</div>
    </div>
  `;
}

function removeBlock() {
  blockRoot?.remove();
  blockRoot = null;
}

function formatRemaining(ms = 0) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
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
