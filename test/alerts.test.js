"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin");

test("Console ships the read-only Alerts view without speech output", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "public", "alerts", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "alerts", "index.html"), "utf8");
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(html, /Enable sound on this device/);
  assert.match(app, /sortRecentActivity\(\s*filterRecentActivity/);
  assert.match(app, /right\.time - left\.time/);
  assert.match(app, /left\.index - right\.index/);
  assert.match(app, /\/signalk\/v1\/api\/vessels\/self\/plugins\/ajrmMarineNotifications/);
});

test("Console publishes clamped Alerts display settings", () => {
  const messages = [];
  const plugin = createPlugin({
    handleMessage(_id, message) { messages.push(message); },
    setPluginStatus() {},
  });
  plugin.start({ alertsRefreshIntervalMs: 10, alertsRecentActivityHours: 999 });
  const status = messages[0].updates[0].values[0].value;
  assert.deepEqual(status.alertPanel, {
    refreshIntervalMs: 500,
    recentActivityHours: 168,
  });
  assert.ok(status.modules.some((module) =>
    module.id === "alerts" && module.kind === "internal" && module.url === "./alerts/"
  ));
});
