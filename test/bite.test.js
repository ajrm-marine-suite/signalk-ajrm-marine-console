"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin");
const packageInfo = require("../package.json");
const {
  TEST_TARGET_MMSI,
  TEST_TARGET_NAME,
  evaluateCollisionAudioSnapshot,
  evaluateQuietTargetSnapshot,
  publishSyntheticEncounter,
  unwrapSignalKLeaf,
} = require("../plugin/bite");

function trafficProjection(state = "alarm") {
  return {
    contract: "ajrm-marine-traffic-targets",
    contractVersion: 1,
    sessionId: "traffic-session",
    sequence: 1,
    mode: "traffic",
    authoritative: true,
    profile: "coastal",
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

test("BITE evaluation accepts muted audio when skipped evidence follows accepted timeline", () => {
  const startedAtMs = Date.now() - 1000;
  const result = evaluateCollisionAudioSnapshot({
    traffic: trafficProjection("alarm"),
    trafficAudioPolicy: { muted: true },
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
      muted: true,
      timeline: {
        event: {
          occurredAt: new Date().toISOString(),
          state: "accepted",
          message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
        },
      },
      recentEvents: [{
        ts: new Date().toISOString(),
        event: "skipped",
        message: `Muted: Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      }],
    },
  }, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.result, "pass");
  assert.equal(result.assertions.find((item) => item.id === "mute-explicit").pass, true);
});

test("BITE evaluation rejects stale audio evidence for a fresh collision", () => {
  const startedAtMs = Date.now();
  const stale = new Date(startedAtMs - 60_000).toISOString();
  const fresh = new Date(startedAtMs + 10).toISOString();
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
        timestamp: fresh,
        delivery: { visual: true },
        presentation: {
          message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
        },
      }],
    },
    notificationsAudio: {
      timestamp: stale,
      audioRequest: {
        message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      },
    },
    audio: {
      muted: false,
      recentEvents: [{
        ts: stale,
        event: "queued",
        message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      }],
    },
  }, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.result, "fail");
  assert.equal(result.assertions.find((item) => item.id === "traffic-alert").pass, true);
  assert.equal(result.assertions.find((item) => item.id === "display-alert").pass, true);
  assert.equal(result.assertions.find((item) => item.id === "audio-accepted").pass, false);
});

test("BITE evaluation accepts broker-only audio delivery while renderer is catching up", () => {
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
    notificationsAudio: {
      contract: "notifications-plus-audio-delivery",
      updatedAt: new Date().toISOString(),
      audioRequest: {
        message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      },
    },
    audio: {
      muted: false,
      recentEvents: [],
    },
  }, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.assertions.find((item) => item.id === "notifications-audio").pass, true);
  assert.equal(result.assertions.find((item) => item.id === "audio-accepted").pass, false);
  assert.equal(result.result, "fail");
});

test("BITE evaluation fails when display-facing alert evidence is missing", () => {
  const startedAtMs = Date.now() - 1000;
  const result = evaluateCollisionAudioSnapshot({
    traffic: trafficProjection("alarm"),
    trafficAudioPolicy: { muted: false },
    display: {
      contract: "ajrm-marine-display-status",
      enabled: true,
    },
    notifications: { active: [] },
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
        message: `Collision alarm. Large vessel ${TEST_TARGET_NAME}.`,
      }],
    },
  }, {
    startedAtMs,
    targetName: TEST_TARGET_NAME,
    targetMmsi: TEST_TARGET_MMSI,
  });

  assert.equal(result.result, "fail");
  assert.equal(result.assertions.find((item) => item.id === "display-alert").pass, false);
});

test("BITE quiet target evaluation detects false visual or audio leakage", () => {
  const startedAtMs = Date.now() - 1000;
  const result = evaluateQuietTargetSnapshot({
    traffic: {
      targets: [],
    },
    notifications: {
      active: [{
        priority: { level: "danger" },
        timestamp: new Date().toISOString(),
        delivery: { visual: true },
        presentation: {
          message: "Collision alarm. BITE QUIET TARGET.",
        },
      }],
    },
    notificationsAudio: null,
    audio: {
      recentEvents: [{
        ts: new Date().toISOString(),
        event: "queued",
        message: "Collision alarm. BITE QUIET TARGET.",
      }],
    },
  }, {
    startedAtMs,
    targetName: "BITE QUIET TARGET",
    targetMmsi: "235912346",
  });

  assert.equal(result.result, "fail");
  assert.equal(result.assertions.find((item) => item.id === "no-display-alert").pass, false);
  assert.equal(result.assertions.find((item) => item.id === "no-audio-alert").pass, false);
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
  process.env.AJRM_MARINE_BITE_CAPTURE_START_SETTLE_MS = "0";
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajrm-console-bite-"));
  process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR = reportsDir;
  const startedAtMs = Date.now();
  const trafficAudioPolicy = {
    contract: "ajrm-marine-traffic-audio-policy",
    contractVersion: 1,
    sessionId: "traffic-session",
    sequence: 7,
    correlationId: "traffic-policy-1",
    mode: "traffic",
    authoritative: true,
    muted: false,
    automuteStationary: true,
    automuteAllowed: false,
    automaticMuteActive: false,
    manualOverride: false,
    profile: "coastal",
    status: "Sound enabled.",
  };
  const values = {
    "plugins.ajrmMarineTraffic.targets": trafficProjection("alarm"),
    "plugins.ajrmMarineTraffic.audioPolicy": trafficAudioPolicy,
    "plugins.ajrmMarineDisplay": {
      contract: "ajrm-marine-display-status",
      contractVersion: 1,
      sessionId: "display-session",
      sequence: 1,
      enabled: true,
    },
    "plugins.ajrmMarineNotifications": {
      contract: "notifications-plus-projection",
      contractVersion: 1,
      sessionId: "notifications-session",
      sequence: 1,
      history: [],
      recentActivity: [],
      audioSequence: 1,
      active: [{
        priority: { level: "danger" },
        timestamp: new Date(startedAtMs).toISOString(),
        delivery: { visual: true },
        presentation: { message: `Collision alarm. ${TEST_TARGET_NAME}.` },
      }],
    },
    "plugins.ajrmMarineNotifications.audio": {
      contract: "notifications-plus-audio-delivery",
      contractVersion: 1,
      sessionId: "notifications-session",
      sequence: 1,
      audioSequence: 1,
      timestamp: new Date(startedAtMs).toISOString(),
      audioRequest: { message: `Collision alarm. ${TEST_TARGET_NAME}.` },
    },
    "plugins.ajrmMarineAudio": {
      contract: "ajrm-marine-audio-status",
      contractVersion: 1,
      sessionId: "audio-session",
      enabled: true,
      muted: false,
      pluginMuted: false,
      engineMuted: false,
      engineAudioPolicy: trafficAudioPolicy,
      engineAudioPolicySequence: 7,
      localPlayback: false,
      localPlaybackAvailable: false,
      localPlaybackUnavailableReason: "Server speaker output disabled.",
      liveStream: true,
      publicHttpStream: true,
      queueLength: 0,
      dependencies: {
        ok: true,
        summary: "Piper speech engine ready",
        piperPlaybackAvailable: true,
      },
      recentEvents: [{
        ts: new Date(startedAtMs).toISOString(),
        event: "queued",
        message: `Collision alarm. ${TEST_TARGET_NAME}.`,
      }],
    },
  };
  const messages = [];
  const captureCommands = [];
  const trafficCommands = [];
  const app = {
    ajrmMarineConsoleAvailableWebapps: packageInfo.signalk.requires.map((id) => ({
      id,
      packageName: id,
      title: id,
      kind: "webapp",
      url: `/${id}/`,
      version: "0.5.0",
    })),
    ajrmMarineCaptureApi: {
      async status() {
        return { enabled: true };
      },
      async setAutomaticRecordingEnabled(enabled) {
        captureCommands.push({ enabled });
        return { enabled };
      },
      async start() {
        captureCommands.push({ start: true });
        return { id: "voyage-bite" };
      },
      async stop() {
        captureCommands.push({ stop: true });
        return { fileName: "voyage-bite.zip" };
      },
    },
    ajrmMarineTrafficApi: {
      async status() {
        return { audioPolicy: { muted: true } };
      },
      async setAudioPolicy(command) {
        trafficCommands.push(command);
        return { muted: command.muted === true };
      },
    },
    getSelfPath(path) {
      if (path === "plugins.ajrmMarineNotifications") {
        values[path].active[0].timestamp = new Date().toISOString();
      }
      if (path === "plugins.ajrmMarineNotifications.audio") {
        values[path].timestamp = new Date().toISOString();
      }
      if (path === "plugins.ajrmMarineAudio") {
        values[path].recentEvents[0].ts = new Date().toISOString();
      }
      return values[path] || null;
    },
    handleMessage(id, message) {
      messages.push({ id, message });
      for (const update of message?.updates || []) {
        for (const value of update.values || []) {
          if (value.path === "plugins.ajrmMarineNotifications.audio") {
            values[value.path] = value.value;
            if (/Marine built in tests/.test(value.value?.audioRequest?.message || "")) {
              values["plugins.ajrmMarineAudio"] = {
                ...values["plugins.ajrmMarineAudio"],
                recentEvents: [{
                  ts: new Date().toISOString(),
                  event: "rendered",
                  message: value.value.audioRequest.message,
                }],
                recentAnnouncements: [{
                  renderedAt: new Date().toISOString(),
                  message: value.value.audioRequest.message,
                }],
              };
            }
          }
        }
      }
    },
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
  assert.equal(statusBody.tests[0].number, 0);
  assert.equal(statusBody.tests[1].id, "core-projections");
  assert.equal(statusBody.tests.at(-1).id, "audio-output-summary");
  assert.equal(statusBody.tests.at(-1).number, 99);
  assert.equal(statusBody.tests.at(-1).timeoutSeconds, 75);
  const harbourStatusTest = statusBody.tests.find((item) => item.id === "harbour-editor-availability");
  assert.equal(harbourStatusTest.enabled, false);
  assert.match(harbourStatusTest.disabledReason, /signalk-ajrm-marine-harbour-editor/);
  assert.equal(statusBody.latestReportsByTest, undefined);

  app.ajrmMarineConsoleAvailableWebapps.push({
    id: "signalk-ajrm-marine-harbour-editor",
    packageName: "signalk-ajrm-marine-harbour-editor",
    title: "AJRM Marine Harbour Editor",
    kind: "webapp",
    url: "/signalk-ajrm-marine-harbour-editor/",
    version: "0.5.3",
  });
  values["plugins.ajrmMarineHarbourEditor"] = {
    contract: "ajrm-marine-harbour-editor-status",
    contractVersion: 1,
    plugin: "signalk-ajrm-marine-harbour-editor",
    version: "0.5.4",
    enabled: true,
    harbourCount: 572,
    defaultHarbourCount: 572,
    seedState: "seeded-defaults",
  };
  routes.get("GET /ajrmMarineConsole/bite/status")({}, {
    set() {},
    json(value) {
      statusBody = value;
    },
  });
  assert.equal(statusBody.tests.at(-1).id, "audio-output-summary");
  assert.equal(statusBody.tests.find((item) => item.id === "harbour-editor-availability").enabled, true);

  let statusCode = 0;
  let runBody;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "harbour-editor-availability", timeoutSeconds: 5 } },
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
  assert.equal(runBody.scenario, "harbour-editor-availability");
  assert.equal(runBody.snapshot.url, "/signalk-ajrm-marine-harbour-editor/");
  assert.equal(runBody.snapshot.status.contract, "ajrm-marine-harbour-editor-status");
  assert.equal(runBody.assertions.find((item) => item.id === "harbour-editor-status").pass, true);
  app.ajrmMarineConsoleAvailableWebapps = app.ajrmMarineConsoleAvailableWebapps.filter(
    (module) => module.id !== "signalk-ajrm-marine-harbour-editor",
  );
  delete values["plugins.ajrmMarineHarbourEditor"];

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "preflight-safety", timeoutSeconds: 5 } },
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
  assert.equal(runBody.ok, true, JSON.stringify(runBody, null, 2));
  assert.equal(runBody.scenario, "preflight-safety");
  assert.equal(runBody.assertions.find((item) => item.id === "required-suite-plugins").pass, true);

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "core-projections", timeoutSeconds: 5 } },
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
  assert.equal(runBody.scenario, "core-projections");

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "collision-audio-chain", timeoutSeconds: 5 } },
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
  assert.equal(runBody.ok, true, JSON.stringify(runBody, null, 2));
  assert.equal(runBody.scenario, "collision-audio-chain");
  assert.equal(runBody.consoleVersion, require("../package.json").version);
  assert.ok(fs.readdirSync(reportsDir).some((name) => name.endsWith(".json")));

  values["plugins.ajrmMarineTraffic.audioPolicy"] = {
    ...trafficAudioPolicy,
    sequence: 8,
    muted: true,
  };
  values["plugins.ajrmMarineAudio"] = {
    ...values["plugins.ajrmMarineAudio"],
    muted: true,
    engineMuted: true,
    engineAudioPolicy: values["plugins.ajrmMarineTraffic.audioPolicy"],
    engineAudioPolicySequence: 8,
    recentEvents: [{
      ts: new Date().toISOString(),
      event: "accepted",
      message: `Collision alarm. ${TEST_TARGET_NAME}.`,
    }],
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "collision-audio-chain", timeoutSeconds: 5 } },
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

  values["plugins.ajrmMarineTraffic.audioPolicy"] = trafficAudioPolicy;
  values["plugins.ajrmMarineAudio"] = {
    ...values["plugins.ajrmMarineAudio"],
    muted: false,
    engineMuted: false,
    engineAudioPolicy: trafficAudioPolicy,
    engineAudioPolicySequence: 7,
    recentEvents: [{
      ts: new Date().toISOString(),
      event: "queued",
      message: `Collision alarm. ${TEST_TARGET_NAME}.`,
    }],
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run-all")(
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
  assert.equal(runBody.ok, true, JSON.stringify(runBody, null, 2));
  assert.equal(runBody.contract, "ajrm-marine-console-bite-run-all-report");
  assert.equal(runBody.capture.started, true);
  assert.equal(runBody.capture.stop.fileName, "voyage-bite.zip");
  assert.deepEqual(captureCommands, [
    { enabled: false },
    { start: true },
    { stop: true },
    { enabled: true },
  ]);
  assert.deepEqual(trafficCommands, [
    { muted: false },
    { muted: true },
  ]);
  assert.equal(runBody.reports.length, 9);
  assert.deepEqual(runBody.reports.map((report) => report.testId), [
    "preflight-safety",
    "core-projections",
    "projection-contracts",
    "audio-policy-consistency",
    "audio-renderer-readiness",
    "notifications-broker-health",
    "collision-audio-chain",
    "quiet-target-no-alert",
    "audio-output-summary",
  ]);
  assert.match(
    values["plugins.ajrmMarineNotifications.audio"].audioRequest.message,
    /Marine built in tests complete\. 8 tests passed/,
  );
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.priorityScore, 950);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.preempt, false);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.force, true);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].event.delivery.force, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-published").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-forced").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-completed").pass, true);

  values["navigation.position"] = {
    value: { latitude: 56, longitude: -5 },
    timestamp: new Date().toISOString(),
    $source: "live-gps",
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run-all")(
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
  assert.equal(runBody.capture.started, false);
  assert.equal(runBody.reports.length, 1);
  assert.equal(runBody.reports[0].testId, "preflight-safety");
  assert.match(runBody.summary, /live feed detected|Recent own-vessel feed detected/);
  assert.match(runBody.reports[0].summary, /Recent own-vessel feed detected/);

  delete values["navigation.position"];
  values["plugins.ajrmMarineSimulator"] = {
    outputEnabled: true,
    own: { motionMode: "self" },
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run-all")(
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
  assert.equal(runBody.capture.started, false);
  assert.match(runBody.summary, /AJRM Marine Simulator output is ON/);
  assert.match(runBody.reports[0].summary, /AJRM Marine Simulator output is ON/);

  values["plugins.ajrmMarineSimulator"] = {
    outputEnabled: false,
  };
  app.ajrmMarineConsoleAvailableWebapps = app.ajrmMarineConsoleAvailableWebapps.filter(
    (module) => module.id !== "signalk-ajrm-marine-audio",
  );
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run-all")(
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
  assert.equal(runBody.capture.started, false);
  assert.match(runBody.summary, /Required AJRM Marine plugins are not installed: signalk-ajrm-marine-audio/);
  assert.match(runBody.reports[0].summary, /Required AJRM Marine plugins are not installed/);

  delete process.env.AJRM_MARINE_BITE_CAPTURE_START_SETTLE_MS;
  delete process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR;
  fs.rmSync(reportsDir, { recursive: true, force: true });
});
