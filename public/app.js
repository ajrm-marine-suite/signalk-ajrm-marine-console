"use strict";

const CONSOLE_STATUS_URL = "/signalk/v1/api/ajrmMarineConsole/status";
const BITE_STATUS_URL = "/signalk/v1/api/ajrmMarineConsole/bite/status";
const BITE_RUN_URL = "/signalk/v1/api/ajrmMarineConsole/bite/run";
const BITE_RUN_ALL_URL = "/signalk/v1/api/ajrmMarineConsole/bite/run-all";
const AUDIO_STATUS_URL = "/signalk/v1/api/ajrmMarineAudio/status";
const ACTIVE_MODULE_KEY = "ajrmMarineConsole.activeModule";
const AUDIO_ACCESS_TOKEN_STORAGE_KEY = "ajrmMarineAudio.accessToken";
const BROWSER_OUTPUT_MODE_STORAGE_KEY = "ajrmMarineAudio.browserOutputMode";
const BROWSER_OUTPUT_STORAGE_KEY = "ajrmMarineAudio.browserOutput";
const BROWSER_AUDIO_REFRESH_MS = 2000;
const BROWSER_AUDIO_AUTH_RETRY_MS = 60000;
const BITE_STATUS_REFRESH_MS = 1000;
const SILENT_AUDIO_DATA_URL =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
let activeFrame = null;
let consoleStatus = null;
let lastConsoleAudioUrl = "";
let lastConsoleAnnouncementKey = "";
let lastConsoleSpeechKey = "";
let seenConsoleAnnouncementKeys = new Set();
let browserAudioStarted = false;
let browserAudioUnlocked = false;
let browserAudioUnlocking = false;
let firstBrowserAudioRefresh = true;
let nextBrowserAudioRefreshAt = 0;
let biteStatus = null;
let biteResults = {};
let biteRunning = false;
let biteRunningTestId = null;
let biteStatusPollTimer = null;

const els = {
  version: document.getElementById("version"),
  connection: document.getElementById("connection"),
  enableBrowserAudio: document.getElementById("enableBrowserAudio"),
  tabs: document.getElementById("tabs"),
  overview: document.getElementById("overview"),
  biteDashboard: document.getElementById("biteDashboard"),
  overviewHelp: document.getElementById("overviewHelp"),
  overviewHelpButton: document.getElementById("overviewHelpButton"),
  overviewBackButton: document.getElementById("overviewBackButton"),
  frameHost: document.getElementById("frameHost"),
  frameMessage: document.getElementById("frameMessage"),
  moduleCards: document.getElementById("moduleCards"),
  biteRunAll: document.getElementById("biteRunAll"),
  biteTests: document.getElementById("biteTests"),
  biteLog: document.getElementById("biteLog"),
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
    refreshBiteStatus();
    startBrowserAudioHost();
  } catch (error) {
    setConnection(false, error.message);
    els.overview.hidden = false;
  }
}

async function refreshBiteStatus() {
  try {
    biteStatus = await jsonRequest(BITE_STATUS_URL);
    for (const report of biteStatus.currentRunAll?.reports || []) {
      biteResults[report.testId || report.scenario] = report;
    }
    renderBitePanel();
  } catch (error) {
    renderBiteError(error);
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
  const overviewApps =
    Array.isArray(consoleStatus.suiteApps) && consoleStatus.suiteApps.length
      ? consoleStatus.suiteApps
      : consoleStatus.modules.filter((module) => module.kind === "webapp");
  els.moduleCards.innerHTML = overviewApps
    .map(
      (module) =>
        moduleCardHtml(module),
    )
    .join("") || '<p class="empty-note">No webapps are selected. Choose installed Signal K webapps in the AJRM Marine Console plugin configuration.</p>';
}

function renderBitePanel() {
  const tests = biteTests();
  const enabledTests = tests.filter((test) => test.enabled !== false);
  els.biteRunAll.disabled = biteRunning || enabledTests.length === 0;
  els.biteTests.innerHTML = tests.map((test) => biteTestHtml(test)).join("")
    || '<p class="empty-note">No BITE tests are available.</p>';
  if (!els.biteLog.value || els.biteLog.value === "BITE has not run yet.") {
    els.biteLog.value = biteStatus?.lastReport
      ? formatBiteReport(biteStatus.lastReport)
      : "BITE has not run yet.";
  }
}

function biteTests() {
  if (Array.isArray(biteStatus?.tests) && biteStatus.tests.length) return biteStatus.tests;
  return [
    {
      id: "preflight-safety",
      number: 0,
      title: "Pre-test safety isolation",
      description: "Checks that simulator output and live feeds are not active before BITE injects test data.",
      timeoutSeconds: 5,
    },
    {
      id: "collision-audio-chain",
      number: 1,
      title: "Collision visual/audio chain",
      description: "Checks Traffic, Display, Notifications, and Audio all react to a temporary crossing target.",
      timeoutSeconds: 45,
    },
  ];
}

function biteTestHtml(test) {
  const result = biteResults[test.id] || null;
  const currentTestId = biteStatus?.currentRunAll?.currentTestId || biteRunningTestId || null;
  const available = test.enabled !== false;
  const state = !available
    ? "disabled"
    : result
    ? result.ok
      ? "pass"
      : "fail"
    : biteRunning && currentTestId === test.id
      ? "running"
      : "pending";
  const stateLabel = {
    pending: "Not run",
    running: "Running",
    pass: "Pass",
    fail: "Fail",
    disabled: "Disabled",
  }[state];
  const summary = state === "disabled"
    ? test.disabledReason || "This optional test is disabled because the plugin is not installed."
    : state === "running"
    ? "Running now..."
    : result?.summary || test.description || "";
  return `<article class="bite-test ${state}">
    <div class="bite-light" aria-label="${escapeHtml(stateLabel)}"></div>
    <div class="bite-test-main">
      <strong>${biteTestNumber(test)} ${escapeHtml(test.title || test.id)}</strong>
      <span>${escapeHtml(summary)}</span>
    </div>
    <button class="bite-run" type="button" data-bite-test="${escapeHtml(test.id)}" ${biteRunning || !available ? "disabled" : ""}>Run</button>
  </article>`;
}

function renderBiteError(error) {
  els.biteTests.innerHTML = '<p class="empty-note">BITE status is unavailable.</p>';
  els.biteLog.value = `BITE status failed: ${error.message}`;
}

async function runBiteTest(testId) {
  const test = biteTests().find((candidate) => candidate.id === testId) || {};
  if (test.enabled === false) {
    els.biteLog.value = test.disabledReason || `BITE ${testId} is disabled because its optional plugin is not installed.`;
    renderBitePanel();
    return;
  }
  biteRunning = true;
  biteRunningTestId = testId;
  els.biteLog.value = `Running BITE ${biteTestNumber(test)} ${test.title || testId}...`;
  renderBitePanel();
  try {
    const report = await jsonRequest(BITE_RUN_URL, {
      method: "POST",
      body: JSON.stringify({
        testId,
        timeoutSeconds: test.timeoutSeconds || 45,
      }),
    });
    biteResults[testId] = report;
    els.biteLog.value = formatBiteReport(report);
  } catch (error) {
    if (error.body?.contract === "ajrm-marine-console-bite-report") {
      biteResults[testId] = error.body;
      els.biteLog.value = formatBiteReport(error.body);
    } else {
      biteResults[testId] = { ok: false, summary: error.message };
      els.biteLog.value = `BITE ${testId} failed to run: ${error.message}`;
    }
  } finally {
    biteRunning = false;
    biteRunningTestId = null;
    await refreshBiteStatus();
    renderBitePanel();
  }
}

async function runAllBiteTests() {
  biteRunning = true;
  biteRunningTestId = null;
  biteResults = {};
  els.biteLog.value = "Running BITE pre-test checks...";
  renderBitePanel();
  startBiteStatusPolling();
  try {
    const report = await jsonRequest(BITE_RUN_ALL_URL, {
      method: "POST",
      body: JSON.stringify({}),
    });
    for (const child of report.reports || []) {
      biteResults[child.testId || child.scenario] = child;
    }
    biteResults["run-all"] = report;
    els.biteLog.value = formatBiteReport(report);
  } catch (error) {
    if (error.body?.contract === "ajrm-marine-console-bite-run-all-report") {
      for (const child of error.body.reports || []) {
        biteResults[child.testId || child.scenario] = child;
      }
      biteResults["run-all"] = error.body;
      els.biteLog.value = formatBiteReport(error.body);
    } else {
      els.biteLog.value = `BITE run all failed to run: ${error.message}`;
    }
  } finally {
    biteRunning = false;
    biteRunningTestId = null;
    stopBiteStatusPolling();
    await refreshBiteStatus();
    renderBitePanel();
  }
}

function startBiteStatusPolling() {
  stopBiteStatusPolling();
  biteStatusPollTimer = window.setInterval(() => {
    refreshBiteStatus();
  }, BITE_STATUS_REFRESH_MS);
}

function stopBiteStatusPolling() {
  if (!biteStatusPollTimer) return;
  window.clearInterval(biteStatusPollTimer);
  biteStatusPollTimer = null;
}

function biteTestNumber(test) {
  const number = Number(test?.number);
  return Number.isFinite(number) ? String(number).padStart(2, "0") : "--";
}

function formatBiteReport(report) {
  const lines = [
    `${report.ok ? "PASS" : "FAIL"} ${report.scenario || report.testId || "BITE"}`,
    report.summary || "",
    report.startedAt && report.finishedAt
      ? `Started ${report.startedAt}; finished ${report.finishedAt}; duration ${report.durationSeconds || 0} s`
      : "",
    "",
    "Assertions:",
  ].filter((line) => line !== "");
  for (const assertion of report.assertions || []) {
    lines.push(`${assertion.pass ? "PASS" : "FAIL"} ${assertion.id}: ${assertion.message}`);
  }
  if (Array.isArray(report.observations) && report.observations.length) {
    lines.push("", "Recent observations:");
    for (const observation of report.observations.slice(-6)) {
      lines.push(formatBiteObservation(observation));
    }
  }
  if (report.capture) {
    lines.push("", "Capture:");
    lines.push(report.capture.started ? "started: yes" : "started: no");
    if (report.capture.comment) lines.push(`comment: ${report.capture.comment}`);
    const bundle = report.capture.stop?.fileName || report.capture.stop?.bundle?.fileName;
    if (bundle) lines.push(`bundle: ${bundle}`);
    if (report.capture.error) lines.push(`error: ${report.capture.error}`);
  }
  if (Array.isArray(report.reports) && report.reports.length) {
    lines.push("", "Child reports:");
    for (const child of report.reports) {
      lines.push(`${child.ok ? "PASS" : "FAIL"} ${child.testId || child.scenario}: ${child.summary || ""}`);
      for (const assertion of child.assertions || []) {
        if (!assertion.pass) lines.push(`  FAIL ${assertion.id}: ${assertion.message}`);
      }
      if (!child.ok && Array.isArray(child.observations) && child.observations.length) {
        for (const observation of child.observations.slice(0, 4)) {
          lines.push(`  ${formatBiteObservation(observation)}`);
        }
      }
    }
  }
  if (report.snapshot) {
    lines.push("", "Snapshot:", JSON.stringify(report.snapshot, null, 2));
  }
  return lines.join("\n");
}

function formatBiteObservation(observation) {
  if (observation.path) {
    return [
      observation.path,
      observation.source ? `source ${observation.source}` : "",
      observation.ageSeconds != null ? `${observation.ageSeconds} s old` : "",
      observation.valueSummary || "",
    ].filter(Boolean).join(" - ");
  }
  return `${observation.ts || ""} ${observation.trafficState || ""} ${observation.audioState || ""} ${observation.message || ""}`.trim();
}

function moduleCardHtml(module) {
  const installed = module.installed !== false;
  const selected = module.selected !== false;
  const role = module.role === "core" ? "Core" : module.groupLabel || "Optional";
  const state = installed
    ? selected
      ? "Installed"
      : "Installed - enable tab in settings"
    : "Not installed";
  const classes = [
    "module-card",
    installed ? "installed" : "missing",
    selected ? "selected" : "not-selected",
  ].join(" ");
  const attrs = selected
    ? `data-module="${escapeHtml(module.id)}"`
    : `aria-disabled="${installed ? "false" : "true"}"`;
  return `<button class="${classes}" type="button" ${attrs}><strong>${escapeHtml(module.icon)} ${escapeHtml(module.title)}</strong><span>${escapeHtml(module.description)}</span><small>${escapeHtml([role, state, module.version ? `v${module.version}` : ""].filter(Boolean).join(" · "))}</small></button>`;
}

function selectModule(id) {
  const module = consoleStatus.modules.find((candidate) => candidate.id === id);
  if (!module) return;
  localStorage.setItem(ACTIVE_MODULE_KEY, id);
  for (const tab of els.tabs.querySelectorAll("[data-module]")) {
    tab.classList.toggle("active", tab.dataset.module === id);
  }
  if (module.kind === "native") {
    els.overview.hidden = module.id !== "overview";
    els.biteDashboard.hidden = module.id !== "bite";
    els.overviewHelp.hidden = true;
    els.frameHost.hidden = true;
    unloadActiveFrame();
    return;
  }
  els.overview.hidden = true;
  els.biteDashboard.hidden = true;
  els.overviewHelp.hidden = true;
  els.frameHost.hidden = false;
  showFrame(module);
}

function showOverviewHelp() {
  els.overview.hidden = true;
  els.biteDashboard.hidden = true;
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
    /(?:ajrm marine )?audio/i.test(module.title || "")
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
    const error = new Error(body.error || body.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
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
  refreshBrowserAudio({ force: true });
  window.setInterval(refreshBrowserAudio, BROWSER_AUDIO_REFRESH_MS);
}

async function refreshBrowserAudio({ force = false } = {}) {
  if (!force && Date.now() < nextBrowserAudioRefreshAt) return;
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
    nextBrowserAudioRefreshAt = 0;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      nextBrowserAudioRefreshAt = Date.now() + BROWSER_AUDIO_AUTH_RETRY_MS;
    }
    return;
  }
  const announcements = browserAudioAnnouncements(status);
  if (firstBrowserAudioRefresh) {
    const latest = announcements.at(-1) || {};
    const latestMessage = String(latest.message || "").trim();
    lastConsoleAudioUrl = latest.audioUrl || latest.publicAudioUrl || "";
    lastConsoleAnnouncementKey = consoleAnnouncementKey(latest, latestMessage);
    lastConsoleSpeechKey = consoleSpeechKey(latestMessage, latest);
    rememberConsoleAnnouncements(announcements);
    firstBrowserAudioRefresh = false;
    return;
  }
  for (const announcement of announcements) {
    if (status.muted === true && announcement.force !== true) continue;
    const message = String(announcement.message || "").trim();
    if (!message) continue;
    const announcementKey = consoleAnnouncementKey(announcement, message);
    if (seenConsoleAnnouncementKeys.has(announcementKey)) continue;
    rememberConsoleAnnouncementKey(announcementKey);
    if (mode === "piper") playConsolePiperAudio(announcement.audioUrl || announcement.publicAudioUrl || "", announcementKey);
    if (mode === "speech") speakConsoleMessage(message, announcement);
  }
}

function browserAudioAnnouncements(status = {}) {
  if (Array.isArray(status.recentAnnouncements) && status.recentAnnouncements.length) {
    return status.recentAnnouncements;
  }
  return status.lastAnnouncement ? [status.lastAnnouncement] : [];
}

function browserOutputMode() {
  const storedMode = localStorage.getItem(BROWSER_OUTPUT_MODE_STORAGE_KEY);
  if (["off", "speech", "piper"].includes(storedMode)) return storedMode;
  return localStorage.getItem(BROWSER_OUTPUT_STORAGE_KEY) === "true" ? "piper" : "off";
}

function playConsolePiperAudio(audioUrl, announcementKey = audioUrl) {
  if (!audioUrl) return;
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
  lastConsoleSpeechKey = speechKey;
  speech.speak(new Utterance(message));
  browserAudioUnlocked = true;
  renderBrowserAudioButton(browserOutputMode());
}

function consoleSpeechKey(message, announcement = {}) {
  return consoleAnnouncementKey(announcement, message);
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

function rememberConsoleAnnouncements(announcements = []) {
  for (const announcement of announcements) {
    const message = String(announcement?.message || "").trim();
    rememberConsoleAnnouncementKey(consoleAnnouncementKey(announcement || {}, message));
  }
}

function rememberConsoleAnnouncementKey(key) {
  if (!key) return;
  seenConsoleAnnouncementKeys.add(key);
  if (seenConsoleAnnouncementKeys.size > 80) {
    seenConsoleAnnouncementKeys = new Set([...seenConsoleAnnouncementKeys].slice(-60));
  }
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
els.biteTests.addEventListener("click", (event) => {
  const button = event.target.closest("[data-bite-test]");
  if (button) runBiteTest(button.dataset.biteTest);
});
els.biteRunAll.addEventListener("click", runAllBiteTests);
els.overviewHelpButton.addEventListener("click", showOverviewHelp);
els.overviewBackButton.addEventListener("click", () => selectModule("overview"));
els.enableBrowserAudio.addEventListener("click", unlockBrowserAudio);

start();
