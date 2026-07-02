"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin");
const {
  TEST_TARGET_MMSI,
  TEST_TARGET_NAME,
  evaluateCollisionAudioSnapshot,
  publishSyntheticEncounter,
  unwrapSignalKLeaf,
} = require("../plugin/bite");

function trafficProjection(state = "alarm") {
  return {
    targets: [{
      id: `vessels.urn:mrn:imo:mmsi:${TEST_TARGET_MMSI}`,
      mmsi: TEST_TARGET_MMSI,
      name: TEST_TARGET_NAME,
      encounter: {
        state,
        silenced: false,
      },
    }],
  };
}

test("BITE evaluation passes when Traffic, Notifications, and Audio align", () => {
  const startedAtMs = Date.now() - 1000;
  const snapshot = {
    traffic: trafficProjection("alarm"),
    trafficAudioPolicy: { muted: false },
    display: {
      contract: "ajrm-marine-display-status",
      enabled: true,
    },
    notifications: {
      active: [{
        priority: { level: "danger" },
        timestamp: new Date().toISOString(),
        delivery: { visual: true },
        presentation: {
          message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
        },
      }],
    },
    notificationsAudio: {
      timestamp: new Date().toISOString(),
      audioRequest: {
        message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      },
    },
    audio: {
      muted: false,
      recentEvents: [{
        ts: new Date().toISOString(),
        event: "queued",
        message: `[priority 900] Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      }],
    },
  };

  const result = evaluateCollisionAudioSnapshot(snapshot, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.result, "pass");
  assert.equal(result.assertions.every((item) => item.pass), true);
});

test("BITE target MMSI is a collision-capable vessel, not an AtoN or base station", () => {
  assert.doesNotMatch(TEST_TARGET_MMSI, /^99\d{7}$/);
  assert.doesNotMatch(TEST_TARGET_MMSI, /^00\d{7}$/);
  assert.match(TEST_TARGET_MMSI, /^\d{9}$/);
});

test("BITE unwraps Signal K leaf values returned by getSelfPath", () => {
  const projection = trafficProjection("alarm");
  assert.equal(unwrapSignalKLeaf({ value: projection, timestamp: new Date().toISOString() }), projection);
  assert.equal(unwrapSignalKLeaf(projection), projection);
  assert.equal(unwrapSignalKLeaf(null), null);
});

test("BITE evaluation fails when Traffic alerts but Audio has no matching event", () => {
  const startedAtMs = Date.now() - 1000;
  const result = evaluateCollisionAudioSnapshot({
    traffic: trafficProjection("alarm"),
    trafficAudioPolicy: { muted: false },
    display: {
      contract: "ajrm-marine-display-status",
      enabled: true,
    },
    notifications: {
      active: [{
        priority: { level: "danger" },
        timestamp: new Date().toISOString(),
        delivery: { visual: true },
        presentation: {
          message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
        },
      }],
    },
    notificationsAudio: null,
    audio: { muted: false, recentEvents: [] },
  }, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.result, "fail");
  assert.equal(result.assertions.find((item) => item.id === "traffic-alert").pass, true);
  assert.equal(result.assertions.find((item) => item.id === "audio-accepted").pass, false);
});

test("BITE publishes synthetic own-vessel and target deltas", () => {
  const messages = [];
  const app = {
    handleMessage(id, message) {
      messages.push({ id, message });
    },
  };

  publishSyntheticEncounter(app, {
    pluginId: "signalk-ajrm-marine-console",
    runId: "test-run",
    quiet: false,
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].message.context, "vessels.self");
  assert.equal(messages[1].message.context, `vessels.urn:mrn:imo:mmsi:${TEST_TARGET_MMSI}`);
  assert.ok(messages[1].message.updates[0].$source.startsWith("ajrm-marine-bite-"));
  assert.ok(messages[1].message.updates[0].values.some((item) =>
    item.path === "" && item.value.name === TEST_TARGET_NAME && item.value.mmsi === TEST_TARGET_MMSI
  ));
});

test("Console exposes BITE status and run routes", async () => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajrm-console-bite-"));
  process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR = reportsDir;
  const startedAtMs = Date.now();
  const values = {
    "plugins.ajrmMarineTraffic.targets": trafficProjection("alarm"),
    "plugins.ajrmMarineTraffic.audioPolicy": { muted: false },
    "plugins.ajrmMarineDisplay": {
      contract: "ajrm-marine-display-status",
      enabled: true,
    },
    "plugins.ajrmMarineNotifications": {
      active: [{
        priority: { level: "danger" },
        timestamp: new Date(startedAtMs).toISOString(),
        delivery: { visual: true },
        presentation: { message: `Collision alarm. ${TEST_TARGET_NAME}.` },
      }],
    },
    "plugins.ajrmMarineNotifications.audio": {
      timestamp: new Date(startedAtMs).toISOString(),
      audioRequest: { message: `Collision alarm. ${TEST_TARGET_NAME}.` },
    },
    "plugins.ajrmMarineAudio": {
      muted: false,
      recentEvents: [{
        ts: new Date(startedAtMs).toISOString(),
        event: "queued",
        message: `Collision alarm. ${TEST_TARGET_NAME}.`,
      }],
    },
  };
  const app = {
    getSelfPath(path) {
      return values[path] || null;
    },
    handleMessage() {},
    setPluginStatus() {},
  };
  const plugin = createPlugin(app);
  plugin.start({});
  const routes = new Map();
  const router = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path, handler) {
      routes.set(`POST ${path}`, handler);
    },
  };
  plugin.signalKApiRoutes(router);

  let statusBody;
  routes.get("GET /ajrmMarineConsole/bite/status")({}, {
    set() {},
    json(value) {
      statusBody = value;
    },
  });
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.running, false);
  assert.equal(Array.isArray(statusBody.tests), true);
  assert.equal(statusBody.tests[0].number, 1);

  let statusCode = 0;
  let runBody;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { timeoutSeconds: 5 } },
    {
      set() {},
      status(code) {
        statusCode = code;
      },
      json(value) {
        runBody = value;
      },
    },
  );
  assert.equal(statusCode, 200);
  assert.equal(runBody.ok, true);
  assert.equal(runBody.scenario, "collision-audio-chain");
  assert.equal(runBody.consoleVersion, require("../package.json").version);
  assert.ok(fs.readdirSync(reportsDir).some((name) => name.endsWith(".json")));

  values["plugins.ajrmMarineTraffic.audioPolicy"] = { muted: true };
  values["plugins.ajrmMarineAudio"] = {
    muted: true,
    recentEvents: [{
      ts: new Date().toISOString(),
      event: "accepted",
      message: `Collision alarm. ${TEST_TARGET_NAME}.`,
    }],
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { timeoutSeconds: 5 } },
    {
      set() {},
      status(code) {
        statusCode = code;
      },
      json(value) {
        runBody = value;
      },
    },
  );
  assert.equal(statusCode, 200);
  assert.equal(runBody.ok, false);
  assert.match(runBody.summary, /mute-explicit/);

  delete process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR;
  fs.rmSync(reportsDir, { recursive: true, force: true });
});
