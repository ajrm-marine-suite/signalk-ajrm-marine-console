"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 45000;
const POLL_MS = 1000;
const REFRESH_MS = 2000;
const PREFLIGHT_LIVE_DATA_MAX_AGE_MS = 15000;
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
  display: "plugins.ajrmMarineDisplay",
};
const PREFLIGHT_TEST_ID = "preflight-safety";
const TESTS = [
  {
    id: PREFLIGHT_TEST_ID,
    number: 0,
    title: "Pre-test safety isolation",
    description: "Checks that simulator output and live navigation/instrument feeds are not active before BITE injects test data.",
    timeoutSeconds: 5,
    blocking: true,
  },
  {
    id: "collision-audio-chain",
    number: 1,
    title: "Collision visual/audio chain",
    description: "Publishes a temporary crossing target and checks Traffic, Display, Notifications, and Audio all react.",
    timeoutSeconds: 45,
  },
];
const LIVE_FEED_PATHS = [
  "navigation.position",
  "navigation.speedOverGround",
  "navigation.speedThroughWater",
  "navigation.courseOverGroundTrue",
  "navigation.headingTrue",
  "navigation.state",
  "environment.depth.belowTransducer",
  "environment.wind.speedApparent",
  "environment.wind.angleApparent",
  "environment.current.setTrue",
  "environment.current.drift",
  "propulsion.main.revolutions",
];
const DEFAULT_REPORTS_DIRECTORY = path.join(
  os.homedir(),
  ".signalk",
  "plugin-config-data",
  "signalk-ajrm-marine-console",
  "bite-reports",
);
const MAX_REPORTS = 50;
const AJRM_MARINE_CAPTURE_API_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarineCaptureApi");

function createBiteController(app, { pluginId, version }) {
  let running = false;
  let reports = loadReports();
  let lastRunAllReport = null;

  return {
    status() {
      const currentReports = reports.filter((report) => report.consoleVersion === version);
      const latestReportsByTest = latestReportMap(currentReports);
      return {
        ok: true,
        contract: "ajrm-marine-console-bite-status",
        contractVersion: 1,
        version,
        running,
        lastReport: currentReports.at(-1) || null,
        latestReportsByTest,
        lastRunAllReport: lastRunAllReport?.consoleVersion === version ? lastRunAllReport : null,
        reports: reports.slice(-MAX_REPORTS),
        reportsDirectory: reportsDirectory(),
        tests: TESTS,
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
        const testId = String(options.testId || TESTS[0].id);
        if (!TESTS.some((item) => item.id === testId)) {
          const error = new Error(`Unknown BITE test: ${testId}`);
          error.statusCode = 400;
          throw error;
        }
        const report = testId === PREFLIGHT_TEST_ID
          ? await runPreflightBite(app, { consoleVersion: version, timeoutMs: boundedTimeout(options.timeoutSeconds) })
          : await runCollisionAudioBite(app, {
              pluginId,
              testId,
              consoleVersion: version,
              timeoutMs: boundedTimeout(options.timeoutSeconds),
            });
        reports = [...reports, report].slice(-MAX_REPORTS);
        await saveReport(report);
        return report;
      } finally {
        running = false;
      }
    },
    async runAll(options = {}) {
      if (running) {
        const error = new Error("BITE run already in progress");
        error.statusCode = 409;
        throw error;
      }
      running = true;
      try {
        lastRunAllReport = await runAllBiteTests(app, {
          pluginId,
          consoleVersion: version,
          timeoutSeconds: options.timeoutSeconds,
          recordReport: async (report) => {
            reports = [...reports, report].slice(-MAX_REPORTS);
            await saveReport(report);
          },
        });
        reports = [...reports, lastRunAllReport].slice(-MAX_REPORTS);
        await saveReport(lastRunAllReport);
        return lastRunAllReport;
      } finally {
        running = false;
      }
    },
  };
}

async function runAllBiteTests(app, { pluginId, consoleVersion, timeoutSeconds, recordReport }) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const reports = [];
  const capture = captureApi(app);
  const captureComment = `AJRM Marine BITE ${new Date().toISOString()}`;
  let captureStart = null;
  let captureStop = null;
  let captureError = null;

  try {
    const preflight = await runPreflightBite(app, {
      consoleVersion,
      timeoutMs: boundedTimeout(TESTS.find((test) => test.id === PREFLIGHT_TEST_ID)?.timeoutSeconds),
    });
    reports.push(preflight);
    if (typeof recordReport === "function") await recordReport(preflight);
    if (!preflight.ok) {
      return runAllReport({
        consoleVersion,
        runId,
        startedAt,
        reports,
        captureStart,
        captureStop,
        captureError,
        stoppedByPreflight: true,
      });
    }
    if (capture?.start) {
      captureStart = await capture.start({
        comment: captureComment,
        reason: "BITE run all",
      });
    } else {
      captureError = "AJRM Marine Capture API is unavailable; BITE reports will still be written but no voyage bundle will be created.";
    }
    for (const test of TESTS.filter((item) => item.id !== PREFLIGHT_TEST_ID)) {
      const report = await runCollisionAudioBite(app, {
        pluginId,
        testId: test.id,
        consoleVersion,
        timeoutMs: boundedTimeout(timeoutSeconds || test.timeoutSeconds),
      });
      reports.push(report);
      if (typeof recordReport === "function") await recordReport(report);
    }
  } finally {
    if (capture?.stop && captureStart) {
      try {
        captureStop = await capture.stop({ reason: "BITE run all complete" });
      } catch (error) {
        captureError = error.message || String(error);
      }
    }
  }

  return runAllReport({
    consoleVersion,
    runId,
    startedAt,
    reports,
    captureStart,
    captureStop,
    captureError,
    captureComment,
  });
}

function runAllReport({
  consoleVersion,
  runId,
  startedAt,
  reports,
  captureStart,
  captureStop,
  captureError,
  captureComment,
  stoppedByPreflight = false,
}) {
  const finishedAt = new Date().toISOString();
  const failed = reports.filter((report) => !report.ok);
  return {
    ok: failed.length === 0 && !captureError,
    contract: "ajrm-marine-console-bite-run-all-report",
    contractVersion: 1,
    consoleVersion,
    runId,
    testId: "run-all",
    scenario: "run-all",
    result: failed.length === 0 && !captureError ? "pass" : "fail",
    startedAt,
    finishedAt,
    durationSeconds: Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000),
    capture: {
      comment: captureComment || "",
      started: Boolean(captureStart),
      start: captureStart,
      stop: captureStop,
      error: captureError,
    },
    reports,
    summary: stoppedByPreflight
      ? `BITE run all stopped by pre-test check: ${failed.map((item) => item.summary).filter(Boolean).join(" ")}`
      : runAllSummary({ failed, captureStart, captureStop, captureError, count: reports.length }),
  };
}

function captureApi(app) {
  return app.ajrmMarineCaptureApi || globalThis[AJRM_MARINE_CAPTURE_API_REGISTRY] || null;
}

function runAllSummary({ failed, captureStart, captureStop, captureError, count }) {
  const testText = `${count} BITE test${count === 1 ? "" : "s"}`;
  if (captureError) return `${testText} completed with Capture error: ${captureError}`;
  const bundle = captureStop?.fileName || captureStop?.bundle?.fileName;
  const captureText = captureStart
    ? bundle
      ? `Capture bundle prepared: ${bundle}`
      : "Capture started and stopped."
    : "Capture was not available.";
  if (failed.length) return `${failed.length} of ${testText} failed. ${captureText}`;
  return `${testText} passed. ${captureText}`;
}

async function runPreflightBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const simulatorEvidence = simulatorOutputEvidence(app);
  const liveFeedEvidence = recentLiveFeedEvidence(app, startedAtMs);
  const assertions = [
    assertion(
      "simulator-output-off",
      !simulatorEvidence.running,
      simulatorEvidence.running
        ? `Simulator output appears active: ${simulatorEvidence.message}`
        : "No active AJRM simulator output detected.",
    ),
    assertion(
      "no-live-own-vessel-feed",
      liveFeedEvidence.length === 0,
      liveFeedEvidence.length
        ? `Recent own-vessel feed detected on ${liveFeedEvidence.slice(0, 4).map((item) => item.path).join(", ")}. Stop live feeds or simulator output before BITE.`
        : "No fresh own-vessel navigation or instrument feed detected.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  const finishedAt = new Date().toISOString();
  return {
    ok: result === "pass",
    contract: "ajrm-marine-console-bite-report",
    contractVersion: 1,
    consoleVersion,
    runId,
    scenario: PREFLIGHT_TEST_ID,
    testId: PREFLIGHT_TEST_ID,
    result,
    startedAt,
    finishedAt,
    durationSeconds: Math.round((Date.parse(finishedAt) - startedAtMs) / 1000),
    assertions,
    observations: liveFeedEvidence.slice(0, 12),
    summary: result === "pass"
      ? "Pre-test safety isolation passed."
      : "Pre-test safety isolation failed. BITE run all has been blocked.",
    snapshot: {
      collectedAt: finishedAt,
      simulator: simulatorEvidence,
      liveFeed: liveFeedEvidence.slice(0, 12),
      maxLiveDataAgeSeconds: PREFLIGHT_LIVE_DATA_MAX_AGE_MS / 1000,
    },
  };
}

async function runCollisionAudioBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
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
    consoleVersion,
    runId,
    scenario: "collision-audio-chain",
    testId,
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

function loadReports() {
  try {
    const directory = reportsDirectory();
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(-MAX_REPORTS)
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

async function saveReport(report) {
  const directory = reportsDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "");
  const fileName = `${safeTimestamp}-${report.testId || report.scenario}-${report.result}.json`;
  await fs.promises.writeFile(
    path.join(directory, fileName),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function reportsDirectory() {
  return process.env.AJRM_MARINE_CONSOLE_BITE_REPORTS_DIR || DEFAULT_REPORTS_DIRECTORY;
}

function evaluateCollisionAudioSnapshot(snapshot, { startedAtMs, targetName, targetMmsi }) {
  const assertions = [];
  const trafficAlert = findTrafficAlert(snapshot.traffic, targetName, targetMmsi);
  const audioPolicy = snapshot.trafficAudioPolicy || {};
  const notificationsAudio = snapshot.notificationsAudio;
  const audio = snapshot.audio || {};
  const displayStatus = snapshot.display || {};
  const displayEvidence = findDisplayAlertEvidence(snapshot.notifications, {
    startedAtMs,
    targetName,
    targetMmsi,
  });
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
    "display-ready",
    displayStatus.enabled !== false && displayStatus.contract === "ajrm-marine-display-status",
    displayStatus.contract === "ajrm-marine-display-status"
      ? "Display status projection is present and enabled."
      : "Display status projection is not present.",
  ));
  assertions.push(assertion(
    "display-alert",
    Boolean(displayEvidence),
    displayEvidence
      ? `Display-facing alert projection contains ${displayEvidence.state} for ${displayEvidence.message}`
      : "Display-facing visual alert projection does not contain the BITE target.",
  ));
  assertions.push(assertion(
    "notifications-audio",
    Boolean(brokerEvidence || audioEvidence),
    brokerEvidence
      ? `Notifications published audio delivery: ${brokerEvidence.message}`
      : audioEvidence
        ? `Notifications audio delivery inferred from Audio ${audioEvidence.state}: ${audioEvidence.message}`
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
  const complete = Boolean(trafficAlert && displayEvidence && (audioEvidence || brokerEvidence || muted));
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
    display: readSelfPath(app, WATCH_PATHS.display),
  };
}

function latestReportMap(reports) {
  const result = {};
  for (const report of reports) {
    const id = report.testId || report.scenario;
    if (id && id !== "run-all") result[id] = report;
  }
  return result;
}

function readSelfPath(app, path) {
  try {
    return unwrapSignalKLeaf(app.getSelfPath?.(path));
  } catch (_error) {
    return null;
  }
}

function readSelfLeaf(app, path) {
  try {
    return app.getSelfPath?.(path) || null;
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

function simulatorOutputEvidence(app) {
  const candidates = [
    readSelfPath(app, "plugins.ajrmMarineSimulator"),
    readSelfPath(app, "plugins.signalkAjrmMarineSimulator"),
    readSelfPath(app, "plugins.signalk-ajrm-marine-simulator"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate?.outputEnabled === true || candidate?.state?.outputEnabled === true) {
      return { running: true, message: "outputEnabled=true", state: candidate };
    }
    const text = [
      candidate?.status,
      candidate?.state,
      candidate?.message,
      candidate?.pluginStatus,
    ].filter((item) => typeof item === "string").join(" ");
    if (/own boat|simulation output on|output enabled/i.test(text) && !/output off/i.test(text)) {
      return { running: true, message: text, state: candidate };
    }
  }
  return { running: false, message: "No simulator output status found.", state: candidates[0] || null };
}

function recentLiveFeedEvidence(app, nowMs) {
  return LIVE_FEED_PATHS
    .map((pathName) => liveFeedEvidenceForPath(app, pathName, nowMs))
    .filter(Boolean);
}

function liveFeedEvidenceForPath(app, pathName, nowMs) {
  const leaf = readSelfLeaf(app, pathName);
  const timestamp = timestampForLeaf(leaf);
  const timestampMs = Date.parse(timestamp || "");
  if (!Number.isFinite(timestampMs)) return null;
  const ageMs = nowMs - timestampMs;
  if (ageMs < 0 || ageMs > PREFLIGHT_LIVE_DATA_MAX_AGE_MS) return null;
  const source = sourceForLeaf(leaf);
  if (/ajrm-marine-bite/i.test(source)) return null;
  return {
    ts: new Date().toISOString(),
    path: pathName,
    timestamp,
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
    source,
    valueSummary: valueSummary(unwrapSignalKLeaf(leaf)),
  };
}

function timestampForLeaf(leaf) {
  if (!leaf || typeof leaf !== "object") return "";
  return leaf.timestamp || leaf.updated || leaf.ts || leaf.meta?.timestamp || "";
}

function sourceForLeaf(leaf) {
  if (!leaf || typeof leaf !== "object") return "";
  return String(
    leaf.$source
      || leaf.source
      || leaf.meta?.$source
      || leaf.meta?.source
      || leaf.values?.[0]?.$source
      || "",
  );
}

function valueSummary(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value.toPrecision(5))) : String(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, 120);
    } catch (_error) {
      return "[object]";
    }
  }
  return String(value);
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

function findDisplayAlertEvidence(value, { startedAtMs, targetName, targetMmsi }) {
  const candidates = flattenObjects(value);
  const freshTimestamp = candidates.some((candidate) =>
    freshEnough(candidate?.timestamp || candidate?.ts || candidate?.createdAt, startedAtMs),
  );
  const match = candidates.find((candidate) => {
    const state = String(candidate?.state || candidate?.priority?.level || "").toLowerCase();
    const message = candidate?.message || candidate?.presentation?.message || "";
    const visualEnabled = candidate?.delivery?.visual !== false;
    return visualEnabled
      && isAlertState(state)
      && (freshEnough(candidate?.timestamp || candidate?.ts || candidate?.createdAt, startedAtMs) || freshTimestamp)
      && messageMatches(message, targetName, targetMmsi);
  });
  if (!match) return null;
  return {
    ...match,
    state: String(match?.state || match?.priority?.level || "").toLowerCase(),
    message: match?.message || match?.presentation?.message || "",
  };
}

function isAlertState(state) {
  return [
    "warn",
    "warning",
    "alarm",
    "emergency",
    "danger",
    "critical",
  ].includes(String(state || "").toLowerCase());
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
      display: Boolean(snapshot.display),
    },
    trafficProfile: snapshot.traffic?.profile || "",
    trafficTargets: targets.length,
    trafficAlertStates: targets
      .map((target) => target?.encounter?.state)
      .filter((state) => state && state !== "normal"),
    audioMuted: snapshot.audio?.muted === true,
    displayEnabled: snapshot.display?.enabled !== false,
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
