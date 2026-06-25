"use strict";

const CONSOLE_STATUS_URL = "/signalk/v1/api/ajrmMarineConsole/status";
const AUDIO_STATUS_URL = "/signalk/v1/api/ajrmMarineAudio/status";
const ACTIVE_MODULE_KEY = "ajrmMarineConsole.activeModule";
const AUDIO_ACCESS_TOKEN_STORAGE_KEY = "ajrmMarineAudio.accessToken";
const BROWSER_OUTPUT_MODE_STORAGE_KEY = "ajrmMarineAudio.browserOutputMode";
const BROWSER_OUTPUT_STORAGE_KEY = "ajrmMarineAudio.browserOutput";
const SILENT_AUDIO_DATA_URL =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
let activeFrame = null;
let consoleStatus = null;
let lastConsoleAudioUrl = "";
let lastConsoleAnnouncementKey = "";
let lastConsoleSpeechKey = "";
let browserAudioStarted = false;
let browserAudioUnlocked = false;
let browserAudioUnlocking = false;
let firstBrowserAudioRefresh = true;

const els = {
  version: document.getElementById("version"),
  connection: document.getElementById("connection"),
  enableBrowserAudio: document.getElementById("enableBrowserAudio"),
  tabs: document.getElementById("tabs"),
  overview: document.getElementById("overview"),
  overviewHelp: document.getElementById("overviewHelp"),
  overviewHelpButton: document.getElementById("overviewHelpButton"),
  overviewBackButton: document.getElementById("overviewBackButton"),
  frameHost: document.getElementById("frameHost"),
  frameMessage: document.getElementById("frameMessage"),
  moduleCards: document.getElementById("moduleCards"),
  browserAudioHost: document.getElementById("browserAudioHost"),
};

async function start() {
  updateViewportHeight();
  window.addEventListener("resize", updateViewportHeight);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(updateViewportHeight, 250);
  });
  try {
    consoleStatus = await jsonRequest(CONSOLE_STATUS_URL);
    els.version.textContent = `v${consoleStatus.version}`;
    renderNavigation();
    const stored = localStorage.getItem(ACTIVE_MODULE_KEY);
    selectModule(
      consoleStatus.modules.some((module) => module.id === stored)
        ? stored
        : consoleStatus.defaultModule,
    );
    setConnection(true);
    startBrowserAudioHost();
  } catch (error) {
    setConnection(false, error.message);
    els.overview.hidden = false;
  }
}

function updateViewportHeight() {
  const height = window.innerHeight || document.documentElement.clientHeight;
  if (height > 0) {
    document.documentElement.style.setProperty("--console-vh", `${height}px`);
  }
}

function renderNavigation() {
  els.tabs.innerHTML = consoleStatus.modules
    .map(
      (module) =>
        `<button class="tab" type="button" data-module="${escapeHtml(module.id)}">${escapeHtml(module.icon)} ${escapeHtml(module.title)}</button>`,
    )
    .join("");
  els.moduleCards.innerHTML = consoleStatus.modules
    .filter((module) => module.kind === "webapp")
    .map(
      (module) =>
        `<button class="module-card" type="button" data-module="${escapeHtml(module.id)}"><strong>${escapeHtml(module.icon)} ${escapeHtml(module.title)}</strong><span>${escapeHtml(module.description)}</span><small>${escapeHtml(module.packageName || module.id)}${module.version ? ` · v${escapeHtml(module.version)}` : ""}</small></button>`,
    )
    .join("") || '<p class="empty-note">No webapps are selected. Choose installed Signal K webapps in the AJRM Marine Console plugin configuration.</p>';
}

function selectModule(id) {
  const module = consoleStatus.modules.find((candidate) => candidate.id === id);
  if (!module) return;
  localStorage.setItem(ACTIVE_MODULE_KEY, id);
  for (const tab of els.tabs.querySelectorAll("[data-module]")) {
    tab.classList.toggle("active", tab.dataset.module === id);
  }
  if (module.kind === "native") {
    els.overview.hidden = false;
    els.overviewHelp.hidden = true;
    els.frameHost.hidden = true;
    unloadActiveFrame();
    return;
  }
  els.overview.hidden = true;
  els.overviewHelp.hidden = true;
  els.frameHost.hidden = false;
  showFrame(module);
}

function showOverviewHelp() {
  els.overview.hidden = true;
  els.frameHost.hidden = true;
  els.overviewHelp.hidden = false;
  unloadActiveFrame();
}

function showFrame(module) {
  if (activeFrame && activeFrame.dataset.moduleId === module.id) {
    activeFrame.hidden = false;
    return;
  }
  unloadActiveFrame();
  const frame = document.createElement("iframe");
  frame.className = "module-frame";
  frame.title = module.title;
  frame.src = moduleFrameUrl(module);
  frame.dataset.moduleId = module.id;
  frame.dataset.packageName = module.packageName || "";
  activeFrame = frame;
  els.frameMessage.hidden = false;
  frame.addEventListener("load", () => {
    frame.dataset.loaded = "true";
    if (activeFrame === frame) els.frameMessage.hidden = true;
  });
  els.frameHost.append(frame);
}

function unloadActiveFrame() {
  if (activeFrame) {
    activeFrame.remove();
    activeFrame = null;
  }
  els.frameMessage.hidden = true;
}

function moduleFrameUrl(module) {
  if (!isAudioModule(module)) return module.url;
  const separator = String(module.url || "").includes("?") ? "&" : "?";
  return `${module.url}${separator}consoleAudioHost=1`;
}

function isAudioModule(module) {
  return (
    module.id === "signalk-ajrm-marine-audio" ||
    module.packageName === "signalk-ajrm-marine-audio" ||
    /watchkeeper audio/i.test(module.title || "")
  );
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
  }
  return body;
}

function setConnection(ok, detail = "") {
  els.connection.textContent = ok ? "Console ready" : detail || "Unavailable";
  els.connection.className = `pill ${ok ? "ok" : "warning"}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function startBrowserAudioHost() {
  if (browserAudioStarted) return;
  browserAudioStarted = true;
  document.addEventListener("click", unlockBrowserAudio, { capture: true });
  refreshBrowserAudio();
  window.setInterval(refreshBrowserAudio, 2000);
}

async function refreshBrowserAudio() {
  const mode = browserOutputMode();
  renderBrowserAudioButton(mode);
  if (mode === "off") {
    stopBrowserAudioHost();
    return;
  }
  let status;
  try {
    status = await jsonRequest(AUDIO_STATUS_URL, {
      headers: audioAuthHeaders(),
    });
  } catch (_error) {
    return;
  }
  const announcement = status.lastAnnouncement || {};
  if (status.muted === true && announcement.force !== true) return;
  const message = String(announcement.message || "").trim();
  const audioUrl = announcement.audioUrl || announcement.publicAudioUrl || "";
  const announcementKey = consoleAnnouncementKey(announcement, message);
  if (firstBrowserAudioRefresh) {
    lastConsoleAudioUrl = audioUrl;
    lastConsoleAnnouncementKey = announcementKey;
    lastConsoleSpeechKey = consoleSpeechKey(message, announcement);
    firstBrowserAudioRefresh = false;
    return;
  }
  if (mode === "piper") playConsolePiperAudio(audioUrl, announcementKey);
  if (mode === "speech") speakConsoleMessage(message, announcement);
}

function browserOutputMode() {
  const storedMode = localStorage.getItem(BROWSER_OUTPUT_MODE_STORAGE_KEY);
  if (["off", "speech", "piper"].includes(storedMode)) return storedMode;
  return localStorage.getItem(BROWSER_OUTPUT_STORAGE_KEY) === "true" ? "piper" : "off";
}

function playConsolePiperAudio(audioUrl, announcementKey = audioUrl) {
  if (!audioUrl || announcementKey === lastConsoleAnnouncementKey) return;
  lastConsoleAudioUrl = audioUrl;
  lastConsoleAnnouncementKey = announcementKey;
  els.browserAudioHost.src = audioUrl;
  els.browserAudioHost.play().then(() => {
    browserAudioUnlocked = true;
    renderBrowserAudioButton(browserOutputMode());
  }).catch(() => {
    browserAudioUnlocked = false;
    lastConsoleAudioUrl = "";
    renderBrowserAudioButton(browserOutputMode());
  });
}

function speakConsoleMessage(message, announcement = {}) {
  if (!message) return;
  const speech = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!speech || !Utterance) return;
  const speechKey = consoleSpeechKey(message, announcement);
  if (speechKey === lastConsoleSpeechKey) return;
  lastConsoleSpeechKey = speechKey;
  speech.speak(new Utterance(message));
  browserAudioUnlocked = true;
  renderBrowserAudioButton(browserOutputMode());
}

function consoleSpeechKey(message, announcement = {}) {
  return `${message}:${announcement.audioUrl || announcement.publicAudioUrl || ""}`;
}

function consoleAnnouncementKey(announcement = {}, message = "") {
  return String(
    announcement.requestId ||
      announcement.correlationId ||
      announcement.id ||
      announcement.playbackId ||
      `${message}:${announcement.timestamp || ""}`,
  );
}

function stopBrowserAudioHost() {
  els.browserAudioHost.pause();
  lastConsoleAudioUrl = "";
  lastConsoleAnnouncementKey = "";
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function unlockBrowserAudio() {
  const mode = browserOutputMode();
  if (browserAudioUnlocked) {
    renderBrowserAudioButton(mode);
    return;
  }
  if (browserAudioUnlocking) {
    renderBrowserAudioButton(mode);
    return;
  }
  if (mode === "off") {
    renderBrowserAudioButton(mode);
    return;
  }
  if (mode === "speech") {
    primeBrowserSpeech(mode);
    return;
  }
  primeBrowserAudioElement(mode);
}

function primeBrowserSpeech(mode) {
  const speech = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!speech || !Utterance) {
    browserAudioUnlocked = false;
    renderBrowserAudioButton(mode);
    return;
  }
  browserAudioUnlocking = true;
  renderBrowserAudioButton(mode);
  try {
    const utterance = new Utterance(" ");
    utterance.volume = 0;
    utterance.onend = () => finishBrowserAudioUnlock(mode, true);
    utterance.onerror = () => finishBrowserAudioUnlock(mode, false);
    speech.speak(utterance);
    window.setTimeout(() => finishBrowserAudioUnlock(mode, true), 500);
  } catch (_error) {
    finishBrowserAudioUnlock(mode, false);
  }
}

function primeBrowserAudioElement(mode) {
  browserAudioUnlocking = true;
  renderBrowserAudioButton(mode);
  const previousSrc = els.browserAudioHost.getAttribute("src") || "";
  if (!previousSrc) {
    els.browserAudioHost.src = SILENT_AUDIO_DATA_URL;
  }
  els.browserAudioHost.play().then(() => {
    els.browserAudioHost.pause();
    if (!previousSrc && els.browserAudioHost.getAttribute("src") === SILENT_AUDIO_DATA_URL) {
      els.browserAudioHost.removeAttribute("src");
      els.browserAudioHost.load();
    }
    finishBrowserAudioUnlock(mode, true);
  }).catch(() => {
    if (!previousSrc && els.browserAudioHost.getAttribute("src") === SILENT_AUDIO_DATA_URL) {
      els.browserAudioHost.removeAttribute("src");
      els.browserAudioHost.load();
    }
    finishBrowserAudioUnlock(mode, false);
  });
}

function finishBrowserAudioUnlock(mode, ok) {
  if (!browserAudioUnlocking && browserAudioUnlocked === ok) return;
  browserAudioUnlocking = false;
  browserAudioUnlocked = ok;
  renderBrowserAudioButton(mode);
}

function renderBrowserAudioButton(mode = browserOutputMode()) {
  const enabled = mode !== "off";
  els.enableBrowserAudio.hidden = !enabled;
  els.enableBrowserAudio.classList.toggle("ready", enabled && browserAudioUnlocked);
  if (browserAudioUnlocking) {
    els.enableBrowserAudio.textContent = "Enabling audio";
  } else {
    els.enableBrowserAudio.textContent = browserAudioUnlocked ? "Audio ready" : "Enable audio";
  }
  els.enableBrowserAudio.title =
    mode === "piper"
      ? "Enable AJRM Marine Piper playback in this Console window"
      : mode === "speech"
        ? "Enable browser speech synthesis in this Console window"
        : "Browser audio is off";
}

function audioAuthHeaders() {
  const token = localStorage.getItem(AUDIO_ACCESS_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

els.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (button) selectModule(button.dataset.module);
});
els.moduleCards.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (button) selectModule(button.dataset.module);
});
els.overviewHelpButton.addEventListener("click", showOverviewHelp);
els.overviewBackButton.addEventListener("click", () => selectModule("overview"));
els.enableBrowserAudio.addEventListener("click", unlockBrowserAudio);

start();
