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
  biteAudioSummaryEvidence,
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

function gpsIntegrityProjectionFor(startedAtMs) {
  return {
    ok: true,
    timestamp: new Date(startedAtMs).toISOString(),
    trust: "normal",
    notificationState: "normal",
    acceptedGps: true,
    reasons: [],
    counters: {
      evaluations: 12,
      acceptedFixes: 12,
      rejectedFixes: 0,
      positionJumps: 0,
      lostFixes: 0,
      degradedSignals: 0,
      drDiscrepancies: 0,
    },
    gps: {
      position: { latitude: 56.21122, longitude: -5.55756 },
      fixValid: true,
      positionTimestamp: new Date(startedAtMs).toISOString(),
      lastReceivedPositionTimestamp: new Date(startedAtMs).toISOString(),
      positionAgeSeconds: 0,
      hdop: 0.8,
      satellites: 12,
      speedOverGround: 2.5,
      courseOverGroundTrue: 1.2,
      headingTrue: 1.1,
    },
    lastTrustedFix: {
      position: { latitude: 56.21122, longitude: -5.55756 },
      timestamp: new Date(startedAtMs).toISOString(),
      source: "navigation.position",
    },
    lastTrustedCurrent: {
      setTrue: Math.PI / 2,
      drift: 0.514444,
      setTrueDegrees: 90,
      driftKnots: 1,
      timestamp: new Date(startedAtMs).toISOString(),
    },
    current: {
      available: true,
      source: "live",
      setTrue: Math.PI / 2,
      drift: 0.514444,
      setTrueDegrees: 90,
      driftKnots: 1,
      timestamp: new Date(startedAtMs).toISOString(),
      ageSeconds: 0,
    },
    operationalDeadReckoning: {
      position: { latitude: 56.21122, longitude: -5.55756 },
      uncertaintyRadiusMeters: 8,
      ageSeconds: 0,
      source: "gps-locked",
      lastRealignedAt: new Date(startedAtMs).toISOString(),
    },
    integrityDeadReckoning: {
      position: { latitude: 56.2112, longitude: -5.5575 },
      uncertaintyRadiusMeters: 12,
      ageSeconds: 15,
      source: "heading-stw-current",
      lastRealignedAt: new Date(startedAtMs - 15_000).toISOString(),
      realignIntervalSeconds: 300,
    },
    vectors: {
      headingThroughWater: { available: true, role: "single", label: "heading/STW" },
      courseOverGround: { available: true, role: "double", label: "COG/SOG" },
      tide: { available: true, role: "triple", label: "tide/current" },
    },
    diagnostics: {
      contract: "ajrm-marine-gps-integrity-diagnostics",
      contractVersion: 1,
      observed: {
        positionPresent: true,
        fixValid: true,
        hdop: 0.8,
        satellites: 12,
      },
      decision: {
        acceptedGps: true,
        positionJumpRejected: false,
        degradedSignalActive: false,
        drDiscrepancyActive: false,
        reasons: [],
      },
      thresholds: {
        maxBoatSpeedKnots: 30,
        maxHdop: 4,
        minSatellites: 4,
        gpsLostSeconds: 15,
        warningDrDiscrepancyMeters: 50,
        alarmDrDiscrepancyMeters: 150,
      },
    },
  };
}

function fakeDrIntegrityFromInjectedValues(previous, values) {
  const now = new Date().toISOString();
  const phase = values["plugins.ajrmMarineConsole.bite.deadReckoningExercise"]?.phase || "";
  const position = values["navigation.position"];
  if (/weak-signal-degraded/.test(phase)) {
    return {
      ...previous,
      timestamp: now,
      trust: "degraded",
      acceptedGps: true,
      degradedSignalActive: true,
      reasons: ["HDOP 12.0 exceeds 4.", "2 satellites in view is below 4."],
      counters: {
        ...previous.counters,
        evaluations: Number(previous.counters.evaluations || 0) + 1,
        acceptedFixes: Number(previous.counters.acceptedFixes || 0) + 1,
        degradedSignals: Number(previous.counters.degradedSignals || 0) + 1,
      },
      gps: {
        ...previous.gps,
        position,
        fixValid: true,
        positionTimestamp: now,
        lastReceivedPositionTimestamp: now,
        positionAgeSeconds: 0,
        hdop: 12,
        satellites: 2,
      },
      diagnostics: {
        ...(previous.diagnostics || {}),
        observed: {
          ...(previous.diagnostics?.observed || {}),
          hdop: 12,
          satellites: 2,
          fixValid: true,
        },
        decision: {
          ...(previous.diagnostics?.decision || {}),
          acceptedGps: true,
          degradedSignalActive: true,
          reasons: ["HDOP 12.0 exceeds 4.", "2 satellites in view is below 4."],
        },
      },
    };
  }
  if (/impossible-gps-jump/.test(phase)) {
    return {
      ...previous,
      timestamp: now,
      trust: "suspect",
      acceptedGps: false,
      reasons: ["Position jump implies 999.0 kn over ground."],
      counters: {
        ...previous.counters,
        evaluations: Number(previous.counters.evaluations || 0) + 1,
        rejectedFixes: Number(previous.counters.rejectedFixes || 0) + 1,
        positionJumps: Number(previous.counters.positionJumps || 0) + 1,
      },
      gps: {
        ...previous.gps,
        position,
        fixValid: true,
        positionTimestamp: now,
        lastReceivedPositionTimestamp: now,
        positionAgeSeconds: 0,
      },
    };
  }
  if (position) {
    return {
      ...previous,
      timestamp: now,
      trust: "normal",
      acceptedGps: true,
      reasons: [],
      gps: {
        ...previous.gps,
        position,
        fixValid: true,
        positionTimestamp: now,
        lastReceivedPositionTimestamp: now,
        positionAgeSeconds: 0,
        speedOverGround: values["navigation.speedOverGround"],
        courseOverGroundTrue: values["navigation.courseOverGroundTrue"],
        headingTrue: values["navigation.headingTrue"],
      },
      lastTrustedFix: {
        position,
        timestamp: now,
        source: "navigation.position",
      },
      lastTrustedCurrent: {
        setTrue: values["environment.current.setTrue"],
        drift: values["environment.current.drift"],
        setTrueDegrees: 90,
        driftKnots: 1,
        timestamp: now,
      },
      current: {
        available: true,
        source: "live",
        setTrue: values["environment.current.setTrue"],
        drift: values["environment.current.drift"],
        setTrueDegrees: 90,
        driftKnots: 1,
        timestamp: now,
        ageSeconds: 0,
      },
      operationalDeadReckoning: {
        ...previous.operationalDeadReckoning,
        position,
        source: "gps-locked",
        ageSeconds: 0,
        lastRealignedAt: now,
      },
      integrityDeadReckoning: previous.integrityDeadReckoning,
    };
  }
	  const baseline = previous.lastTrustedFix.position;
	  const moved = { latitude: baseline.latitude, longitude: baseline.longitude + 0.00006 };
	  const previousLost = previous.trust === "lost" || previous.gps?.fixValid === false;
	  const previousLostFixes = Number(previous.counters?.lostFixes || 0);
	  const explicitNoFix = /no\s*(gps|gnss|fix)|invalid|unavailable|none|lost/i.test(String(values["navigation.gnss.methodQuality"] || "")) ||
	    Number(values["navigation.gnss.satellites"]) <= 0;
	  return {
	    ...previous,
	    timestamp: now,
	    trust: "lost",
	    acceptedGps: false,
	    reasons: [explicitNoFix ? "GPS source reports no fix." : "GPS position is missing or invalid."],
    counters: {
      ...previous.counters,
      evaluations: Number(previous.counters?.evaluations || 0) + 1,
      lostFixes: previousLost ? previousLostFixes : previousLostFixes + 1,
    },
    gps: {
	      ...previous.gps,
	      position: null,
	      fixValid: false,
	      explicitGpsUnavailable: explicitNoFix,
	      positionTimestamp: now,
      positionAgeSeconds: null,
      speedOverGround: null,
      courseOverGroundTrue: null,
    },
    current: {
      available: true,
      source: "last-trusted-current",
      setTrue: previous.lastTrustedCurrent.setTrue,
      drift: previous.lastTrustedCurrent.drift,
      setTrueDegrees: 90,
      driftKnots: 1,
      timestamp: previous.lastTrustedCurrent.timestamp,
      ageSeconds: 2,
    },
    operationalDeadReckoning: {
      ...previous.operationalDeadReckoning,
      position: moved,
      source: "tide-current",
      ageSeconds: 2,
      uncertaintyRadiusMeters: 14,
    },
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

test("BITE audio summary evidence does not accept audio-ready-only announcements", () => {
  const startedAtMs = Date.now() - 1000;
  const message = "Marine built in tests complete. 9 tests passed.";
  assert.equal(
    biteAudioSummaryEvidence({
      lastAnnouncement: {
        queuedAt: new Date().toISOString(),
        message,
        audioUrl: "/plugins/signalk-ajrm-marine-audio/audio/test.mp3",
        publicAudioUrl: "https://example.test/audio/test.mp3",
      },
    }, { message, startedAtMs }),
    null,
  );
  const renderedEvidence = biteAudioSummaryEvidence({
    lastAnnouncement: {
      renderedAt: new Date().toISOString(),
      message,
      audioUrl: "/plugins/signalk-ajrm-marine-audio/audio/test.mp3",
    },
  }, { message, startedAtMs });
  assert.equal(renderedEvidence.state, "rendered");
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
  process.env.AJRM_MARINE_BITE_AUDIO_CLIENT_SETTLE_MS = "0";
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajrm-console-bite-"));
  process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR = reportsDir;
  const startedAtMs = Date.now();
  const gpsIntegrityProjection = gpsIntegrityProjectionFor(startedAtMs);
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
    "plugins.ajrmMarineGpsIntegrity.navigationIntegrity": gpsIntegrityProjection,
  };
  const messages = [];
  const captureCommands = [];
  const trafficCommands = [];
  function injectScenarioMessage({ mmsi, name, visualMessage, audioMessage = visualMessage, state = "warn" }) {
    const now = new Date().toISOString();
    values["plugins.ajrmMarineTraffic.targets"] = {
      ...trafficProjection(state),
      targets: [{
        id: `vessels.urn:mrn:imo:mmsi:${mmsi}`,
        mmsi,
        name,
        encounter: {
          state,
          silenced: false,
          collisionCandidate: true,
          message: visualMessage,
        },
      }],
    };
    values["plugins.ajrmMarineNotifications"] = {
      ...values["plugins.ajrmMarineNotifications"],
      active: [{
        priority: { level: state },
        timestamp: now,
        delivery: { visual: true },
        presentation: { message: visualMessage },
        message: visualMessage,
      }],
    };
    values["plugins.ajrmMarineNotifications.audio"] = {
      ...values["plugins.ajrmMarineNotifications.audio"],
      timestamp: now,
      audioRequest: { message: audioMessage },
    };
    values["plugins.ajrmMarineAudio"] = {
      ...values["plugins.ajrmMarineAudio"],
      recentEvents: [{
        ts: now,
        event: "queued",
        message: audioMessage,
      }],
    };
  }
  const app = {
    ajrmMarineConsoleAvailableWebapps: packageInfo.signalk.requires.map((id) => ({
      id,
      packageName: id,
      title: id,
      kind: "webapp",
      url: `/${id}/`,
      version: "0.5.0",
    })).concat([{
      id: "signalk-ajrm-marine-gps-integrity",
      packageName: "signalk-ajrm-marine-gps-integrity",
      title: "AJRM Marine GPS Integrity",
      kind: "webapp",
      url: "/signalk-ajrm-marine-gps-integrity/",
      version: "0.5.15",
    }]),
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
      if (path === "plugins.ajrmMarineGpsIntegrity.navigationIntegrity") {
        const now = new Date();
        values[path].timestamp = now.toISOString();
        if (values[path].trust !== "lost") {
          values[path].gps.positionTimestamp = now.toISOString();
          values[path].gps.lastReceivedPositionTimestamp = now.toISOString();
          values[path].gps.positionAgeSeconds = 0;
          values[path].lastTrustedFix.timestamp = now.toISOString();
          values[path].operationalDeadReckoning.lastRealignedAt = now.toISOString();
        }
      }
      return values[path] || null;
    },
    handleMessage(id, message) {
      messages.push({ id, message });
      if (message?.context === "vessels.self") {
        const updateValues = Object.fromEntries((message.updates || [])
          .flatMap((update) => update.values || [])
          .map((item) => [item.path, item.value]));
        if (updateValues["plugins.ajrmMarineConsole.bite.deadReckoningExercise"]) {
          values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"] = fakeDrIntegrityFromInjectedValues(
            values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"],
            updateValues,
          );
        }
      }
      if (String(message?.context || "").includes("235912347")) {
        injectScenarioMessage({
          mmsi: "235912347",
          name: "BITE OVERTAKING TARGET",
          visualMessage: "Traffic advisory. Medium vessel BITE OVERTAKING TARGET at 12 o'clock. You are overtaking it. CPA will be ahead. 80 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912348")) {
        injectScenarioMessage({
          mmsi: "235912348",
          name: "BITE CLOSE TARGET",
          visualMessage: "Collision alarm. Small craft BITE CLOSE TARGET at 12 o'clock. Close quarters. CPA 44 meters in 2 minutes.",
          state: "alarm",
        });
      }
      if (String(message?.context || "").includes("235912349")) {
        injectScenarioMessage({
          mmsi: "235912349",
          name: "",
          visualMessage: "Traffic advisory. Small craft 235912349 at 12 o'clock. CPA will be on your port side. 45 meters in 2 minutes.",
          audioMessage: "Traffic advisory. Small craft at 12 o'clock. CPA will be on your port side. 45 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912350")) {
        injectScenarioMessage({
          mmsi: "235912350",
          name: "BITE HEAD ON TARGET",
          visualMessage: "Collision alarm. Medium vessel BITE HEAD ON TARGET at 12 o'clock. Risk of collision. Head-on: alter starboard, pass port-to-port. CPA 0 meters in 2 minutes.",
          state: "alarm",
        });
      }
      if (String(message?.context || "").includes("235912351")) {
        injectScenarioMessage({
          mmsi: "235912351",
          name: "BITE GIVE WAY TARGET",
          visualMessage: "Collision alarm. Medium vessel BITE GIVE WAY TARGET at 2 o'clock. Risk of collision. Give Way. CPA 0 meters in 2 minutes.",
          state: "alarm",
        });
      }
      if (String(message?.context || "").includes("235912352")) {
        injectScenarioMessage({
          mmsi: "235912352",
          name: "BITE STAND ON TARGET",
          visualMessage: "Collision alarm. Medium vessel BITE STAND ON TARGET at 10 o'clock. Risk of collision. Stand On. CPA 0 meters in 2 minutes.",
          state: "alarm",
        });
      }
      if (String(message?.context || "").includes("235912353")) {
        injectScenarioMessage({
          mmsi: "235912353",
          name: "BITE TARGET OVERTAKING",
          visualMessage: "Traffic advisory. Medium vessel BITE TARGET OVERTAKING at 6 o'clock. It is overtaking you. CPA will be astern. 80 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912354")) {
        injectScenarioMessage({
          mmsi: "235912354",
          name: "BITE SAME COURSE TARGET",
          visualMessage: "Traffic advisory. Medium vessel BITE SAME COURSE TARGET at 2 o'clock. Same general course. CPA will be on your starboard side. 80 meters in 2 minutes.",
        });
      }
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
  assert.equal(statusBody.tests.find((item) => item.id === "gps-integrity-health").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-lost-age-consistency").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "dead-reckoning-projection").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "dead-reckoning-loss-exercise").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-recovery-realigns-dr").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-jump-rejection").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-intermittent-outage-count").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "docked-no-dr-drift").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-recovery-fresh-fix").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "lost-gps-retained-current-source").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-explicit-no-fix-immediate").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "stationary-automute-policy-shape").enabled, undefined);
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
    { body: { testId: "gps-integrity-health", timeoutSeconds: 5 } },
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
  assert.equal(runBody.scenario, "gps-integrity-health");
  assert.equal(runBody.snapshot.trust, "normal");

  const healthyGpsIntegrityProjection = values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"];
  values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"] = {
    ...healthyGpsIntegrityProjection,
    trust: "lost",
    notificationState: "warn",
    acceptedGps: false,
    reasons: ["GPS position is stale (4177 seconds old)."],
    gps: {
      ...healthyGpsIntegrityProjection.gps,
      fixValid: false,
      positionTimestamp: new Date(startedAtMs - 4_177_000).toISOString(),
      lastReceivedPositionTimestamp: "",
      positionAgeSeconds: 4177,
    },
    lastTrustedFix: {
      ...healthyGpsIntegrityProjection.lastTrustedFix,
      timestamp: new Date(startedAtMs - 20_000).toISOString(),
    },
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "gps-lost-age-consistency", timeoutSeconds: 5 } },
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
  assert.equal(runBody.assertions.find((item) => item.id === "gps-lost-age-not-stale-cache").pass, false);
  values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"] = healthyGpsIntegrityProjection;

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "dead-reckoning-loss-exercise", timeoutSeconds: 10 } },
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
  assert.equal(runBody.scenario, "dead-reckoning-loss-exercise");
  assert.equal(runBody.assertions.find((item) => item.id === "dr-position-moved").pass, true);
  values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"] = healthyGpsIntegrityProjection;

		  for (const testId of [
		    "gps-integrity-diagnostics-contract",
		    "gps-recovery-realigns-dr",
		    "gps-jump-rejection",
		    "gps-intermittent-outage-count",
		    "docked-no-dr-drift",
		    "gps-recovery-fresh-fix",
		    "lost-gps-retained-current-source",
		    "stationary-automute-policy-shape",
		    "gps-explicit-no-fix-immediate",
		    "gps-weak-signal-detection",
		  ]) {
    statusCode = 0;
    runBody = null;
    await routes.get("POST /ajrmMarineConsole/bite/run")(
      { body: { testId, timeoutSeconds: 10 } },
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
	    assert.equal(runBody.scenario, testId);
	    values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"] = healthyGpsIntegrityProjection;
	  }

  for (const trafficWordingTestId of [
    "traffic-overtaking-wording",
    "traffic-close-quarters-wording",
    "traffic-unnamed-spoken-name",
    "traffic-head-on-prompt",
    "traffic-give-way-prompt",
    "traffic-stand-on-prompt",
    "traffic-target-overtaking-wording",
    "traffic-same-course-wording",
  ]) {
    statusCode = 0;
    runBody = null;
    await routes.get("POST /ajrmMarineConsole/bite/run")(
      { body: { testId: trafficWordingTestId, timeoutSeconds: 5 } },
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
    assert.equal(runBody.scenario, trafficWordingTestId);
    assert.equal(runBody.assertions.find((item) => item.id === "expected-wording-1").pass, true);
    if (trafficWordingTestId === "traffic-unnamed-spoken-name") {
      assert.equal(runBody.assertions.find((item) => item.id === "forbidden-audio-wording-1").pass, true);
    }
  }
  values["plugins.ajrmMarineTraffic.targets"] = trafficProjection("alarm");
  values["plugins.ajrmMarineNotifications"].active = [{
    priority: { level: "danger" },
    timestamp: new Date().toISOString(),
    delivery: { visual: true },
    presentation: { message: `Collision alarm. ${TEST_TARGET_NAME}.` },
  }];
  values["plugins.ajrmMarineNotifications.audio"].audioRequest = { message: `Collision alarm. ${TEST_TARGET_NAME}.` };
  values["plugins.ajrmMarineAudio"].recentEvents = [{
    ts: new Date().toISOString(),
    event: "queued",
    message: `Collision alarm. ${TEST_TARGET_NAME}.`,
  }];

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
  assert.equal(runBody.reports.length, 31);
  assert.deepEqual(runBody.reports.map((report) => report.testId), [
    "preflight-safety",
    "core-projections",
    "projection-contracts",
    "audio-policy-consistency",
    "audio-renderer-readiness",
    "notifications-broker-health",
    "collision-audio-chain",
    "quiet-target-no-alert",
    "gps-integrity-health",
    "gps-lost-age-consistency",
    "gps-integrity-diagnostics-contract",
    "dead-reckoning-projection",
    "dead-reckoning-loss-exercise",
    "gps-recovery-realigns-dr",
    "gps-jump-rejection",
    "gps-intermittent-outage-count",
    "docked-no-dr-drift",
    "gps-recovery-fresh-fix",
    "lost-gps-retained-current-source",
    "stationary-automute-policy-shape",
    "gps-explicit-no-fix-immediate",
    "gps-weak-signal-detection",
    "traffic-overtaking-wording",
    "traffic-close-quarters-wording",
    "traffic-unnamed-spoken-name",
    "traffic-head-on-prompt",
    "traffic-give-way-prompt",
    "traffic-stand-on-prompt",
    "traffic-target-overtaking-wording",
    "traffic-same-course-wording",
    "audio-output-summary",
  ]);
  assert.match(
    values["plugins.ajrmMarineNotifications.audio"].audioRequest.message,
    /Marine built in tests complete\. 30 tests passed/,
  );
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.priorityScore, 150);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.preempt, false);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.force, true);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].event.delivery.force, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-published").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-forced").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-completed").pass, true);
  const savedRunAllReports = fs.readdirSync(reportsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(reportsDir, name), "utf8")))
    .filter((report) => report.testId === "run-all");
  assert.ok(
    savedRunAllReports.some((report) =>
      report.phase === "before-capture-stop" &&
      report.ok === true &&
      report.capture.started === true &&
      report.capture.stop === null
    ),
    "run-all summary is written before Capture stops so it is included in the voyage zip",
  );

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
  delete process.env.AJRM_MARINE_BITE_AUDIO_CLIENT_SETTLE_MS;
  delete process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR;
  fs.rmSync(reportsDir, { recursive: true, force: true });
});
