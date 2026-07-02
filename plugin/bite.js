"use strict";

const { randomUUID } = require("node:crypto");

const DEFAULT_TIMEOUT_MS = 45000;
const POLL_MS = 1000;
const REFRESH_MS = 2000;
const KNOTS_TO_MPS = 0.514444;
const TEST_TARGET_MMSI = "235912345";
const TEST_TARGET_NAME = "BITE TEST TARGET";
const OWN_POSITION = { latitude: 56.21122, longitude: -5.55756 };
const TARGET_POSITION = { latitude: 56.21122, longitude: -5.54756 };
const QUIET_TARGET_POSITION = { latitude: 56.24122, longitude: -5.49756 };

const WATCH_PATHS = {
  traffic: "plugins.ajrmMarineTraffic.targets",
  trafficAudioPolicy: "plugins.ajrmMarineTraffic.audioPolicy",
  notifications: "plugins.ajrmMarineNotifications",
  notificationsAudio: "plugins.ajrmMarineNotifications.audio",
  audio: "plugins.ajrmMarineAudio",
};

function createBiteController(app, { pluginId, version }) {
  let running = false;
  let lastReport = null;

  return {
    status() {
      return {
        ok: true,
        contract: "ajrm-marine-console-bite-status",
        contractVersion: 1,
        version,
        running,
        lastReport,
        watchPaths: WATCH_PATHS,
      };
    },
    async run(options = {}) {
      if (running) {
        const error = new Error("BITE run already in progress");
        error.statusCode = 409;
        throw error;
      }
      running = true;
      try {
        lastReport = await runCollisionAudioBite(app, {
          pluginId,
          timeoutMs: boundedTimeout(options.timeoutSeconds),
        });
        return lastReport;
      } finally {
        running = false;
      }
    },
  };
}

async function runCollisionAudioBite(app, { pluginId, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const assertions = [];
  const observations = [];
  let lastRefreshAt = 0;
  let finalSnapshot = null;
  let result = "fail";

  try {
    publishSyntheticEncounter(app, { pluginId, runId, quiet: false });
    while (Date.now() - startedAtMs <= timeoutMs) {
      if (Date.now() - lastRefreshAt >= REFRESH_MS) {
        publishSyntheticEncounter(app, { pluginId, runId, quiet: false });
        lastRefreshAt = Date.now();
      }
      finalSnapshot = collectSnapshot(app);
      const evaluation = evaluateCollisionAudioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: TEST_TARGET_NAME,
        targetMmsi: TEST_TARGET_MMSI,
      });
      if (evaluation.observation) observations.push(evaluation.observation);
      if (evaluation.complete) {
        result = evaluation.result;
        assertions.push(...evaluation.assertions);
        break;
      }
      await delay(POLL_MS);
    }
    if (!assertions.length) {
      finalSnapshot = collectSnapshot(app);
      const evaluation = evaluateCollisionAudioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: TEST_TARGET_NAME,
        targetMmsi: TEST_TARGET_MMSI,
      });
      result = evaluation.result;
      assertions.push(...evaluation.assertions);
    }
  } finally {
    publishSyntheticEncounter(app, { pluginId, runId, quiet: true });
  }

  const finishedAt = new Date().toISOString();
  return {
    ok: result === "pass",
    contract: "ajrm-marine-console-bite-report",
    contractVersion: 1,
    runId,
    scenario: "collision-audio-chain",
    result,
    startedAt,
    finishedAt,
    durationSeconds: Math.round((Date.parse(finishedAt) - startedAtMs) / 1000),
    target: {
      mmsi: TEST_TARGET_MMSI,
      name: TEST_TARGET_NAME,
    },
    assertions,
    observations: observations.slice(-12),
    summary: summaryFor(result, assertions),
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
  };
}

function evaluateCollisionAudioSnapshot(snapshot, { startedAtMs, targetName, targetMmsi }) {
  const assertions = [];
  const trafficAlert = findTrafficAlert(snapshot.traffic, targetName, targetMmsi);
  const audioPolicy = snapshot.trafficAudioPolicy || {};
  const notificationsAudio = snapshot.notificationsAudio;
  const audio = snapshot.audio || {};
  const audioEvidence = findAudioEvidence(audio, { startedAtMs, targetName, targetMmsi });
  const brokerEvidence = findBrokerAudioEvidence(notificationsAudio, {
    startedAtMs,
    targetName,
    targetMmsi,
  });
  const muted = audioPolicy.muted === true || audio.muted === true;

  assertions.push(assertion(
    "traffic-alert",
    Boolean(trafficAlert),
    trafficAlert
      ? `Traffic published ${trafficAlert.encounter?.state} for ${trafficAlert.name}.`
      : "Traffic has not published a warn/alarm/emergency for the BITE target.",
  ));
  assertions.push(assertion(
    "notifications-audio",
    Boolean(brokerEvidence),
    brokerEvidence
      ? `Notifications published audio delivery: ${brokerEvidence.message}`
      : "Notifications has not published matching audio delivery for the BITE target.",
  ));
  assertions.push(assertion(
    "audio-accepted",
    Boolean(audioEvidence),
    audioEvidence
      ? `Audio observed ${audioEvidence.state}: ${audioEvidence.message}`
      : "Audio has not accepted, queued, rendered, skipped, or muted matching BITE audio.",
  ));
  assertions.push(assertion(
    "mute-explicit",
    !muted || Boolean(audioEvidence?.suppressed),
    muted
      ? "Audio is muted and the status stream must show explicit skipped/muted evidence."
      : "Audio is not muted.",
  ));

  const hardFailures = assertions.filter((item) => !item.pass);
  const complete = Boolean(trafficAlert && (audioEvidence || brokerEvidence || muted));
  const result = hardFailures.length ? "fail" : "pass";
  return {
    complete: complete || Date.now() - startedAtMs >= DEFAULT_TIMEOUT_MS,
    result,
    assertions,
    observation: trafficAlert || audioEvidence
      ? {
          ts: new Date().toISOString(),
          trafficState: trafficAlert?.encounter?.state || "",
          audioState: audioEvidence?.state || "",
          message: audioEvidence?.message || brokerEvidence?.message || "",
        }
      : null,
  };
}

function publishSyntheticEncounter(app, { pluginId, runId, quiet }) {
  const timestamp = new Date().toISOString();
  const targetPosition = quiet ? QUIET_TARGET_POSITION : TARGET_POSITION;
  const targetSpeed = quiet ? 0 : 5 * KNOTS_TO_MPS;
  const targetCourse = quiet ? 0 : (270 * Math.PI) / 180;
  const ownSpeed = quiet ? 0 : 5 * KNOTS_TO_MPS;
  const ownCourse = quiet ? 0 : Math.PI / 2;
  const sourceName = `ajrm-marine-bite-${runId}`;

  app.handleMessage(pluginId, {
    context: "vessels.self",
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        { path: "navigation.position", value: OWN_POSITION },
        { path: "navigation.speedOverGround", value: ownSpeed },
        { path: "navigation.speedThroughWater", value: ownSpeed },
        { path: "navigation.courseOverGroundTrue", value: ownCourse },
        { path: "navigation.headingTrue", value: ownCourse },
        { path: "navigation.state", value: quiet ? "stopped" : "underWay" },
      ],
    }],
  });
  app.handleMessage(pluginId, {
    context: `vessels.urn:mrn:imo:mmsi:${TEST_TARGET_MMSI}`,
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        {
          path: "",
          value: {
            mmsi: TEST_TARGET_MMSI,
            name: quiet ? `${TEST_TARGET_NAME} QUIET` : TEST_TARGET_NAME,
          },
        },
        { path: "navigation.position", value: targetPosition },
        { path: "navigation.speedOverGround", value: targetSpeed },
        { path: "navigation.courseOverGroundTrue", value: targetCourse },
        { path: "navigation.state", value: quiet ? "stopped" : "underWay" },
        { path: "design.length", value: { overall: 60 } },
        { path: "design.beam", value: 12 },
        { path: "sensors.ais.class", value: "A" },
      ],
    }],
  });
}

function collectSnapshot(app) {
  return {
    collectedAt: new Date().toISOString(),
    traffic: readSelfPath(app, WATCH_PATHS.traffic),
    trafficAudioPolicy: readSelfPath(app, WATCH_PATHS.trafficAudioPolicy),
    notifications: readSelfPath(app, WATCH_PATHS.notifications),
    notificationsAudio: readSelfPath(app, WATCH_PATHS.notificationsAudio),
    audio: readSelfPath(app, WATCH_PATHS.audio),
  };
}

function readSelfPath(app, path) {
  try {
    return unwrapSignalKLeaf(app.getSelfPath?.(path));
  } catch (_error) {
    return null;
  }
}

function unwrapSignalKLeaf(value) {
  if (
    value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "value") &&
    !Object.prototype.hasOwnProperty.call(value, "contract")
  ) {
    return value.value;
  }
  return value || null;
}

function findTrafficAlert(traffic, targetName, targetMmsi) {
  const targets = Array.isArray(traffic?.targets) ? traffic.targets : [];
  return targets.find((target) => {
    const state = String(target?.encounter?.state || "").toLowerCase();
    return ["warn", "alarm", "emergency"].includes(state)
      && matchesTarget(target, targetName, targetMmsi)
      && target?.encounter?.silenced !== true;
  }) || null;
}

function findBrokerAudioEvidence(value, { startedAtMs, targetName, targetMmsi }) {
  const candidates = flattenObjects(value);
  const freshTimestamp = candidates.some((candidate) =>
    freshEnough(candidate?.timestamp || candidate?.ts || candidate?.createdAt, startedAtMs),
  );
  return candidates.find((candidate) =>
    (freshEnough(candidate?.timestamp || candidate?.ts || candidate?.createdAt, startedAtMs) || freshTimestamp)
    && messageMatches(candidate?.message || candidate?.presentation?.message || candidate?.audioMessage, targetName, targetMmsi)
  ) || null;
}

function findAudioEvidence(audio, { startedAtMs, targetName, targetMmsi }) {
  const candidates = [];
  if (audio?.timeline?.event) candidates.push({ ...audio.timeline.event, source: "timeline" });
  for (const event of audio?.recentEvents || []) candidates.push({ ...event, source: "recentEvents" });
  for (const announcement of audio?.recentAnnouncements || []) {
    candidates.push({ ...announcement, state: "rendered", source: "recentAnnouncements" });
  }
  if (audio?.lastAnnouncement) {
    candidates.push({ ...audio.lastAnnouncement, state: "lastAnnouncement", source: "lastAnnouncement" });
  }
  const match = candidates.find((candidate) => {
    const ts = candidate.occurredAt || candidate.ts || candidate.renderedAt || candidate.receivedAt;
    const message = candidate.message || "";
    const state = String(candidate.state || candidate.event || "");
    return freshEnough(ts, startedAtMs)
      && messageMatches(message, targetName, targetMmsi)
      && /accepted|queued|audio-ready|rendered|speaker|skipped|muted|lastAnnouncement/i.test(state);
  });
  if (!match) return null;
  const state = String(match.state || match.event || "");
  return {
    ...match,
    state,
    suppressed: /skipped|muted/i.test(state),
  };
}

function flattenObjects(value) {
  const result = [];
  visit(value);
  return result;

  function visit(item) {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    result.push(item);
    for (const child of Object.values(item)) visit(child);
  }
}

function messageMatches(message, targetName, targetMmsi) {
  const text = String(message || "");
  return text.includes(targetName) || text.includes(targetMmsi) || /BITE TEST/i.test(text);
}

function matchesTarget(target, targetName, targetMmsi) {
  return String(target?.name || "").includes(targetName)
    || String(target?.mmsi || "") === targetMmsi
    || String(target?.id || "").includes(targetMmsi);
}

function freshEnough(timestamp, startedAtMs) {
  const time = Date.parse(timestamp || "");
  return Number.isFinite(time) && time >= startedAtMs - 1000;
}

function assertion(id, pass, message) {
  return { id, pass: Boolean(pass), message };
}

function summarizeSnapshot(snapshot) {
  const targets = Array.isArray(snapshot.traffic?.targets)
    ? snapshot.traffic.targets
    : [];
  return {
    collectedAt: snapshot.collectedAt,
    pathsPresent: {
      traffic: Boolean(snapshot.traffic),
      trafficAudioPolicy: Boolean(snapshot.trafficAudioPolicy),
      notifications: Boolean(snapshot.notifications),
      notificationsAudio: Boolean(snapshot.notificationsAudio),
      audio: Boolean(snapshot.audio),
    },
    trafficProfile: snapshot.traffic?.profile || "",
    trafficTargets: targets.length,
    trafficAlertStates: targets
      .map((target) => target?.encounter?.state)
      .filter((state) => state && state !== "normal"),
    audioMuted: snapshot.audio?.muted === true,
    trafficAudioMuted: snapshot.trafficAudioPolicy?.muted === true,
    audioTimelineState: snapshot.audio?.timeline?.event?.state || "",
    audioQueueLength: snapshot.audio?.queueLength ?? null,
  };
}

function summaryFor(result, assertions) {
  const failed = assertions.filter((item) => !item.pass);
  if (result === "pass") return "BITE collision audio chain passed.";
  return `BITE collision audio chain failed: ${failed.map((item) => item.id).join(", ") || "unknown"}.`;
}

function boundedTimeout(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_TIMEOUT_MS;
  return Math.max(5, Math.min(120, seconds)) * 1000;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  TEST_TARGET_MMSI,
  TEST_TARGET_NAME,
  WATCH_PATHS,
  createBiteController,
  evaluateCollisionAudioSnapshot,
  publishSyntheticEncounter,
  unwrapSignalKLeaf,
};
