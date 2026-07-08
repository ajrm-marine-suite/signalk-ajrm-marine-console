"use strict";

const tabs = Array.from(document.querySelectorAll("#helpTabs .nav-link"));
const panes = Array.from(document.querySelectorAll("#helpTabContent .tab-pane"));
const settingsTab = document.getElementById("help-current-settings-tab");
const settingsStatus = document.getElementById("helpSettingsStatus");
const settingsContent = document.getElementById("helpSettingsContent");
const refreshButton = document.getElementById("buttonRefreshHelpSettings");
const PROFILE_KEYS = ["anchor", "harbor", "coastal", "offshore"];
const SIZE_KEYS = ["small", "medium", "large"];
const PROFILE_LABELS = {
  anchor: "Anchored",
  harbor: "Harbour",
  coastal: "Coastal",
  offshore: "Offshore",
};
const SIZE_LABELS = { small: "Small", medium: "Medium", large: "Large" };
const DEFAULT_REPEAT_INTERVALS = {
  alert: 180,
  warning: 180,
  alarm: 60,
  emergency: 30,
};

function selectHelpTab(button) {
  const target = button.getAttribute("data-bs-target");
  for (const tab of tabs) {
    const selected = tab === button;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  for (const pane of panes) {
    pane.classList.toggle("active", `#${pane.id}` === target);
  }
  if (button === settingsTab) loadCurrentSettings();
}

async function loadCurrentSettings() {
  if (!settingsStatus || !settingsContent) return;
  settingsStatus.textContent = "Loading…";
  try {
    const [uiState, profiles, repeatIntervals] = await Promise.all([
      getJson("/signalk/v1/api/ajrmMarineDisplay/uiState"),
      getJson("/signalk/v1/api/ajrmMarineDisplay/getCollisionProfiles"),
      getJson("/signalk/v1/api/ajrmMarineDisplay/repeatIntervals").catch(() => ({})),
    ]);
    settingsContent.innerHTML = currentSettingsHtml(
      uiState,
      profiles,
      repeatIntervals,
    );
    settingsStatus.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    settingsContent.innerHTML = "";
    settingsStatus.textContent = `Unable to load current settings: ${error.message}`;
  }
}

function currentSettingsHtml(uiState = {}, profiles = {}, repeatIntervals = {}) {
  const auto = uiState.autoProfileStatus || {};
  const speech = uiState.speechOutput || {};
  const health = uiState.dataHealth || {};
  const profile = uiState.currentProfile || profiles.current || "harbor";
  const repeats = { ...DEFAULT_REPEAT_INTERVALS, ...repeatIntervals };
  const profileRows = [];

  for (const profileKey of PROFILE_KEYS) {
    const settings = profiles[profileKey] || {};
    const cpaSensitivity = finite(settings.cpaSensitivity, 1);
    const tcpaLookahead = finite(settings.tcpaLookahead, 1);
    const repeatSensitivity = finite(settings.repeatSensitivity, 1);
    const activeClass = profileKey === profile ? ' class="table-active"' : "";

    profileRows.push(`
      <tr${activeClass}>
        <td>${escapeHtml(profileLabel(profileKey))}</td>
        <td>All</td><td>Watch</td><td>—</td><td>—</td>
        <td>${escapeHtml(formatDuration(scaledRepeat(repeats.alert, repeatSensitivity)))}</td>
        <td>—</td>
      </tr>`);

    for (const size of SIZE_KEYS) {
      for (const level of ["warning", "danger"]) {
        const criteria = criteriaForSize(settings[level], size);
        const repeatText =
          level === "warning"
            ? `Advisory ${formatDuration(scaledRepeat(repeats.warning, repeatSensitivity))}`
            : `Alarm ${formatDuration(scaledRepeat(repeats.alarm, repeatSensitivity))}; emergency ${formatDuration(scaledRepeat(repeats.emergency, repeatSensitivity))}`;
        profileRows.push(`
          <tr${activeClass}>
            <td>${escapeHtml(profileLabel(profileKey))}</td>
            <td>${escapeHtml(SIZE_LABELS[size])}</td>
            <td>${level === "warning" ? "Advisory" : "Alarm"}</td>
            <td>${escapeHtml(formatDistanceMeters(criteria.cpa * cpaSensitivity))}</td>
            <td>${escapeHtml(formatMinutes(criteria.tcpa * tcpaLookahead))}</td>
            <td>${escapeHtml(repeatText)}</td>
            <td>${escapeHtml(formatSpeed(criteria.speed))}</td>
          </tr>`);
      }
    }
  }

  const vesselSize = profiles.vesselSize || {};
  return `
    <div class="row mb-3">
      ${settingCard("Active profile", [
        ["Current profile", profileLabel(profile)],
        ["Auto Profile", auto.enabled ? "On" : "Off"],
        ["Auto status", auto.message || "Unavailable"],
      ])}
      ${settingCard("Vessel size categories", [
        ["Small up to", formatMeters(vesselSize.smallMaxLengthMeters)],
        ["Medium up to", formatMeters(vesselSize.mediumMaxLengthMeters)],
        ["Unknown length", SIZE_LABELS[vesselSize.unknownLengthCategory] || "Small"],
      ])}
      ${settingCard("Sound policy", [
        ["Sounds", speech.muted ? "Muted" : "Enabled"],
        ["Stationary automute", speech.automuteStationary ? "On" : "Off"],
        ["Threshold", `${finite(speech.automuteStationarySpeed, 0.35)} m/s`],
        ["Status", speech.muteStatus || "Unavailable"],
      ])}
      ${settingCard("Data health", [
        ["State", health.state || "Unknown"],
        ["Position", health.positionValid ? "Valid" : "Unavailable"],
        ["Position age", Number.isFinite(Number(health.positionAgeSeconds)) ? `${health.positionAgeSeconds} sec` : "Unknown"],
      ])}
      ${settingCard("Active profile sensitivity", [
        ["CPA", percent(profiles?.[profile]?.cpaSensitivity)],
        ["TCPA lookahead", percent(profiles?.[profile]?.tcpaLookahead)],
        ["Repeat", percent(profiles?.[profile]?.repeatSensitivity)],
      ])}
      ${settingCard("Harbour switching", [
        ["Inside profile", profileLabel(auto.options?.harbourProfile || "harbor")],
        ["Outside profile", profileLabel(auto.options?.outsideProfile || "coastal")],
        ["Enter distance", formatMeters(auto.options?.enterDistanceMeters)],
        ["Leave distance", formatMeters(auto.options?.exitDistanceMeters)],
        ["Anchor release", formatSpeedMps(auto.options?.anchorReleaseSpeed)],
      ])}
    </div>

    <h6>CPA and TCPA Limits</h6>
    <p class="text-body-secondary small">
      The active profile is highlighted. Values include each profile's current
      CPA, TCPA and repeat sensitivity.
    </p>
    <div class="table-responsive ajrm-marine-help-table-scroll mb-3">
      <table>
        <thead><tr>
          <th>Profile</th><th>Vessel</th><th>Level</th><th>CPA</th>
          <th>TCPA</th><th>Repeat interval</th><th>Ignore below</th>
        </tr></thead>
        <tbody>${profileRows.join("")}</tbody>
      </table>
    </div>`;
}

function settingCard(title, rows) {
  return `<div class="col-md-6"><div class="border rounded p-3 h-100"><h6>${escapeHtml(title)}</h6><dl>${rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl></div></div>`;
}

async function getJson(path) {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "Unavailable";
}

function profileLabel(value) {
  return PROFILE_LABELS[value] || value || "Unknown";
}

function criteriaForSize(criteria = {}, size) {
  return {
    cpa: finite(criteria.bySize?.[size]?.cpa, finite(criteria.cpa)),
    tcpa: finite(criteria.bySize?.[size]?.tcpa, finite(criteria.tcpa)),
    speed: finite(criteria.bySize?.[size]?.speed, finite(criteria.speed)),
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scaledRepeat(seconds, sensitivity) {
  return sensitivity > 0 ? finite(seconds) / sensitivity : 0;
}

function formatDuration(seconds) {
  const value = Math.round(finite(seconds));
  if (value <= 0) return "Off";
  return value < 60 ? `${value} sec` : `${Math.round(value / 60)} min`;
}

function formatMinutes(seconds) {
  const value = Math.round(finite(seconds) / 60);
  return value > 0 ? `${value} min` : "Off";
}

function formatDistanceMeters(value) {
  const metres = finite(value);
  if (metres <= 0) return "Off";
  return metres < 1852
    ? `${Math.round(metres)} m`
    : `${Number((metres / 1852).toFixed(2))} NM`;
}

function formatMeters(value) {
  const metres = finite(value);
  return metres > 0 ? `${Math.round(metres)} m` : "Off";
}

function formatSpeed(value) {
  const knots = finite(value);
  return knots > 0 ? `${Number(knots.toFixed(1))} kn` : "Off";
}

function formatSpeedMps(value) {
  const mps = finite(value);
  return mps > 0
    ? `${Number((mps / 0.514444).toFixed(1))} kn (${Number(mps.toFixed(3))} m/s)`
    : "Off";
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

for (const tab of tabs) tab.addEventListener("click", () => selectHelpTab(tab));
refreshButton?.addEventListener("click", loadCurrentSettings);
