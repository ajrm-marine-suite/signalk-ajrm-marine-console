(function ajrmMarineConsoleAlertsApp() {
  "use strict";

  const STORAGE_KEYS = {
    layout: "ajrmMarineConsole.alerts.layout",
    fontSize: "ajrmMarineConsole.alerts.fontSize",
  };

  const DEFAULT_REFRESH_MS = 2000;
  const DEFAULT_RECENT_ACTIVITY_HOURS = 12;
  const NOTIFICATIONS_DATA_URL =
    "/signalk/v1/api/vessels/self/plugins/ajrmMarineNotifications";
  const NOTIFICATIONS_STATUS_URL = "/plugins/signalk-ajrm-marine-notifications/status";
  const CONSOLE_STATUS_URL = "/plugins/signalk-ajrm-marine-console/status";

  const state = {
    refreshMs: DEFAULT_REFRESH_MS,
    recentActivityHours: DEFAULT_RECENT_ACTIVITY_HOURS,
    lastSequence: 0,
  };

  const els = {
    connectionStatus: document.getElementById("connectionStatus"),
    selectLayout: document.getElementById("selectLayout"),
    selectFontSize: document.getElementById("selectFontSize"),
    activeCount: document.getElementById("activeCount"),
    recentCount: document.getElementById("recentCount"),
    updatedAt: document.getElementById("updatedAt"),
    activeList: document.getElementById("activeList"),
    recentList: document.getElementById("recentList"),
    versionText: document.getElementById("versionText"),
  };

  init();

  function init() {
    const layout = readStorage(STORAGE_KEYS.layout) || "auto";
    const fontSize = readStorage(STORAGE_KEYS.fontSize) || "normal";
    els.selectLayout.value = layout;
    els.selectFontSize.value = fontSize;
    applyPreferences({ layout, fontSize });

    els.selectLayout.addEventListener("change", () => {
      writeStorage(STORAGE_KEYS.layout, els.selectLayout.value);
      applyPreferences({
        layout: els.selectLayout.value,
        fontSize: els.selectFontSize.value,
      });
    });
    els.selectFontSize.addEventListener("change", () => {
      writeStorage(STORAGE_KEYS.fontSize, els.selectFontSize.value);
      applyPreferences({
        layout: els.selectLayout.value,
        fontSize: els.selectFontSize.value,
      });
    });

    readPluginStatus().finally(refreshLoop);
  }

  async function readPluginStatus() {
    try {
      const status = await fetchJson(CONSOLE_STATUS_URL);
      state.refreshMs = Number(status.alertPanel?.refreshIntervalMs) || DEFAULT_REFRESH_MS;
      state.recentActivityHours =
        Number(status.alertPanel?.recentActivityHours) || DEFAULT_RECENT_ACTIVITY_HOURS;
      els.versionText.textContent = `AJRM Marine Console Alerts v${status.version}`;
    } catch (_error) {
      els.versionText.textContent = "AJRM Marine Alert Panel";
    }
  }

  async function refreshLoop() {
    try {
      const projection = await fetchNotificationsProjection();
      renderProjection(projection);
      setConnection("Live", "live");
    } catch (error) {
      setConnection(error.message || "Unavailable", "error");
    } finally {
      window.setTimeout(refreshLoop, state.refreshMs);
    }
  }

  async function fetchNotificationsProjection() {
    try {
      return signalKValue(await fetchJson(NOTIFICATIONS_DATA_URL), {});
    } catch (_error) {
      return fetchJson(NOTIFICATIONS_STATUS_URL);
    }
  }

  function renderProjection(projection) {
    const active = Array.isArray(projection.active) ? projection.active : [];
    const recentSource = Array.isArray(projection.recentActivity)
      ? projection.recentActivity
      : Array.isArray(projection.history)
        ? projection.history
        : [];
    const recent = sortRecentActivity(
      filterRecentActivity(recentSource, state.recentActivityHours),
    );

    els.activeCount.textContent = String(active.length);
    els.recentCount.textContent = String(recent.length);
    els.updatedAt.textContent = projection.updatedAt
      ? `Updated ${formatTime(projection.updatedAt)}`
      : "Updated now";
    renderList(els.activeList, active, "No active alerts.");
    renderList(els.recentList, recent.slice(0, 20), "No recent activity.");
    state.lastSequence = Number(projection.sequence) || state.lastSequence;
  }

  function filterRecentActivity(entries, hours) {
    const cutoff = Date.now() - Math.max(0.25, Number(hours) || DEFAULT_RECENT_ACTIVITY_HOURS) * 60 * 60 * 1000;
    return entries.filter((entry) => {
      const timestamp = Date.parse(entry.timestamp || entry.updatedAt || entry.createdAt);
      return Number.isNaN(timestamp) || timestamp >= cutoff;
    });
  }

  function sortRecentActivity(entries) {
    return entries
      .map((entry, index) => ({ entry, index, time: activityTime(entry) }))
      .sort((left, right) => {
        if (right.time !== left.time) return right.time - left.time;
        return left.index - right.index;
      })
      .map(({ entry }) => entry);
  }

  function activityTime(entry) {
    const timestamp = Date.parse(entry.timestamp || entry.updatedAt || entry.createdAt);
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  }

  function renderList(container, entries, emptyText) {
    container.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    for (const entry of entries) {
      container.append(alertCard(entry));
    }
  }

  function alertCard(entry) {
    const presentation = entry.presentation || {};
    const priority = entry.priority || {};
    const article = document.createElement("article");
    article.className = `alert-card level-${safeClass(priority.level || presentation.level || "info")}`;

    const stripe = document.createElement("div");
    stripe.className = "stripe";

    const body = document.createElement("div");
    body.className = "alert-body";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.append(
      badge(presentation.label || priority.level || "Alert"),
      badge(formatTime(entry.timestamp || entry.updatedAt)),
    );
    if (presentation.category) meta.append(badge(presentation.category));

    const title = document.createElement("h3");
    title.textContent = presentation.title || entry.subjectKey || "Alert";

    const message = document.createElement("p");
    message.textContent = presentation.message || entry.message || "";

    body.append(meta, title, message);
    article.append(stripe, body);
    return article;
  }

  function badge(text) {
    const element = document.createElement("span");
    element.className = "badge";
    element.textContent = String(text || "");
    return element;
  }

  function applyPreferences({ layout, fontSize }) {
    const resolvedLayout = layout === "auto" ? autoLayout() : layout;
    document.body.classList.toggle("layout-watch", resolvedLayout === "watch");
    document.body.classList.toggle("layout-phone", resolvedLayout === "phone");
    document.body.classList.toggle("layout-tablet", resolvedLayout === "tablet");
    document.body.classList.toggle("font-large", fontSize === "large");
    document.body.classList.toggle("font-xlarge", fontSize === "xlarge");
  }

  function autoLayout() {
    const width = window.innerWidth || 800;
    if (width <= 260) return "watch";
    if (width <= 720) return "phone";
    return "tablet";
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? "Read access required"
        : `HTTP ${response.status}`);
    }
    return response.json();
  }

  function setConnection(text, mode) {
    els.connectionStatus.textContent = text;
    els.connectionStatus.classList.toggle("live", mode === "live");
    els.connectionStatus.classList.toggle("error", mode === "error");
  }

  function signalKValue(data, fallback) {
    if (
      data &&
      typeof data === "object" &&
      Object.prototype.hasOwnProperty.call(data, "value")
    ) {
      return data.value;
    }
    return fallback;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function safeClass(value) {
    return String(value || "info").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Ignore private browsing/local storage failures.
    }
  }

  window.ajrmMarineConsoleAlerts = {
    applyPreferences,
    safeClass,
    sortRecentActivity,
  };
})();
