"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageInfo = require("../package.json");
const { discoverWebapps } = require("./modules");

const DEFAULT_TIMEOUT_MS = 45000;
const POLL_MS = 1000;
const REFRESH_MS = 2000;
const PREFLIGHT_LIVE_DATA_MAX_AGE_MS = 15000;
const KNOTS_TO_MPS = 0.514444;
const TEST_TARGET_MMSI = "235912345";
const TEST_TARGET_NAME = "BITE TEST TARGET";
const QUIET_TEST_TARGET_MMSI = "235912346";
const QUIET_TEST_TARGET_NAME = "BITE QUIET TARGET";
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
const REQUIRED_SUITE_PLUGINS = Object.freeze(packageInfo.signalk?.requires || []);
const PREFLIGHT_TEST_ID = "preflight-safety";
const TESTS = [
  {
    id: PREFLIGHT_TEST_ID,
    number: 0,
    title: "Required plugins and safety isolation",
    description: "Checks that required AJRM Marine plugins are installed/enabled and that simulator or live feeds are not active before BITE injects test data.",
    timeoutSeconds: 5,
    blocking: true,
  },
  {
    id: "core-projections",
    number: 1,
    title: "Core status projections",
    description: "Checks that Traffic, Display, Notifications, and Audio are publishing the status paths BITE needs to observe.",
    timeoutSeconds: 10,
  },
  {
    id: "projection-contracts",
    number: 2,
    title: "Projection contracts",
    description: "Checks that core projections carry the expected contract names, versions, sessions, and sequence fields.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-policy-consistency",
    number: 3,
    title: "Audio policy consistency",
    description: "Checks that Traffic's authoritative mute policy is visible to Audio without disagreement.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-renderer-readiness",
    number: 4,
    title: "Audio renderer readiness",
    description: "Checks that Audio is enabled and its Piper/FFmpeg/rendering dependencies are either ready or explicitly reported unavailable.",
    timeoutSeconds: 5,
  },
  {
    id: "notifications-broker-health",
    number: 5,
    title: "Notifications broker health",
    description: "Checks that Notifications exposes broker state, audio sequence state, and bounded history/active arrays.",
    timeoutSeconds: 5,
  },
  {
    id: "collision-audio-chain",
    number: 6,
    title: "Collision visual/audio chain",
    description: "Publishes a temporary crossing target and checks Traffic, Display, Notifications, and Audio all react.",
    timeoutSeconds: 45,
  },
  {
    id: "quiet-target-no-alert",
    number: 7,
    title: "Quiet target no-alert",
    description: "Publishes a stopped/far-away target and checks the suite does not create a fresh visual or audible alert for it.",
    timeoutSeconds: 15,
  },
  {
    id: "audio-output-summary",
    number: 8,
    title: "Audible summary output",
    description: "Publishes a final spoken BITE summary so the skipper can confirm the selected audio output was actually heard.",
    timeoutSeconds: 5,
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
        const report = await runBiteTestById(app, {
          pluginId,
          testId,
          consoleVersion: version,
          timeoutMs: boundedTimeout(options.timeoutSeconds),
          priorReports: reports.filter((report) => report.consoleVersion === version),
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
      const report = await runBiteTestById(app, {
        pluginId,
        testId: test.id,
        consoleVersion,
        timeoutMs: boundedTimeout(timeoutSeconds || test.timeoutSeconds),
        priorReports: reports,
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
      ? `BITE run all stopped by pre-test check: ${preflightReason(failed[0])}`
      : runAllSummary({ failed, captureStart, captureStop, captureError, count: reports.length }),
  };
}

function preflightReason(report) {
  const failedAssertions = (report?.assertions || []).filter((item) => !item.pass);
  if (!failedAssertions.length) return report?.summary || "pre-test check failed.";
  return failedAssertions.map((item) => item.message).join(" ");
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

async function runBiteTestById(app, { pluginId, testId, consoleVersion, timeoutMs, priorReports = [] }) {
  if (testId === PREFLIGHT_TEST_ID) return runPreflightBite(app, { consoleVersion });
  if (testId === "core-projections") return runCoreProjectionBite(app, { consoleVersion });
  if (testId === "projection-contracts") return runProjectionContractsBite(app, { consoleVersion });
  if (testId === "audio-policy-consistency") return runAudioPolicyConsistencyBite(app, { consoleVersion });
  if (testId === "audio-renderer-readiness") return runAudioRendererReadinessBite(app, { consoleVersion });
  if (testId === "notifications-broker-health") return runNotificationsBrokerHealthBite(app, { consoleVersion });
  if (testId === "audio-output-summary") {
    return runAudioOutputSummaryBite(app, { pluginId, consoleVersion, priorReports });
  }
  if (testId === "quiet-target-no-alert") {
    return runQuietTargetNoAlertBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  return runCollisionAudioBite(app, { pluginId, testId, consoleVersion, timeoutMs });
}

async function runPreflightBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const requiredPluginEvidence = requiredSuitePluginEvidence(app);
  const simulatorEvidence = simulatorOutputEvidence(app);
  const liveFeedEvidence = recentLiveFeedEvidence(app, startedAtMs);
  const assertions = [
    assertion(
      "required-suite-plugins",
      requiredPluginEvidence.ok,
      requiredPluginEvidence.ok
        ? "All required AJRM Marine suite plugins are installed and publishing/available."
        : requiredPluginEvidence.message,
    ),
    assertion(
      "simulator-output-off",
      !simulatorEvidence.running,
      simulatorEvidence.running
        ? `AJRM Marine Simulator output is ON. Stop simulator output before running BITE. ${simulatorEvidence.message}`
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
      ? "Required plugin and pre-test safety checks passed."
      : `Required plugin or pre-test safety check failed. ${preflightReason({ assertions })}`,
    snapshot: {
      collectedAt: finishedAt,
      requiredPlugins: requiredPluginEvidence,
      simulator: simulatorEvidence,
      liveFeed: liveFeedEvidence.slice(0, 12),
      maxLiveDataAgeSeconds: PREFLIGHT_LIVE_DATA_MAX_AGE_MS / 1000,
    },
  };
}

function requiredSuitePluginEvidence(app) {
  const availableWebapps = Array.isArray(app.ajrmMarineConsoleAvailableWebapps)
    ? app.ajrmMarineConsoleAvailableWebapps
    : discoverWebapps();
  const installed = new Set(availableWebapps.map((module) => module.packageName || module.id));
  const installedMissing = REQUIRED_SUITE_PLUGINS.filter((id) => !installed.has(id));
  const snapshot = collectSnapshot(app);
  const runtimeChecks = [
    {
      id: "signalk-ajrm-marine-display",
      ok: snapshot.display?.enabled !== false && snapshot.display?.contract === "ajrm-marine-display-status",
      message: "Display status projection is missing, disabled, or not recognised.",
    },
    {
      id: "signalk-ajrm-marine-traffic",
      ok: Boolean(snapshot.traffic || snapshot.trafficAudioPolicy),
      message: "Traffic status projection is missing.",
    },
    {
      id: "signalk-ajrm-marine-notifications",
      ok: Boolean(snapshot.notifications || snapshot.notificationsAudio),
      message: "Notifications status projection is missing.",
    },
    {
      id: "signalk-ajrm-marine-audio",
      ok: Boolean(snapshot.audio),
      message: "Audio status projection is missing.",
    },
    {
      id: "signalk-ajrm-marine-capture",
      ok: Boolean(captureApi(app)?.start && captureApi(app)?.stop),
      message: "Capture API is unavailable.",
    },
  ].filter((item) => REQUIRED_SUITE_PLUGINS.includes(item.id));
  const runtimeFailures = runtimeChecks.filter((item) => !item.ok);
  const ok = installedMissing.length === 0 && runtimeFailures.length === 0;
  const parts = [];
  if (installedMissing.length) {
    parts.push(`Required AJRM Marine plugins are not installed: ${installedMissing.join(", ")}.`);
  }
  if (runtimeFailures.length) {
    parts.push(`Required AJRM Marine plugins are not enabled or not publishing status: ${runtimeFailures.map((item) => `${item.id} (${item.message})`).join("; ")}.`);
  }
  return {
    ok,
    required: REQUIRED_SUITE_PLUGINS,
    installed: REQUIRED_SUITE_PLUGINS.filter((id) => installed.has(id)),
    installedMissing,
    runtimeChecks,
    runtimeFailures,
    message: ok ? "All required AJRM Marine suite plugins are installed and publishing/available." : parts.join(" "),
  };
}

async function runCoreProjectionBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const assertions = [
    assertion(
      "traffic-projection",
      Boolean(snapshot.traffic || snapshot.trafficAudioPolicy),
      snapshot.traffic || snapshot.trafficAudioPolicy
        ? "Traffic status projection is present."
        : "Traffic status projection is missing.",
    ),
    assertion(
      "display-projection",
      snapshot.display?.enabled !== false && snapshot.display?.contract === "ajrm-marine-display-status",
      snapshot.display?.contract === "ajrm-marine-display-status"
        ? "Display status projection is present and enabled."
        : "Display status projection is missing or not recognised.",
    ),
    assertion(
      "notifications-projection",
      Boolean(snapshot.notifications || snapshot.notificationsAudio),
      snapshot.notifications || snapshot.notificationsAudio
        ? "Notifications projection is present."
        : "Notifications projection is missing.",
    ),
    assertion(
      "audio-projection",
      Boolean(snapshot.audio),
      snapshot.audio ? "Audio status projection is present." : "Audio status projection is missing.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "core-projections",
    testId: "core-projections",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Core status projections are present."
      : `Core status projection check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: summarizeSnapshot(snapshot),
  });
}

async function runAudioOutputSummaryBite(app, { pluginId, consoleVersion, priorReports = [] }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const audio = snapshot.audio || {};
  const reportsToSummarize = priorReports
    .filter((report) => report?.testId && report.testId !== "audio-output-summary" && report.testId !== "run-all");
  const failed = reportsToSummarize.filter((report) => !report.ok);
  const message = biteSummaryAudioMessage(reportsToSummarize);
  let publishError = "";
  try {
    publishBiteAudioSummary(app, { pluginId, runId, message });
  } catch (error) {
    publishError = error.message || String(error);
  }
  const assertions = [
    assertion(
      "audio-not-muted",
      audio.muted !== true,
      audio.muted === true
        ? "Audio is muted, so the spoken BITE summary is not expected to be heard."
        : "Audio is not muted for the spoken BITE summary.",
    ),
    assertion(
      "summary-audio-published",
      !publishError,
      publishError
        ? `Could not publish spoken BITE summary: ${publishError}`
        : "Spoken BITE summary was published to the Notifications audio projection.",
    ),
    assertion(
      "human-hearing-check-required",
      true,
      "This test verifies the software requested audio. The skipper confirms the physical output by listening for the summary.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "audio-output-summary",
    testId: "audio-output-summary",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      ts: new Date().toISOString(),
      message,
      precedingTests: reportsToSummarize.length,
      precedingFailures: failed.length,
    }],
    summary: result === "pass"
      ? "Spoken BITE summary was requested. Confirm it was heard on the selected audio output."
      : `Spoken BITE summary check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      message,
      audio: audioPolicySummary(audio),
      precedingTests: reportsToSummarize.map((report) => ({
        testId: report.testId,
        result: report.result,
        summary: report.summary,
      })),
    },
  });
}

function biteSummaryAudioMessage(reports) {
  const tested = reports.filter((report) => report?.testId && report.testId !== "run-all");
  const failed = tested.filter((report) => !report.ok);
  if (!tested.length) {
    return "Marine built in tests audio output check. If you can hear this, the selected audio output is working.";
  }
  if (!failed.length) {
    return `Marine built in tests complete. ${tested.length} tests passed. If you can hear this, the selected audio output is working.`;
  }
  const failedNames = failed
    .slice(0, 4)
    .map((report) => titleForTest(report.testId))
    .join(", ");
  return `Marine built in tests warning. ${failed.length} of ${tested.length} tests failed: ${failedNames}. If you can hear this, the selected audio output is working.`;
}

function titleForTest(testId) {
  return TESTS.find((test) => test.id === testId)?.title || String(testId || "unknown");
}

function publishBiteAudioSummary(app, { pluginId, runId, message }) {
  const timestamp = new Date().toISOString();
  const sequence = Date.now();
  const eventId = `ajrm-marine-bite-audio-summary-${runId}`;
  const subjectKey = "ajrm-marine-bite-audio-summary";
  const envelope = {
    contract: "ajrm-marine-notification-envelope",
    contractVersion: 1,
    eventId,
    subjectKey,
    source: pluginId,
    lifecycle: "event",
    timestamp,
    priority: {
      level: "information",
      score: 100,
    },
    presentation: {
      title: "BITE Audio Summary",
      category: "system",
      message,
      audioMessage: message,
    },
    delivery: {
      visual: false,
      audio: true,
      preempt: false,
      localPlayback: true,
      streamOutput: true,
      expiresSeconds: 60,
    },
    history: {
      policy: "always",
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    audioExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  app.handleMessage(pluginId, {
    context: "vessels.self",
    updates: [{
      $source: "ajrm-marine-bite",
      timestamp,
      values: [{
        path: WATCH_PATHS.notificationsAudio,
        value: {
          contract: "notifications-plus-audio-delivery",
          contractVersion: 1,
          sessionId: `ajrm-marine-bite-${runId}`,
          sequence,
          audioSequence: sequence,
          serverTime: timestamp,
          updatedAt: timestamp,
          audioRequest: {
            sequence,
            requestId: `${eventId}:${sequence}`,
            correlationId: eventId,
            subjectKey,
            eventId,
            message,
            priorityScore: 100,
            preempt: false,
            expiresAt: envelope.audioExpiresAt,
            outputs: {
              localSpeaker: true,
              companion: true,
              stream: true,
            },
          },
          event: envelope,
          lastAudioEvent: envelope,
        },
      }],
    }],
  });
}

async function runProjectionContractsBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const assertions = [
    assertion(
      "traffic-contract",
      snapshot.traffic?.contract === "ajrm-marine-traffic-targets" && snapshot.traffic?.contractVersion === 1,
      snapshot.traffic?.contract === "ajrm-marine-traffic-targets"
        ? "Traffic targets contract is recognised."
        : "Traffic targets contract is missing or unexpected.",
    ),
    assertion(
      "traffic-authoritative",
      snapshot.traffic?.authoritative === true && snapshot.traffic?.mode === "traffic",
      snapshot.traffic?.authoritative === true
        ? "Traffic projection is authoritative."
        : "Traffic projection is not marked authoritative.",
    ),
    assertion(
      "display-contract",
      snapshot.display?.contract === "ajrm-marine-display-status" && snapshot.display?.contractVersion === 1,
      snapshot.display?.contract === "ajrm-marine-display-status"
        ? "Display status contract is recognised."
        : "Display status contract is missing or unexpected.",
    ),
    assertion(
      "notifications-contract",
      snapshot.notifications?.contract === "notifications-plus-projection" && snapshot.notifications?.contractVersion === 1,
      snapshot.notifications?.contract === "notifications-plus-projection"
        ? "Notifications broker contract is recognised."
        : "Notifications broker contract is missing or unexpected.",
    ),
    assertion(
      "audio-contract",
      snapshot.audio?.contract === "ajrm-marine-audio-status" && snapshot.audio?.contractVersion === 1,
      snapshot.audio?.contract === "ajrm-marine-audio-status"
        ? "Audio status contract is recognised."
        : "Audio status contract is missing or unexpected.",
    ),
    assertion(
      "session-sequence-present",
      Boolean(snapshot.traffic?.sessionId && snapshot.traffic?.sequence && snapshot.notifications?.sessionId && snapshot.audio?.sessionId),
      "Core projections should expose session and sequence identifiers for debugging.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "projection-contracts",
    testId: "projection-contracts",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Core projection contracts are recognised."
      : `Projection contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: summarizeSnapshot(snapshot),
  });
}

async function runAudioPolicyConsistencyBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const trafficPolicy = snapshot.trafficAudioPolicy || {};
  const audio = snapshot.audio || {};
  const enginePolicy = audio.engineAudioPolicy || {};
  const assertions = [
    assertion(
      "traffic-policy-authoritative",
      trafficPolicy.contract === "ajrm-marine-traffic-audio-policy" && trafficPolicy.authoritative === true,
      trafficPolicy.contract === "ajrm-marine-traffic-audio-policy"
        ? "Traffic audio policy is authoritative."
        : "Traffic audio policy projection is missing or unexpected.",
    ),
    assertion(
      "audio-consumes-traffic-policy",
      Boolean(audio.engineAudioPolicy) && (audio.engineAudioPolicySequence === trafficPolicy.sequence || enginePolicy.sequence === trafficPolicy.sequence),
      Boolean(audio.engineAudioPolicy)
        ? "Audio has consumed Traffic's audio policy projection."
        : "Audio has not exposed an engine audio policy.",
    ),
    assertion(
      "mute-state-consistent",
      trafficPolicy.muted === audio.engineMuted && audio.muted === (audio.engineMuted === true || audio.pluginMuted === true),
      `Traffic muted=${trafficPolicy.muted}; Audio engineMuted=${audio.engineMuted}; Audio muted=${audio.muted}.`,
    ),
    assertion(
      "automute-state-explicit",
      typeof trafficPolicy.automuteStationary === "boolean"
        && typeof trafficPolicy.automuteAllowed === "boolean"
        && typeof trafficPolicy.status === "string",
      "Traffic audio policy should expose automute settings and a human-readable status.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "audio-policy-consistency",
    testId: "audio-policy-consistency",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Traffic and Audio mute policy projections are consistent."
      : `Audio policy consistency check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      trafficAudioPolicy: trafficPolicySummary(trafficPolicy),
      audio: audioPolicySummary(audio),
    },
  });
}

async function runAudioRendererReadinessBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const audio = snapshot.audio || {};
  const dependencies = audio.dependencies || {};
  const piperReady = dependencies.ok === true || dependencies.piperPlaybackAvailable === true;
  const explicitUnavailable = dependencies.ok === false && typeof dependencies.summary === "string" && dependencies.summary.length > 0;
  const outputSelected = audio.localPlayback === true || audio.liveStream === true || audio.publicHttpStream === true;
  const assertions = [
    assertion(
      "audio-enabled",
      audio.enabled === true,
      audio.enabled === true ? "Audio plugin is enabled." : "Audio plugin is disabled.",
    ),
    assertion(
      "renderer-dependencies-known",
      piperReady || explicitUnavailable,
      piperReady
        ? "Piper/FFmpeg rendering chain is ready."
        : explicitUnavailable
          ? `Renderer dependency state is explicitly reported: ${dependencies.summary}`
          : "Renderer dependency state is missing.",
    ),
    assertion(
      "output-state-explicit",
      outputSelected || audio.localPlaybackAvailable === false || dependencies.piperPlaybackAvailable === false,
      outputSelected
        ? "At least one Audio output path is selected."
        : "No output is selected, but Audio explicitly reports why playback is unavailable.",
    ),
    assertion(
      "queue-state-visible",
      Number.isFinite(Number(audio.queueLength)),
      "Audio queue length should be visible.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "audio-renderer-readiness",
    testId: "audio-renderer-readiness",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Audio renderer readiness is explicit."
      : `Audio renderer readiness check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      enabled: audio.enabled,
      muted: audio.muted,
      localPlayback: audio.localPlayback,
      localPlaybackAvailable: audio.localPlaybackAvailable,
      localPlaybackUnavailableReason: audio.localPlaybackUnavailableReason,
      liveStream: audio.liveStream,
      publicHttpStream: audio.publicHttpStream,
      queueLength: audio.queueLength,
      dependencies,
    },
  });
}

async function runNotificationsBrokerHealthBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const notifications = snapshot.notifications || {};
  const audioDelivery = snapshot.notificationsAudio || {};
  const assertions = [
    assertion(
      "broker-contract",
      notifications.contract === "notifications-plus-projection",
      notifications.contract === "notifications-plus-projection"
        ? "Notifications broker projection is present."
        : "Notifications broker projection is missing.",
    ),
    assertion(
      "broker-arrays",
      Array.isArray(notifications.active) && Array.isArray(notifications.history || notifications.recentActivity),
      "Notifications broker should expose active and history/recentActivity arrays.",
    ),
    assertion(
      "broker-audio-sequence",
      Number.isFinite(Number(notifications.audioSequence)),
      "Notifications broker should expose audioSequence.",
    ),
    assertion(
      "audio-delivery-shape",
      !audioDelivery.contract || audioDelivery.contract === "notifications-plus-audio-delivery",
      audioDelivery.contract
        ? "Latest Notifications audio delivery contract is recognised."
        : "No current Notifications audio delivery event is present; this is acceptable outside an active alert.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "notifications-broker-health",
    testId: "notifications-broker-health",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Notifications broker health projection is coherent."
      : `Notifications broker health check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      contract: notifications.contract,
      sessionId: notifications.sessionId,
      sequence: notifications.sequence,
      activeCount: Array.isArray(notifications.active) ? notifications.active.length : null,
      historyCount: Array.isArray(notifications.history) ? notifications.history.length : null,
      recentActivityCount: Array.isArray(notifications.recentActivity) ? notifications.recentActivity.length : null,
      audioSequence: notifications.audioSequence,
      latestAudioDeliveryContract: audioDelivery.contract || "",
    },
  });
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
    await clearSyntheticEncounter(app, { pluginId, runId });
  }

  const finishedAt = new Date().toISOString();
  return biteReport({
    consoleVersion,
    runId,
    scenario: "collision-audio-chain",
    testId,
    result,
    startedAt,
    target: {
      mmsi: TEST_TARGET_MMSI,
      name: TEST_TARGET_NAME,
    },
    assertions,
    observations: observations.slice(-12),
    summary: summaryFor(result, assertions),
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
    finishedAt,
    startedAtMs,
  });
}

async function runQuietTargetNoAlertBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const observations = [];
  let lastRefreshAt = 0;
  let finalSnapshot = null;
  let evaluation = null;

  try {
    publishSyntheticQuietTarget(app, { pluginId, runId });
    while (Date.now() - startedAtMs <= timeoutMs) {
      if (Date.now() - lastRefreshAt >= REFRESH_MS) {
        publishSyntheticQuietTarget(app, { pluginId, runId });
        lastRefreshAt = Date.now();
      }
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateQuietTargetSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: QUIET_TEST_TARGET_NAME,
        targetMmsi: QUIET_TEST_TARGET_MMSI,
      });
      if (evaluation.observation) observations.push(evaluation.observation);
      if (evaluation.complete) break;
      await delay(POLL_MS);
    }
    if (!evaluation) {
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateQuietTargetSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: QUIET_TEST_TARGET_NAME,
        targetMmsi: QUIET_TEST_TARGET_MMSI,
      });
    }
  } finally {
    publishSyntheticQuietTarget(app, { pluginId, runId });
  }

  const result = evaluation?.result || "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "quiet-target-no-alert",
    testId,
    result,
    startedAt,
    startedAtMs,
    target: {
      mmsi: QUIET_TEST_TARGET_MMSI,
      name: QUIET_TEST_TARGET_NAME,
    },
    assertions: evaluation?.assertions || [],
    observations: observations.slice(-12),
    summary: result === "pass"
      ? "Quiet BITE target did not create a fresh visual or audible alert."
      : `Quiet BITE target no-alert check failed: ${(evaluation?.assertions || []).filter((item) => !item.pass).map((item) => item.id).join(", ") || "unknown"}.`,
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
  });
}

function biteReport({
  consoleVersion,
  runId,
  scenario,
  testId,
  result,
  startedAt,
  startedAtMs,
  target,
  assertions,
  observations,
  summary,
  snapshot,
  finishedAt = new Date().toISOString(),
}) {
  const report = {
    ok: result === "pass",
    contract: "ajrm-marine-console-bite-report",
    contractVersion: 1,
    consoleVersion,
    runId,
    scenario,
    testId,
    result,
    startedAt,
    finishedAt,
    durationSeconds: Math.round((Date.parse(finishedAt) - startedAtMs) / 1000),
    assertions,
    observations,
    summary,
    snapshot,
  };
  if (target) report.target = target;
  return report;
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
  const muted = audioPolicy.muted === true || audio.muted === true;
  const audioEvidence = findAudioEvidence(audio, {
    startedAtMs,
    targetName,
    targetMmsi,
    preferSuppressed: muted,
  });
  const brokerEvidence = findBrokerAudioEvidence(notificationsAudio, {
    startedAtMs,
    targetName,
    targetMmsi,
  });
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

function evaluateQuietTargetSnapshot(snapshot, { startedAtMs, targetName, targetMmsi }) {
  const trafficAlert = findTrafficAlert(snapshot.traffic, targetName, targetMmsi);
  const displayEvidence = findDisplayAlertEvidence(snapshot.notifications, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict: true,
  });
  const audioEvidence = findAudioEvidence(snapshot.audio || {}, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict: true,
  });
  const brokerEvidence = findBrokerAudioEvidence(snapshot.notificationsAudio, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict: true,
  });
  const assertions = [
    assertion(
      "no-traffic-alert",
      !trafficAlert,
      trafficAlert
        ? `Traffic unexpectedly published ${trafficAlert.encounter?.state} for ${trafficAlert.name}.`
        : "Traffic did not publish an alert for the quiet target.",
    ),
    assertion(
      "no-display-alert",
      !displayEvidence,
      displayEvidence
        ? `Display-facing alert unexpectedly contains ${displayEvidence.state}: ${displayEvidence.message}`
        : "Display-facing alerts do not contain the quiet target.",
    ),
    assertion(
      "no-audio-alert",
      !(audioEvidence || brokerEvidence),
      audioEvidence || brokerEvidence
        ? `Audio path unexpectedly contains quiet target message: ${(audioEvidence || brokerEvidence).message || ""}`
        : "Audio path does not contain the quiet target.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return {
    complete: result === "pass",
    result,
    assertions,
    observation: trafficAlert || audioEvidence || brokerEvidence
      ? {
          ts: new Date().toISOString(),
          trafficState: trafficAlert?.encounter?.state || "",
          audioState: audioEvidence?.state || "",
          message: audioEvidence?.message || brokerEvidence?.message || displayEvidence?.message || "",
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

async function clearSyntheticEncounter(app, { pluginId, runId }) {
  for (let index = 0; index < 3; index += 1) {
    publishSyntheticEncounter(app, { pluginId, runId, quiet: true });
    await delay(REFRESH_MS);
  }
}

function publishSyntheticQuietTarget(app, { pluginId, runId }) {
  const timestamp = new Date().toISOString();
  const sourceName = `ajrm-marine-bite-${runId}`;

  app.handleMessage(pluginId, {
    context: "vessels.self",
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        { path: "navigation.position", value: OWN_POSITION },
        { path: "navigation.speedOverGround", value: 0 },
        { path: "navigation.speedThroughWater", value: 0 },
        { path: "navigation.courseOverGroundTrue", value: Math.PI / 2 },
        { path: "navigation.headingTrue", value: Math.PI / 2 },
        { path: "navigation.state", value: "stopped" },
      ],
    }],
  });
  app.handleMessage(pluginId, {
    context: `vessels.urn:mrn:imo:mmsi:${QUIET_TEST_TARGET_MMSI}`,
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        {
          path: "",
          value: {
            mmsi: QUIET_TEST_TARGET_MMSI,
            name: QUIET_TEST_TARGET_NAME,
          },
        },
        { path: "navigation.position", value: QUIET_TARGET_POSITION },
        { path: "navigation.speedOverGround", value: 0 },
        { path: "navigation.courseOverGroundTrue", value: 0 },
        { path: "navigation.state", value: "stopped" },
        { path: "design.length", value: { overall: 12 } },
        { path: "design.beam", value: 4 },
        { path: "sensors.ais.class", value: "B" },
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
      return {
        running: true,
        message: `status says outputEnabled=true${candidate?.own?.motionMode ? `, own vessel mode ${candidate.own.motionMode}` : ""}.`,
        state: candidate,
      };
    }
    const text = [
      candidate?.status,
      candidate?.state,
      candidate?.message,
      candidate?.pluginStatus,
    ].filter((item) => typeof item === "string").join(" ");
    if (/own boat|simulation output on|output enabled/i.test(text) && !/output off/i.test(text)) {
      return { running: true, message: `status says ${text}.`, state: candidate };
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

function findBrokerAudioEvidence(value, { startedAtMs, targetName, targetMmsi, strict = false }) {
  const candidates = flattenObjects(value);
  const freshTimestamp = candidates.some((candidate) =>
    freshEnough(candidateTimestamp(candidate), startedAtMs),
  );
  return candidates.find((candidate) =>
    (freshEnough(candidateTimestamp(candidate), startedAtMs) || freshTimestamp)
    && messageMatches(candidate?.message || candidate?.presentation?.message || candidate?.audioMessage, targetName, targetMmsi, {
      allowBiteWildcard: !strict,
    })
  ) || null;
}

function findDisplayAlertEvidence(value, { startedAtMs, targetName, targetMmsi, strict = false }) {
  const candidates = flattenObjects(value);
  const freshTimestamp = candidates.some((candidate) =>
    freshEnough(candidateTimestamp(candidate), startedAtMs),
  );
  const match = candidates.find((candidate) => {
    const state = String(candidate?.state || candidate?.priority?.level || "").toLowerCase();
    const message = candidate?.message || candidate?.presentation?.message || "";
    const visualEnabled = candidate?.delivery?.visual !== false;
    return visualEnabled
      && isAlertState(state)
      && (freshEnough(candidateTimestamp(candidate), startedAtMs) || freshTimestamp)
      && messageMatches(message, targetName, targetMmsi, { allowBiteWildcard: !strict });
  });
  if (!match) return null;
  return {
    ...match,
    state: String(match?.state || match?.priority?.level || "").toLowerCase(),
    message: match?.message || match?.presentation?.message || "",
  };
}

function candidateTimestamp(candidate) {
  return candidate?.timestamp
    || candidate?.updatedAt
    || candidate?.serverTime
    || candidate?.ts
    || candidate?.createdAt
    || "";
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

function findAudioEvidence(audio, {
  startedAtMs,
  targetName,
  targetMmsi,
  strict = false,
  preferSuppressed = false,
}) {
  const candidates = [];
  if (audio?.timeline?.event) candidates.push({ ...audio.timeline.event, source: "timeline" });
  for (const event of audio?.recentEvents || []) candidates.push({ ...event, source: "recentEvents" });
  for (const announcement of audio?.recentAnnouncements || []) {
    candidates.push({ ...announcement, state: "rendered", source: "recentAnnouncements" });
  }
  if (audio?.lastAnnouncement) {
    candidates.push({ ...audio.lastAnnouncement, state: "lastAnnouncement", source: "lastAnnouncement" });
  }
  const matches = candidates.filter((candidate) => {
    const ts = candidate.occurredAt || candidate.ts || candidate.renderedAt || candidate.receivedAt;
    const message = candidate.message || "";
    const state = String(candidate.state || candidate.event || "");
    return freshEnough(ts, startedAtMs)
      && messageMatches(message, targetName, targetMmsi, { allowBiteWildcard: !strict })
      && /accepted|queued|audio-ready|rendered|speaker|skipped|muted|lastAnnouncement/i.test(state);
  });
  const match = preferSuppressed
    ? matches.find((candidate) => /skipped|muted/i.test(String(candidate.state || candidate.event || ""))) || matches[0]
    : matches[0];
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

function messageMatches(message, targetName, targetMmsi, { allowBiteWildcard = true } = {}) {
  const text = String(message || "");
  return text.includes(targetName)
    || text.includes(targetMmsi)
    || (allowBiteWildcard && /BITE TEST/i.test(text));
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

function trafficPolicySummary(policy = {}) {
  return {
    contract: policy.contract,
    sequence: policy.sequence,
    correlationId: policy.correlationId,
    authoritative: policy.authoritative,
    muted: policy.muted,
    automuteStationary: policy.automuteStationary,
    automuteAllowed: policy.automuteAllowed,
    automaticMuteActive: policy.automaticMuteActive,
    manualOverride: policy.manualOverride,
    profile: policy.profile,
    status: policy.status,
  };
}

function audioPolicySummary(audio = {}) {
  return {
    contract: audio.contract,
    enabled: audio.enabled,
    muted: audio.muted,
    pluginMuted: audio.pluginMuted,
    engineMuted: audio.engineMuted,
    engineSessionId: audio.engineSessionId,
    engineAudioPolicySequence: audio.engineAudioPolicySequence,
    engineAudioPolicy: trafficPolicySummary(audio.engineAudioPolicy || {}),
    queueLength: audio.queueLength,
    timelineState: audio.timeline?.event?.state || "",
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
  evaluateQuietTargetSnapshot,
  publishSyntheticEncounter,
  unwrapSignalKLeaf,
};
