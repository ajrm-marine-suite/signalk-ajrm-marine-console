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
      position: previous.gps?.position || null,
      fixValid: null,
      explicitGpsUnavailable: explicitNoFix,
      positionTimestamp: previous.gps?.positionTimestamp || now,
      lastReceivedPositionTimestamp: previous.gps?.lastReceivedPositionTimestamp || previous.gps?.positionTimestamp || now,
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
    harbourBoundary: {
      name: "Harbour: Craobh",
      inside: false,
      distanceMeters: 140,
    },
  };
  const trafficAutoProfile = {
    contract: "ajrm-marine-traffic-auto-profile",
    contractVersion: 1,
    sessionId: "traffic-session",
    sequence: 3,
    generatedAt: new Date(startedAtMs).toISOString(),
    enabled: true,
    profile: "coastal",
    settings: {
      enabled: true,
      enterDistanceMeters: 50,
      exitDistanceMeters: 100,
      refreshRegionsSeconds: 60,
    },
    status: "outside Harbour: Craobh",
    insideRegionName: "",
    nearestRegionName: "Harbour: Craobh",
    distanceMeters: 140,
  };
  const values = {
    "plugins.ajrmMarineTraffic.targets": trafficProjection("alarm"),
    "plugins.ajrmMarineTraffic.audioPolicy": trafficAudioPolicy,
    "plugins.ajrmMarineTraffic.autoProfile": trafficAutoProfile,
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
      recentAnnouncements: [{
        renderedAt: new Date(startedAtMs).toISOString(),
        message: `Collision alarm. ${TEST_TARGET_NAME}.`,
        audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-test.mp3",
        publicAudioUrl: "https://localhost:3445/audio/bite-test.mp3",
      }],
      lastAnnouncement: {
        renderedAt: new Date(startedAtMs).toISOString(),
        message: `Collision alarm. ${TEST_TARGET_NAME}.`,
        audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-test.mp3",
        publicAudioUrl: "https://localhost:3445/audio/bite-test.mp3",
      },
    },
    "plugins.ajrmMarineGpsIntegrity.navigationIntegrity": gpsIntegrityProjection,
    "plugins.ajrmMarineVesselDatabase.summary": {
      plugin: "signalk-ajrm-marine-vessel-database",
      version: "0.5.2",
      vesselCount: 24,
      databasePath: "/tmp/ajrm-vessels.json",
      fillMissingData: true,
      stats: {
        learned: 2,
        updated: 3,
        filled: 4,
        ignored: 0,
        errors: 0,
      },
    },
    "plugins.ajrmMarineLogger.playback": {
      active: false,
      speed: 1,
      fileName: "",
      freshTimestamps: true,
      excludeDerivedData: true,
    },
    "plugins.ajrmMarineAlerts": {
      ok: true,
      plugin: "signalk-ajrm-marine-alerts",
      version: "0.5.3",
      enabled: true,
      readOnly: true,
      refreshIntervalMs: 2000,
      recentActivityHours: 12,
      notificationsStatusUrl: "../plugins/signalk-ajrm-marine-notifications/status",
    },
    "plugins.ajrmMarineDrPlotter": {
      ok: true,
      plugin: "signalk-ajrm-marine-dr-plotter",
      version: "0.5.26",
      enabled: true,
      refreshIntervalMs: 1000,
      coordinateFormat: "dms",
      plotFixIntervalMinutes: 10,
      noAisTargets: true,
      dataDirectory: "/tmp/ajrm-dr-plotter",
      plotFixPersistence: {
        serverSide: true,
        persisted: true,
        count: 12,
        file: "/tmp/ajrm-dr-plotter/plot-fixes.json",
        retentionHours: 24,
      },
      trackPersistence: {
        serverSide: true,
        persisted: true,
        count: 80,
        file: "/tmp/ajrm-dr-plotter/track.json",
      },
      ajrmMarineGpsIntegrityStatePath: "vessels.self.plugins.ajrmMarineGpsIntegrity.navigationIntegrity",
      ajrmMarineGpsIntegrity: gpsIntegrityProjection,
    },
    "plugins.ajrmMarineInstruments": {
      ok: true,
      plugin: "signalk-ajrm-marine-instruments",
      version: "0.5.6",
      timestamp: new Date(startedAtMs).toISOString(),
      paths: {
        depth: "environment.depth.belowKeel",
        exhaustWaterTemperature: "environment.inside.engineRoom.temperature",
      },
      depth: { meters: 8.6, source: "belowKeel" },
      wind: { apparent: {}, true: {} },
      current: { driftKnots: 1.2, setTrueDegrees: 90 },
      gps: { latitude: 56.21122, longitude: -5.55756 },
      navigation: { sogKnots: 3.2, cogDegrees: 62 },
      exhaustWater: { temperatureCelsius: 26.4 },
      controls: { refreshIntervalSeconds: 3 },
    },
    "plugins.ajrmMarineInstrumentAlerts": {
      ok: true,
      plugin: "signalk-ajrm-marine-instrument-alerts",
      version: "0.5.5",
      enabled: true,
      timestamp: new Date(startedAtMs).toISOString(),
      monitors: [{
        id: "depth-shallow",
        path: "environment.depth.belowKeel",
        enabled: true,
        state: {
          level: "normal",
          active: false,
          lastValue: 8.6,
        },
      }],
      capabilities: {
        depthCallout: {
          supported: true,
          path: "environment.depth.belowKeel",
          audio: true,
          mode: "anchoring",
        },
      },
      depthCallout: {
        supported: true,
        path: "environment.depth.belowKeel",
        audio: true,
      },
      recentEvents: [],
    },
    "plugins.ajrmMarinePiController": {
      version: "0.5.6",
      system: {
        hostname: "nemo",
        platform: "linux",
        uptimeSeconds: 1234,
        memory: {
          totalBytes: 1024,
          freeBytes: 512,
          usedBytes: 512,
        },
        process: {
          pid: 4321,
          uptimeSeconds: 12,
          node: "v22.22.1",
        },
      },
    },
    "plugins.ajrmMarineSimulator": {
      plugin: "signalk-ajrm-marine-simulator",
      version: "0.5.27",
      running: true,
      outputEnabled: false,
      targetAutopilotEnabled: true,
      gpsFaultModes: ["normal", "lost", "intermittent", "jump", "spoof"],
      own: {
        motionMode: "stationary",
        latitude: 56.21122,
        longitude: -5.55756,
        headingDeg: 245,
        speedKn: 0,
      },
      environment: {
        enabled: true,
        depthM: 8.6,
        currentDriftKn: 1.2,
        currentSetDeg: 90,
      },
      targets: [],
    },
    "plugins.ajrmMarineVoyageViewer": {
      ok: true,
      version: "0.5.14",
      voyageDirectory: "/tmp/ajrm-capture/voyages",
      logDirectory: "/tmp/ajrm-capture/buffer",
      clipDirectory: "/tmp/ajrm-capture/clips",
    },
  };
  const messages = [];
  const captureCommands = [];
  const trafficCommands = [];
  const trafficProfiles = {
    contract: "ajrm-marine-traffic-profiles",
    contractVersion: 1,
    current: "coastal",
    anchor: {
      automuteStationary: true,
      cpaSensitivity: 1,
      tcpaLookahead: 1,
      repeatSensitivity: 1,
      warning: { cpa: 0, tcpa: 3600, speed: 0 },
      danger: { cpa: 0, tcpa: 3600, speed: 0 },
    },
    harbor: {
      automuteStationary: true,
      cpaSensitivity: 1,
      tcpaLookahead: 1,
      repeatSensitivity: 1,
      warning: { bySize: {
        small: { cpa: 50, tcpa: 180, speed: 0.5 },
        medium: { cpa: 100, tcpa: 240, speed: 0.5 },
        large: { cpa: 200, tcpa: 360, speed: 0.5 },
      } },
      danger: { bySize: {
        small: { cpa: 25, tcpa: 60, speed: 3 },
        medium: { cpa: 50, tcpa: 120, speed: 3 },
        large: { cpa: 100, tcpa: 180, speed: 3 },
      } },
    },
    coastal: {
      automuteStationary: false,
      cpaSensitivity: 1,
      tcpaLookahead: 1,
      repeatSensitivity: 1,
      warning: { bySize: {
        small: { cpa: 740.8, tcpa: 600, speed: 0 },
        medium: { cpa: 1481.6, tcpa: 900, speed: 0 },
        large: { cpa: 2778, tcpa: 1200, speed: 0 },
      } },
      danger: { bySize: {
        small: { cpa: 277.8, tcpa: 300, speed: 0.5 },
        medium: { cpa: 740.8, tcpa: 480, speed: 0.5 },
        large: { cpa: 1481.6, tcpa: 720, speed: 0.5 },
      } },
    },
    offshore: {
      automuteStationary: false,
      cpaSensitivity: 1,
      tcpaLookahead: 1,
      repeatSensitivity: 1,
      warning: { bySize: {
        small: { cpa: 926, tcpa: 720, speed: 0 },
        medium: { cpa: 2315, tcpa: 1200, speed: 0 },
        large: { cpa: 5556, tcpa: 1800, speed: 0 },
      } },
      danger: { bySize: {
        small: { cpa: 370.4, tcpa: 360, speed: 0 },
        medium: { cpa: 1111.2, tcpa: 600, speed: 0 },
        large: { cpa: 2778, tcpa: 900, speed: 0 },
      } },
    },
  };
  const trafficApiAudioPolicy = {
    muted: true,
    automuteStationary: true,
    automuteStationarySpeed: 0.35,
    automuteStationaryDelaySeconds: 10,
    automuteMovingDelaySeconds: 3,
    allWellEnabled: true,
    allWellMessage: "All's well.",
    allWellIntervalMinutes: 30,
  };
  const trafficApiAutoProfile = {
    settings: {
      enabled: true,
      harbourProfile: "harbor",
      outsideProfile: "coastal",
      enterDistanceMeters: 50,
      exitDistanceMeters: 100,
    },
  };
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
      recentAnnouncements: [{
        renderedAt: now,
        message: audioMessage,
        audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-target.mp3",
        publicAudioUrl: "https://localhost:3445/audio/bite-target.mp3",
      }],
      lastAnnouncement: {
        renderedAt: now,
        message: audioMessage,
        audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-target.mp3",
        publicAudioUrl: "https://localhost:3445/audio/bite-target.mp3",
      },
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
    }, {
      id: "signalk-ajrm-marine-dr-plotter",
      packageName: "signalk-ajrm-marine-dr-plotter",
      title: "AJRM Marine DR Plotter",
      kind: "webapp",
      url: "/signalk-ajrm-marine-dr-plotter/",
      version: "0.5.26",
    }, {
      id: "signalk-ajrm-marine-alerts",
      packageName: "signalk-ajrm-marine-alerts",
      title: "AJRM Marine Alert Panel",
      kind: "webapp",
      url: "/signalk-ajrm-marine-alerts/",
      version: "0.5.3",
    }, {
      id: "signalk-ajrm-marine-instruments",
      packageName: "signalk-ajrm-marine-instruments",
      title: "AJRM Marine Instruments",
      kind: "webapp",
      url: "/signalk-ajrm-marine-instruments/",
      version: "0.5.6",
    }, {
      id: "signalk-ajrm-marine-instrument-alerts",
      packageName: "signalk-ajrm-marine-instrument-alerts",
      title: "AJRM Marine Instrument Alerts",
      kind: "webapp",
      url: "/signalk-ajrm-marine-instrument-alerts/",
      version: "0.5.5",
    }, {
      id: "signalk-ajrm-marine-snapshot",
      packageName: "signalk-ajrm-marine-snapshot",
      title: "AJRM Marine Snapshot",
      kind: "webapp",
      url: "/signalk-ajrm-marine-snapshot/",
      version: "0.5.8",
    }, {
      id: "signalk-ajrm-marine-simulator",
      packageName: "signalk-ajrm-marine-simulator",
      title: "AJRM Marine Simulator",
      kind: "webapp",
      url: "/signalk-ajrm-marine-simulator/",
      version: "0.5.27",
    }, {
      id: "signalk-ajrm-marine-voyage-viewer",
      packageName: "signalk-ajrm-marine-voyage-viewer",
      title: "AJRM Marine Voyage Viewer",
      kind: "webapp",
      url: "/signalk-ajrm-marine-voyage-viewer/",
      version: "0.5.14",
    }, {
      id: "signalk-ajrm-marine-vessel-database",
      packageName: "signalk-ajrm-marine-vessel-database",
      title: "AJRM Marine Vessel Database",
      kind: "webapp",
      url: "/signalk-ajrm-marine-vessel-database/",
      version: "0.5.2",
    }, {
      id: "signalk-ajrm-marine-logger",
      packageName: "signalk-ajrm-marine-logger",
      title: "AJRM Marine Logger",
      kind: "webapp",
      url: "/signalk-ajrm-marine-logger/",
      version: "0.5.14",
    }, {
      id: "signalk-ajrm-marine-pi-controller",
      packageName: "signalk-ajrm-marine-pi-controller",
      title: "AJRM Marine Pi Controller",
      kind: "webapp",
      url: "/signalk-ajrm-marine-pi-controller/",
      version: "0.5.6",
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
        return {
          profile: trafficProfiles.current,
          profiles: trafficProfiles,
          autoProfile: trafficApiAutoProfile,
          audioPolicy: trafficApiAudioPolicy,
        };
      },
      async setProfile(profile) {
        trafficCommands.push({ profile });
        trafficProfiles.current = profile;
        return trafficProfiles;
      },
      async setProfiles(profiles) {
        trafficCommands.push({ profiles });
        Object.assign(trafficProfiles, profiles);
        return trafficProfiles;
      },
      async setAutoProfile(command) {
        trafficCommands.push({ autoProfile: command });
        Object.assign(trafficApiAutoProfile.settings, command);
        return trafficApiAutoProfile;
      },
      async setAudioPolicy(command) {
        trafficCommands.push(command);
        Object.assign(trafficApiAudioPolicy, command);
        return { muted: command.muted === true };
      },
    },
    ajrmMarineLoggerApi: {
      async status() {
        return {
          ok: true,
          recording: { active: false },
          playback: { active: false },
          freshTimestamps: true,
          excludeDerivedData: true,
          paths: { recordings: "/tmp/ajrm-logger" },
        };
      },
      paths() {
        return { recordings: "/tmp/ajrm-logger" };
      },
      async startCapture() {
        return { ok: true };
      },
      async stopCapture() {
        return { ok: true };
      },
    },
    ajrmMarineSnapshotApi: {
      async snapshot() {
        return {
          generatedAt: new Date().toISOString(),
          vessel: { name: "BITE own vessel" },
          ajrmMarine: {
            traffic: values["plugins.ajrmMarineTraffic.targets"],
            gpsIntegrity: values["plugins.ajrmMarineGpsIntegrity.navigationIntegrity"],
          },
        };
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
        if (values[path].recentAnnouncements?.[0]) {
          values[path].recentAnnouncements[0].renderedAt = new Date().toISOString();
        }
        if (values[path].lastAnnouncement) {
          values[path].lastAnnouncement.renderedAt = new Date().toISOString();
        }
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
      if (String(message?.context || "").includes("235912345")) {
        injectScenarioMessage({
          mmsi: "235912345",
          name: "BITE TEST TARGET",
          visualMessage: "Collision alarm. Large vessel BITE TEST TARGET at 12 o'clock. Risk of collision. CPA 0 meters in 2 minutes.",
          state: "alarm",
        });
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
          visualMessage: "Traffic advisory. Medium vessel BITE TARGET OVERTAKING at 6 o'clock. It is overtaking you. CPA will be on your starboard side. 80 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912354")) {
        injectScenarioMessage({
          mmsi: "235912354",
          name: "BITE SAME COURSE TARGET",
          visualMessage: "Traffic advisory. Medium vessel BITE SAME COURSE TARGET at 2 o'clock. Same general course. CPA will be on your starboard side. 80 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912355")) {
        injectScenarioMessage({
          mmsi: "235912355",
          name: "BITE ADVISORY TARGET",
          visualMessage: "Traffic advisory. Small craft BITE ADVISORY TARGET at 12 o'clock. Close quarters. CPA 38 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912356")) {
        injectScenarioMessage({
          mmsi: "235912356",
          name: "BITE CPA DEDUP TARGET",
          visualMessage: "Traffic advisory. Medium vessel BITE CPA DEDUP TARGET at 2 o'clock. Same general course. CPA will be on your starboard side. 80 meters in 2 minutes.",
        });
      }
      if (String(message?.context || "").includes("235912357")) {
        injectScenarioMessage({
          mmsi: "235912357",
          name: "BITE WORDING MATCH TARGET",
          visualMessage: "Collision alarm. Small craft BITE WORDING MATCH TARGET at 12 o'clock. Close quarters. CPA 44 meters in 2 minutes.",
          state: "alarm",
        });
      }
      if (String(message?.context || "").includes("235912358")) {
        injectScenarioMessage({
          mmsi: "235912358",
          name: "BITE SAFETY RETENTION TARGET",
          visualMessage: "Collision alarm. Large vessel BITE SAFETY RETENTION TARGET at 12 o'clock. Risk of collision. CPA 0 meters in 2 minutes.",
          state: "alarm",
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
                  audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-summary.mp3",
                  publicAudioUrl: "https://localhost:3445/audio/bite-summary.mp3",
                }],
                lastAnnouncement: {
                  renderedAt: new Date().toISOString(),
                  message: value.value.audioRequest.message,
                  audioUrl: "/signalk/v1/api/ajrmMarineAudio/audio/bite-summary.mp3",
                  publicAudioUrl: "https://localhost:3445/audio/bite-summary.mp3",
                },
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
  assert.equal(statusBody.tests[0].number, "0");
  assert.equal(statusBody.tests[1].id, "console-availability");
  assert.equal(statusBody.tests.at(-1).id, "audio-output-summary");
  assert.equal(statusBody.tests.at(-1).number, "99");
  assert.equal(statusBody.tests.at(-1).timeoutSeconds, 180);
  assert.equal(Array.isArray(statusBody.groups), true);
  assert.equal(statusBody.groups[0].id, "safety");
  assert.equal(statusBody.groups[0].number, "0");
  assert.equal(statusBody.groups.find((item) => item.id === "required-plugins").number, "0.x");
  assert.equal(statusBody.groups.find((item) => item.id === "required-plugins").title, "Required plugins");
  assert.equal(statusBody.groups.find((item) => item.id === "traffic").number, "2");
  assert.equal(statusBody.groups.find((item) => item.id === "traffic").title, "Traffic encounters");
  assert.equal(statusBody.groups.find((item) => item.id === "gps-dr").number, "3");
  assert.equal(statusBody.groups.find((item) => item.id === "gps-dr").title, "GPS Integrity and DR Plotter");
  assert.equal(statusBody.tests.find((item) => item.id === "console-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "display-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "traffic-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "notifications-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "audio-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "capture-availability").enabled, undefined);
  assert.equal(statusBody.tests.find((item) => item.id === "capture-api-contract").groupId, "core");
  assert.equal(statusBody.tests.find((item) => item.id === "traffic-target-projection-contract").number, "2.11");
  assert.equal(statusBody.tests.find((item) => item.id === "traffic-head-on-prompt").groupId, "traffic");
  assert.equal(statusBody.tests.find((item) => item.id === "gps-integrity-availability").groupId, "gps-dr");
  assert.equal(statusBody.tests.find((item) => item.id === "dr-plotter-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "gps-jump-rejection").groupId, "gps-dr");
  assert.equal(statusBody.tests.find((item) => item.id === "gps-current-contract").number, "3.16");
  assert.equal(statusBody.tests.find((item) => item.id === "vessel-database-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "vessel-database-summary-contract").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "logger-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "logger-api-contract").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "logger-replay-sanity-contract").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "snapshot-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "snapshot-api-contract").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "voyage-viewer-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "simulator-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "alert-panel-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "instruments-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "instrument-alerts-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "instrument-alerts-depth-callout-capability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "pi-controller-availability").enabled, true);
  assert.equal(statusBody.tests.find((item) => item.id === "pi-controller-telemetry-contract").enabled, true);
  assert.deepEqual(
    statusBody.groups.find((item) => item.id === "gps-dr").testIds,
    [
      "gps-integrity-availability",
      "dr-plotter-availability",
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
      "gps-explicit-no-fix-immediate",
      "gps-weak-signal-detection",
      "gps-vector-arrow-contract",
      "gps-counter-contract",
      "gps-current-contract",
      "dr-plot-persistence-contract",
    ],
  );
  assert.deepEqual(
    statusBody.groups.find((item) => item.id === "signalk-ajrm-marine-vessel-database").testIds,
    ["vessel-database-availability", "vessel-database-summary-contract"],
  );
  for (const [groupId, expectedIds] of [
    ["signalk-ajrm-marine-snapshot", ["snapshot-availability", "snapshot-api-contract"]],
    ["signalk-ajrm-marine-voyage-viewer", ["voyage-viewer-availability"]],
    ["signalk-ajrm-marine-simulator", ["simulator-availability"]],
    ["signalk-ajrm-marine-alerts", ["alert-panel-availability"]],
    ["signalk-ajrm-marine-instruments", ["instruments-availability"]],
    ["signalk-ajrm-marine-instrument-alerts", ["instrument-alerts-availability", "instrument-alerts-depth-callout-capability"]],
  ]) {
    assert.deepEqual(statusBody.groups.find((item) => item.id === groupId).testIds, expectedIds);
  }
  const harbourStatusTest = statusBody.tests.find((item) => item.id === "harbour-editor-availability");
  assert.equal(harbourStatusTest.enabled, false);
  assert.equal(harbourStatusTest.groupId, "signalk-ajrm-marine-harbour-editor");
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
  assert.equal(statusBody.tests.find((item) => item.id === "harbour-editor-default-data-contract").enabled, true);
  assert.equal(statusBody.groups.find((item) => item.id === "signalk-ajrm-marine-harbour-editor").enabled, true);
  assert.equal(statusBody.groups.find((item) => item.id === "signalk-ajrm-marine-harbour-editor").number, "9.9");
  assert.deepEqual(
    statusBody.groups.find((item) => item.id === "signalk-ajrm-marine-harbour-editor").testIds,
    ["harbour-editor-availability", "harbour-editor-default-data-contract"],
  );

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

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "harbour-editor-default-data-contract", timeoutSeconds: 5 } },
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
  assert.equal(runBody.scenario, "harbour-editor-default-data-contract");
  assert.equal(runBody.assertions.find((item) => item.id === "default-harbour-count").pass, true);
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
    "capture-api-contract",
    "traffic-api-contract",
    "audio-status-detail-contract",
    "notifications-visual-contract",
    "traffic-target-projection-contract",
    "traffic-audio-policy-contract",
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
    "gps-vector-arrow-contract",
    "gps-counter-contract",
    "gps-current-contract",
    "snapshot-api-contract",
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
    "traffic-advisory-no-action-prompt",
    "traffic-cpa-deduplicated-wording",
    "traffic-visual-audio-wording-alignment",
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
    if (trafficWordingTestId !== "traffic-visual-audio-wording-alignment") {
      assert.equal(runBody.assertions.find((item) => item.id === "expected-wording-1").pass, true);
    }
    if (trafficWordingTestId === "traffic-unnamed-spoken-name") {
      assert.equal(runBody.assertions.find((item) => item.id === "forbidden-audio-wording-1").pass, true);
    }
    if (trafficWordingTestId === "traffic-cpa-deduplicated-wording") {
      assert.equal(runBody.assertions.find((item) => item.id === "forbidden-wording-1").pass, true);
    }
    if (trafficWordingTestId === "traffic-visual-audio-wording-alignment") {
      assert.equal(runBody.assertions.find((item) => item.id === "named-target-preserved").pass, true);
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

  values["plugins.ajrmMarinePiController"] = {
    version: { value: "0.5.6" },
    system: {
      hostname: { value: "nemo" },
      platform: { value: "linux" },
      uptimeSeconds: { value: 1234 },
      memory: {
        totalBytes: { value: 1024 },
        freeBytes: { value: 512 },
        usedBytes: { value: 512 },
      },
      process: {
        pid: { value: 4321 },
        uptimeSeconds: { value: 12 },
        node: { value: "v22.22.1" },
      },
    },
  };
  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run")(
    { body: { testId: "pi-controller-telemetry-contract", timeoutSeconds: 5 } },
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
  assert.equal(runBody.assertions.find((item) => item.id === "host-identity").pass, true);
  assert.equal(runBody.assertions.find((item) => item.id === "uptime-visible").pass, true);
  assert.equal(runBody.assertions.find((item) => item.id === "memory-visible").pass, true);
  assert.equal(runBody.assertions.find((item) => item.id === "process-visible").pass, true);

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
  await routes.get("POST /ajrmMarineConsole/bite/run-group")(
    { body: { groupId: "safety", timeoutSeconds: 5 } },
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
  assert.equal(runBody.testId, "run-group:safety");
  assert.equal(runBody.groupId, "safety");
  assert.equal(runBody.capture.started, true);
  assert.equal(runBody.capture.stop.fileName, "voyage-bite.zip");
  assert.deepEqual(captureCommands, [
    { enabled: false },
    { start: true },
    { stop: true },
    { enabled: true },
  ]);
  assert.equal(trafficCommands[0].profiles.current, "coastal");
  assert.deepEqual(trafficCommands[1], { profile: "coastal" });
  assert.deepEqual(trafficCommands[2], { autoProfile: { enabled: false } });
  assert.equal(trafficCommands[3].muted, false);
  assert.equal(trafficCommands[3].automuteStationary, true);
  assert.ok(trafficCommands.some((command) => command.muted === false));
  assert.equal(trafficCommands.at(-4).profiles.current, "coastal");
  assert.deepEqual(trafficCommands.at(-3), { profile: "coastal" });
  assert.equal(trafficCommands.at(-2).autoProfile.enabled, true);
  assert.equal(trafficCommands.at(-1).muted, true);
  assert.equal(runBody.reports.length, 3);
  assert.deepEqual(runBody.reports.map((report) => report.testId), [
    "preflight-safety",
    "skipper-settings-sanity",
    "audio-output-summary",
  ]);
  assert.equal(runBody.reports[0].assertions.find((item) => item.id === "bite-settings-snapshot").pass, true);
  assert.equal(runBody.reports[0].assertions.find((item) => item.id === "bite-settings-defaults-applied").pass, true);
  assert.equal(runBody.reports[1].assertions.find((item) => item.id === "skipper-profile-thresholds-sensible").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "bite-settings-restored").pass, true);
  assert.match(
    values["plugins.ajrmMarineNotifications.audio"].audioRequest.message,
    /Marine built in tests complete\. 2 tests passed/,
  );
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.priorityScore, 500);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.preempt, false);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].audioRequest.force, true);
  assert.equal(values["plugins.ajrmMarineNotifications.audio"].event.delivery.force, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-published").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-forced").pass, true);
  assert.equal(runBody.reports.at(-1).assertions.find((item) => item.id === "summary-audio-completed").pass, true);
  const savedRunAllReports = fs.readdirSync(reportsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(reportsDir, name), "utf8")))
    .filter((report) => report.testId === "run-group:safety");
  assert.ok(
    savedRunAllReports.some((report) =>
      report.phase === "before-capture-stop" &&
      report.ok === true &&
      report.capture.started === true &&
      report.capture.stop === null
    ),
    "run-all summary is written before Capture stops so it is included in the voyage zip",
  );
  statusBody = null;
  routes.get("GET /ajrmMarineConsole/bite/status")({}, {
    json(value) {
      statusBody = value;
    },
  });
  assert.equal(statusBody.lastRunAllReport.testId, "run-group:safety");
  assert.deepEqual(statusBody.lastRunAllReport.reports.map((report) => report.testId), [
    "preflight-safety",
    "skipper-settings-sanity",
    "audio-output-summary",
  ]);

  statusCode = 0;
  runBody = null;
  await routes.get("POST /ajrmMarineConsole/bite/run-group")(
    { body: { groupId: "core", timeoutSeconds: 5 } },
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
  assert.equal(runBody.scenario, "run-group");
  assert.equal(runBody.testId, "run-group:core");
  assert.equal(runBody.groupId, "core");
  assert.equal(runBody.groupTitle, "Core suite readiness");
  assert.match(runBody.capture.comment, /AJRM Marine BITE Core suite readiness group/);
  assert.deepEqual(runBody.reports.map((report) => report.testId), [
    "preflight-safety",
    "core-projections",
    "projection-contracts",
    "audio-policy-consistency",
    "audio-renderer-readiness",
    "notifications-broker-health",
    "stationary-automute-policy-shape",
    "capture-api-contract",
    "traffic-api-contract",
    "audio-status-detail-contract",
    "notifications-visual-contract",
    "audio-playable-output-path",
    "audio-output-summary",
  ]);

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
