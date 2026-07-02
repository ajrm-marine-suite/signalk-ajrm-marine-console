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
const AUDIO_SUMMARY_PRIORITY = 150;
const HARBOUR_EDITOR_PLUGIN_ID = "signalk-ajrm-marine-harbour-editor";
const GPS_INTEGRITY_PLUGIN_ID = "signalk-ajrm-marine-gps-integrity";
const OWN_POSITION = { latitude: 56.21122, longitude: -5.55756 };
const TARGET_POSITION = { latitude: 56.21122, longitude: -5.54756 };
const QUIET_TARGET_POSITION = { latitude: 56.24122, longitude: -5.49756 };
const DR_EXERCISE_CURRENT_SET_RAD = Math.PI / 2;
const DR_EXERCISE_CURRENT_DRIFT_MPS = 1 * KNOTS_TO_MPS;

const WATCH_PATHS = {
  traffic: "plugins.ajrmMarineTraffic.targets",
  trafficAudioPolicy: "plugins.ajrmMarineTraffic.audioPolicy",
  notifications: "plugins.ajrmMarineNotifications",
  notificationsAudio: "plugins.ajrmMarineNotifications.audio",
  audio: "plugins.ajrmMarineAudio",
  display: "plugins.ajrmMarineDisplay",
  harbourEditor: "plugins.ajrmMarineHarbourEditor",
  gpsIntegrity: "plugins.ajrmMarineGpsIntegrity.navigationIntegrity",
  gpsIntegrityNotification: "notifications.navigation.gnss.integrity",
};
const REQUIRED_SUITE_PLUGINS = Object.freeze(packageInfo.signalk?.requires || []);
const PREFLIGHT_TEST_ID = "preflight-safety";
let reportFileSequence = 0;
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
    id: "gps-integrity-health",
    number: 8,
    title: "GPS Integrity health",
    description: "Optional check that GPS Integrity is publishing trust, fix, counter, and timestamp state in a coherent form.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-lost-age-consistency",
    number: 9,
    title: "GPS lost age consistency",
    description: "Optional check that GPS-lost wording and timestamps do not come from a stale cached source when a fresher loss is known.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "dead-reckoning-projection",
    number: 10,
    title: "Dead reckoning projection",
    description: "Optional check that operational and independent DR projections expose positions, ages, uncertainty, and vector roles coherently.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "dead-reckoning-loss-exercise",
    number: 11,
    title: "DR GPS-loss exercise",
    description: "Optional active test that injects a trusted GPS/current baseline, removes GPS and current, and checks operational DR moves using the retained current vector.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-recovery-realigns-dr",
    number: 12,
    title: "GPS recovery realigns DR",
    description: "Optional active test that lets retained-current DR drift after GPS loss, restores GPS, and checks operational DR locks back to GPS.",
    timeoutSeconds: 30,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-jump-rejection",
    number: 13,
    title: "GPS jump rejection",
    description: "Optional active test that injects an impossible GPS jump and checks GPS Integrity rejects it without moving the trusted baseline.",
    timeoutSeconds: 20,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-intermittent-outage-count",
    number: 14,
    title: "GPS intermittent outage count",
    description: "Optional active test that repeats missing-GPS samples and checks a continuous outage is counted once rather than once per update.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "docked-no-dr-drift",
    number: 15,
    title: "Docked no-DR-drift",
    description: "Optional active test that injects a stationary healthy GPS fix with tide running and checks independent DR does not drift away.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-recovery-fresh-fix",
    number: 16,
    title: "GPS recovery fresh fix",
    description: "Optional active test that loses GPS, restores it, and checks the restored GPS fix timestamp is fresh rather than inherited from an old cache.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "lost-gps-retained-current-source",
    number: 17,
    title: "Lost-GPS retained current source",
    description: "Optional active test that removes GPS and live current together and checks DR explicitly uses the last trusted current vector.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "stationary-automute-policy-shape",
    number: 18,
    title: "Stationary automute policy shape",
    description: "Checks that Traffic's shared audio policy exposes enough state to prove whether stationary automute is armed, allowed, and active.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-output-summary",
    number: 99,
    title: "Audible summary output",
    description: "Publishes a final spoken BITE summary so the skipper can confirm the selected audio output was actually heard.",
    timeoutSeconds: 75,
  },
  {
    id: "harbour-editor-availability",
    number: 90,
    title: "Harbour Editor availability",
    description: "Optional check that AJRM Marine Harbour Editor is installed, enabled, and visible to Console.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: HARBOUR_EDITOR_PLUGIN_ID,
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
const AJRM_MARINE_TRAFFIC_API_REGISTRY = Symbol.for("ajrmMarineTrafficApi");

function createBiteController(app, { pluginId, version }) {
  let running = false;
  let reports = loadReports();
  let lastRunAllReport = null;
  let currentRunAll = null;

  return {
    status() {
      const currentReports = reports.filter((report) => report.consoleVersion === version);
      return {
        ok: true,
        contract: "ajrm-marine-console-bite-status",
        contractVersion: 1,
        version,
        running,
        currentRunAll,
        lastReport: currentReports.at(-1) || null,
        lastRunAllReport: lastRunAllReport?.consoleVersion === version ? lastRunAllReport : null,
        reports: reports.slice(-MAX_REPORTS),
        reportsDirectory: reportsDirectory(),
        tests: biteTestsForApp(app),
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
        const test = biteTestsForApp(app).find((item) => item.id === testId);
        if (!test) {
          const error = new Error(`Unknown BITE test: ${testId}`);
          error.statusCode = 400;
          throw error;
        }
        if (test.enabled === false) {
          const error = new Error(test.disabledReason || `BITE test ${testId} is not available.`);
          error.statusCode = 409;
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
      currentRunAll = null;
      try {
        lastRunAllReport = await runAllBiteTests(app, {
          pluginId,
          consoleVersion: version,
          timeoutSeconds: options.timeoutSeconds,
          onProgress: (progress) => {
            currentRunAll = progress;
          },
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
        currentRunAll = null;
      }
    },
  };
}

async function runAllBiteTests(app, { pluginId, consoleVersion, timeoutSeconds, recordReport, onProgress }) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const reports = [];
  const capture = captureApi(app);
  const traffic = trafficApi(app);
  const captureComment = `AJRM Marine BITE ${new Date().toISOString()}`;
  let captureStart = null;
  let captureStop = null;
  let captureError = null;
  let captureWasAutomatic = null;
  let trafficWasMuted = null;
  let restoreError = null;
  const progress = (extra = {}) => {
    if (typeof onProgress !== "function") return;
    onProgress({
      ok: true,
      contract: "ajrm-marine-console-bite-run-all-progress",
      contractVersion: 1,
      consoleVersion,
      runId,
      startedAt,
      capture: {
        comment: captureComment,
        started: Boolean(captureStart),
        start: captureStart,
        stop: captureStop,
        error: captureError,
        automaticRecordingBeforeTest: captureWasAutomatic,
      },
      trafficAudio: {
        mutedBeforeTest: trafficWasMuted,
        restoreError,
      },
      reports: [...reports],
      ...extra,
    });
  };

  try {
    progress({ phase: "running", currentTestId: PREFLIGHT_TEST_ID });
    const preflight = await runPreflightBite(app, {
      consoleVersion,
      timeoutMs: boundedTimeout(TESTS.find((test) => test.id === PREFLIGHT_TEST_ID)?.timeoutSeconds),
    });
    reports.push(preflight);
    if (typeof recordReport === "function") await recordReport(preflight);
    progress({ phase: preflight.ok ? "passed" : "failed", currentTestId: PREFLIGHT_TEST_ID });
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
    if (traffic?.status && traffic?.setAudioPolicy) {
      try {
        const trafficStatus = await traffic.status();
        trafficWasMuted = trafficStatus?.audioPolicy?.muted === true;
        await traffic.setAudioPolicy({ muted: false });
        progress({ phase: "audio-unmuted", currentTestId: null });
      } catch (error) {
        restoreError = `Traffic audio setup failed: ${error.message || String(error)}`;
        progress({ phase: "audio-setup-failed", currentTestId: null });
      }
    }
    if (capture?.start) {
      if (capture?.status && capture?.setAutomaticRecordingEnabled) {
        const captureStatus = await capture.status();
        captureWasAutomatic = captureStatus?.enabled === true;
        await capture.setAutomaticRecordingEnabled(false);
        progress({ phase: "capture-auto-disabled", currentTestId: null });
      }
      captureStart = await capture.start({
        comment: captureComment,
        reason: "BITE run all",
      });
      progress({ phase: "capture-started", currentTestId: null });
      await delay(biteCaptureStartSettleMs());
      progress({ phase: "capture-start-settled", currentTestId: null });
    } else {
      captureError = "AJRM Marine Capture API is unavailable; BITE reports will still be written but no voyage bundle will be created.";
      progress({ phase: "capture-unavailable", currentTestId: null });
    }
    for (const test of runnableBiteTestsForApp(app)) {
      progress({ phase: "running", currentTestId: test.id });
      const report = await runBiteTestById(app, {
        pluginId,
        testId: test.id,
        consoleVersion,
        timeoutMs: boundedTimeout(timeoutSeconds || test.timeoutSeconds),
        priorReports: reports,
      });
      reports.push(report);
      if (typeof recordReport === "function") await recordReport(report);
      progress({ phase: report.ok ? "passed" : "failed", currentTestId: test.id });
    }
    if (typeof recordReport === "function" && captureStart && !captureStop) {
      await recordReport(runAllReport({
        consoleVersion,
        runId,
        startedAt,
        reports,
        captureStart,
        captureStop,
        captureError,
        captureComment,
        restoreError,
        phase: "before-capture-stop",
      }));
    }
  } finally {
    if (capture?.stop && captureStart) {
      try {
        captureStop = await capture.stop({ reason: "BITE run all complete" });
        progress({ phase: "capture-stopped", currentTestId: null });
      } catch (error) {
        captureError = error.message || String(error);
        progress({ phase: "capture-stop-failed", currentTestId: null });
      }
    }
    if (capture?.setAutomaticRecordingEnabled && captureWasAutomatic !== null) {
      try {
        await capture.setAutomaticRecordingEnabled(captureWasAutomatic);
        progress({ phase: "capture-auto-restored", currentTestId: null });
      } catch (error) {
        restoreError = `Capture automatic recording restore failed: ${error.message || String(error)}`;
        progress({ phase: "capture-auto-restore-failed", currentTestId: null });
      }
    }
    if (traffic?.setAudioPolicy && trafficWasMuted !== null) {
      try {
        await traffic.setAudioPolicy({ muted: trafficWasMuted });
        progress({ phase: "audio-restored", currentTestId: null });
      } catch (error) {
        restoreError = `Traffic audio restore failed: ${error.message || String(error)}`;
        progress({ phase: "audio-restore-failed", currentTestId: null });
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
    restoreError,
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
  restoreError,
  stoppedByPreflight = false,
  phase = "complete",
}) {
  const finishedAt = new Date().toISOString();
  const failed = reports.filter((report) => !report.ok);
  const ok = failed.length === 0 && !captureError && !restoreError;
  return {
    ok,
    contract: "ajrm-marine-console-bite-run-all-report",
    contractVersion: 1,
    consoleVersion,
    runId,
    testId: "run-all",
    scenario: "run-all",
    phase,
    result: ok ? "pass" : "fail",
    startedAt,
    finishedAt,
    durationSeconds: Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000),
    capture: {
      comment: captureComment || "",
      started: Boolean(captureStart),
      start: captureStart,
      stop: captureStop,
      error: captureError,
      restoreError,
    },
    reports,
    summary: stoppedByPreflight
      ? `BITE run all stopped by pre-test check: ${preflightReason(failed[0])}`
      : runAllSummary({ failed, captureStart, captureStop, captureError, restoreError, count: reports.length }),
  };
}

function biteTestsForApp(app) {
  return TESTS.map((test) => {
    if (!test.optional) return test;
    const evidence = optionalPluginEvidence(app, test.pluginId);
    return {
      ...test,
      enabled: evidence.installed,
      disabledReason: evidence.installed
        ? ""
        : `${test.title} is disabled because ${test.pluginId} is not installed, not enabled, or not visible to Console.`,
    };
  }).sort((left, right) => Number(left.number || 0) - Number(right.number || 0));
}

function runnableBiteTestsForApp(app) {
  return biteTestsForApp(app)
    .filter((item) => item.id !== PREFLIGHT_TEST_ID && item.enabled !== false)
    .sort((left, right) => {
      if (left.id === "audio-output-summary") return 1;
      if (right.id === "audio-output-summary") return -1;
      return Number(left.number || 0) - Number(right.number || 0);
    });
}

function preflightReason(report) {
  const failedAssertions = (report?.assertions || []).filter((item) => !item.pass);
  if (!failedAssertions.length) return report?.summary || "pre-test check failed.";
  return failedAssertions.map((item) => item.message).join(" ");
}

function captureApi(app) {
  return app.ajrmMarineCaptureApi || globalThis[AJRM_MARINE_CAPTURE_API_REGISTRY] || null;
}

function trafficApi(app) {
  return app.ajrmMarineTrafficApi || globalThis[AJRM_MARINE_TRAFFIC_API_REGISTRY] || null;
}

function biteCaptureStartSettleMs() {
  const value = Number(process.env.AJRM_MARINE_BITE_CAPTURE_START_SETTLE_MS);
  if (!Number.isFinite(value)) return 5000;
  return Math.max(0, Math.min(15000, value));
}

function biteAudioClientSettleMs() {
  const value = Number(process.env.AJRM_MARINE_BITE_AUDIO_CLIENT_SETTLE_MS);
  if (!Number.isFinite(value)) return 10000;
  return Math.max(0, Math.min(30000, value));
}

function runAllSummary({ failed, captureStart, captureStop, captureError, restoreError, count }) {
  const testText = `${count} BITE test${count === 1 ? "" : "s"}`;
  if (captureError) return `${testText} completed with Capture error: ${captureError}`;
  if (restoreError) return `${testText} completed with restore error: ${restoreError}`;
  const bundle = captureStop?.fileName || captureStop?.bundle?.fileName;
  const captureText = captureStart
    ? bundle
      ? `Capture bundle prepared: ${bundle}`
      : "Capture is still running; bundle will be prepared after this report."
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
    return runAudioOutputSummaryBite(app, { pluginId, consoleVersion, priorReports, timeoutMs });
  }
  if (testId === "harbour-editor-availability") {
    return runHarbourEditorAvailabilityBite(app, { consoleVersion });
  }
  if (testId === "quiet-target-no-alert") {
    return runQuietTargetNoAlertBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "gps-integrity-health") return runGpsIntegrityHealthBite(app, { consoleVersion });
  if (testId === "gps-lost-age-consistency") return runGpsLostAgeConsistencyBite(app, { consoleVersion });
  if (testId === "dead-reckoning-projection") return runDeadReckoningProjectionBite(app, { consoleVersion });
  if (testId === "dead-reckoning-loss-exercise") {
    return runDeadReckoningLossExerciseBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "gps-recovery-realigns-dr") return runGpsRecoveryRealignsDrBite(app, { pluginId, consoleVersion, timeoutMs });
  if (testId === "gps-jump-rejection") return runGpsJumpRejectionBite(app, { pluginId, consoleVersion, timeoutMs });
  if (testId === "gps-intermittent-outage-count") {
    return runGpsIntermittentOutageCountBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "docked-no-dr-drift") return runDockedNoDrDriftBite(app, { pluginId, consoleVersion, timeoutMs });
  if (testId === "gps-recovery-fresh-fix") return runGpsRecoveryFreshFixBite(app, { pluginId, consoleVersion, timeoutMs });
  if (testId === "lost-gps-retained-current-source") {
    return runLostGpsRetainedCurrentSourceBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "stationary-automute-policy-shape") return runStationaryAutomutePolicyShapeBite(app, { consoleVersion });
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

function optionalPluginEvidence(app, pluginId) {
  const availableWebapps = Array.isArray(app.ajrmMarineConsoleAvailableWebapps)
    ? app.ajrmMarineConsoleAvailableWebapps
    : discoverWebapps();
  const module = availableWebapps.find((candidate) =>
    candidate?.id === pluginId || candidate?.packageName === pluginId
  );
  const status = optionalPluginStatus(app, pluginId);
  return {
    pluginId,
    installed: Boolean(module),
    title: module?.title || "",
    version: module?.version || "",
    url: module?.url || "",
    kind: module?.kind || "",
    status,
  };
}

function optionalPluginStatus(app, pluginId) {
  if (pluginId === HARBOUR_EDITOR_PLUGIN_ID) {
    return readSelfPath(app, WATCH_PATHS.harbourEditor);
  }
  if (pluginId === GPS_INTEGRITY_PLUGIN_ID) {
    return readSelfPath(app, WATCH_PATHS.gpsIntegrity);
  }
  return null;
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

async function runAudioOutputSummaryBite(app, { pluginId, consoleVersion, priorReports = [], timeoutMs }) {
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
  const deliveryEvidence = publishError
    ? null
    : await waitForBiteAudioSummary(app, {
      message,
      startedAtMs,
      timeoutMs,
    });
  const clientSettleMs = deliveryEvidence ? biteAudioClientSettleMs() : 0;
  if (clientSettleMs > 0) {
    await delay(clientSettleMs);
  }
  const finalAudio = readSelfPath(app, WATCH_PATHS.audio) || audio;
  const assertions = [
    assertion(
      "summary-audio-forced",
      true,
      audio.muted === true
        ? "Audio is muted by Traffic, so the BITE summary was sent as a forced test announcement."
        : "BITE summary was sent as a forced test announcement.",
    ),
    assertion(
      "summary-audio-published",
      !publishError,
      publishError
        ? `Could not publish spoken BITE summary: ${publishError}`
        : "Spoken BITE summary was published to the Notifications audio projection.",
    ),
    assertion(
      "summary-audio-completed",
      Boolean(deliveryEvidence),
      deliveryEvidence
        ? `Audio reports the BITE summary reached ${deliveryEvidence.state}.`
        : `Audio has not yet reported the BITE summary as rendered or completed. ${audioProgressSummary(finalAudio)}`,
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
      audioEvidence: deliveryEvidence,
      clientSettleMs,
      audioProgress: audioProgressSummary(finalAudio),
    }],
    summary: result === "pass"
      ? "Spoken BITE summary was requested. Confirm it was heard on the selected audio output."
      : `Spoken BITE summary check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      message,
      audio: audioPolicySummary(finalAudio),
      audioDeliveryEvidence: deliveryEvidence,
      audioClientSettleMs: clientSettleMs,
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

async function waitForBiteAudioSummary(app, { message, startedAtMs, timeoutMs }) {
  const deadline = Date.now() + Math.max(5000, Number(timeoutMs) || 30000);
  do {
    const evidence = biteAudioSummaryEvidence(readSelfPath(app, WATCH_PATHS.audio), {
      message,
      startedAtMs,
    });
    if (evidence) return evidence;
    await delay(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  return null;
}

async function waitForSnapshot(app, { timeoutMs, predicate }) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 5000);
  do {
    const snapshot = collectSnapshot(app);
    if (predicate(snapshot)) return snapshot;
    await delay(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  return null;
}

async function publishAndWaitForGpsIntegrity(app, {
  pluginId,
  runId,
  phase,
  position,
  includeGps,
  includeCurrent,
  currentDriftMps = DR_EXERCISE_CURRENT_DRIFT_MPS,
  timeoutMs,
  predicate,
}) {
  publishDeadReckoningExerciseSample(app, {
    pluginId,
    runId,
    phase,
    position,
    includeGps,
    includeCurrent,
    currentDriftMps,
  });
  return waitForGpsIntegrity(app, { timeoutMs, predicate });
}

async function waitForGpsIntegrity(app, { timeoutMs, predicate }) {
  const snapshot = await waitForSnapshot(app, {
    timeoutMs,
    predicate: (candidate) => predicate(candidate.gpsIntegrity || {}),
  });
  return snapshot?.gpsIntegrity || null;
}

function biteAudioSummaryEvidence(audio, { message, startedAtMs }) {
  if (!audio || typeof audio !== "object") return null;
  const renderedEvent = (audio.recentEvents || []).find((event) =>
    audioEventMatchesSummary(event, { message, startedAtMs }) &&
    /rendered|completed/.test(String(event.event || "").toLowerCase())
  );
  if (renderedEvent) {
    return {
      state: renderedEvent.event || "rendered",
      ts: renderedEvent.ts || "",
      message: renderedEvent.message || "",
    };
  }
  const recentAnnouncement = (audio.recentAnnouncements || []).find((announcement) =>
    audioAnnouncementMatchesSummary(announcement, { message, startedAtMs }) &&
    (announcement.renderedAt || announcement.localPlaybackStartedAt || announcement.localPlaybackCompletedAt)
  );
  if (recentAnnouncement) {
    return {
      state: recentAnnouncement.localPlaybackCompletedAt
        ? "completed"
        : recentAnnouncement.localPlaybackStartedAt
          ? "speaker-started"
          : "rendered",
      ts: recentAnnouncement.renderedAt || recentAnnouncement.localPlaybackCompletedAt || recentAnnouncement.ts || "",
      message: recentAnnouncement.message || "",
    };
  }
  const last = audio.lastAnnouncement;
  if (
    audioAnnouncementMatchesSummary(last, { message, startedAtMs }) &&
    (last.renderedAt || last.localPlaybackStartedAt || last.localPlaybackCompletedAt)
  ) {
    return {
      state: last.localPlaybackCompletedAt
        ? "completed"
        : last.localPlaybackStartedAt
          ? "speaker-started"
          : "rendered",
      ts: last.localPlaybackCompletedAt || last.renderedAt || last.queuedAt || "",
      message: last.message || "",
    };
  }
  return null;
}

function audioEventMatchesSummary(event, { message, startedAtMs }) {
  if (!event || typeof event !== "object") return false;
  if (!String(event.message || "").includes(message)) return false;
  const tsMs = Date.parse(event.ts || "");
  return !Number.isFinite(tsMs) || tsMs >= startedAtMs;
}

function audioAnnouncementMatchesSummary(announcement, { message, startedAtMs }) {
  if (!announcement || typeof announcement !== "object") return false;
  if (!String(announcement.message || "").includes(message)) return false;
  const tsMs = Date.parse(
    announcement.renderedAt ||
    announcement.localPlaybackCompletedAt ||
    announcement.localPlaybackStartedAt ||
    announcement.queuedAt ||
    announcement.timestamp ||
    "",
  );
  return !Number.isFinite(tsMs) || tsMs >= startedAtMs;
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
      score: AUDIO_SUMMARY_PRIORITY,
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
      force: true,
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
            priorityScore: AUDIO_SUMMARY_PRIORITY,
            preempt: false,
            force: true,
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

async function runHarbourEditorAvailabilityBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, HARBOUR_EDITOR_PLUGIN_ID);
  const assertions = [
    assertion(
      "harbour-editor-installed",
      evidence.installed,
      evidence.installed
        ? "Harbour Editor is installed and visible to Console."
        : "Harbour Editor is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "harbour-editor-webapp-route",
      evidence.installed && evidence.url.length > 0,
      evidence.url
        ? `Harbour Editor webapp route is ${evidence.url}.`
        : "Harbour Editor webapp route is missing.",
    ),
    assertion(
      "harbour-editor-status",
      evidence.status?.contract === "ajrm-marine-harbour-editor-status" && evidence.status?.enabled === true,
      evidence.status?.contract === "ajrm-marine-harbour-editor-status"
        ? `Harbour Editor status reports ${evidence.status.harbourCount ?? "unknown"} harbour region(s).`
        : "Harbour Editor status projection is missing; Harbour Editor may be absent, disabled, still starting, or older than v0.5.5.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "harbour-editor-availability",
    testId: "harbour-editor-availability",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "Harbour Editor optional plugin is available."
      : `Harbour Editor optional plugin check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: evidence,
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

async function runGpsIntegrityHealthBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const counters = gpsIntegrity.counters || {};
  const gps = gpsIntegrity.gps || {};
  const trust = String(gpsIntegrity.trust || "");
  const timestampAgeSeconds = ageSeconds(gpsIntegrity.timestamp, startedAtMs);
  const validTrust = ["normal", "degraded", "suspect", "lost"].includes(trust);
  const assertions = [
    assertion(
      "gps-integrity-contract",
      gpsIntegrity.ok === true && Boolean(gpsIntegrity.timestamp),
      gpsIntegrity.ok === true
        ? "GPS Integrity projection is present."
        : "GPS Integrity projection is missing or not reporting ok=true.",
    ),
    assertion(
      "gps-trust-state",
      validTrust,
      validTrust
        ? `GPS trust state is ${trust}.`
        : `GPS trust state is missing or unexpected: ${trust || "none"}.`,
    ),
    assertion(
      "gps-fix-state-explicit",
      typeof gps.fixValid === "boolean" && typeof gpsIntegrity.acceptedGps === "boolean",
      "GPS Integrity should expose explicit fixValid and acceptedGps booleans.",
    ),
    assertion(
      "gps-counters-numeric",
      ["evaluations", "acceptedFixes", "rejectedFixes", "positionJumps", "lostFixes", "degradedSignals", "drDiscrepancies"]
        .every((key) => Number.isFinite(Number(counters[key]))),
      "GPS Integrity counters should all be numeric.",
    ),
    assertion(
      "gps-state-fresh-enough",
      timestampAgeSeconds === null || timestampAgeSeconds <= 60,
      timestampAgeSeconds === null
        ? "GPS Integrity timestamp age is not available; accepting because projection may be freshly initialising."
        : `GPS Integrity projection is ${Math.round(timestampAgeSeconds)} seconds old.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-integrity-health",
    testId: "gps-integrity-health",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: gpsIntegrityObservations(gpsIntegrity),
    summary: result === "pass"
      ? "GPS Integrity health projection is coherent."
      : `GPS Integrity health check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: gpsIntegritySummary(gpsIntegrity),
  });
}

async function runGpsLostAgeConsistencyBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const notification = snapshot.gpsIntegrityNotification || {};
  const evidence = gpsLostAgeEvidence(gpsIntegrity, notification, startedAtMs);
  const assertions = [
    assertion(
      "gps-lost-age-source-known",
      evidence.applicable === false || Boolean(evidence.ageSourceTimestamp),
      evidence.applicable === false
        ? "GPS is not currently lost; lost-age consistency is not applicable."
        : "GPS-lost age has a known source timestamp.",
    ),
    assertion(
      "gps-lost-age-not-stale-cache",
      evidence.staleCachedSource !== true,
      evidence.staleCachedSource === true
        ? `GPS-lost age appears to use stale position data (${evidence.reportedAgeSeconds}s) although a newer trusted fix exists.`
        : evidence.applicable === false
          ? "GPS is not currently lost."
          : "GPS-lost age is consistent with the available timestamps.",
    ),
    assertion(
      "gps-lost-notification-wording-consistent",
      evidence.messageAgeSeconds === null || evidence.reportedAgeSeconds === null || Math.abs(evidence.messageAgeSeconds - evidence.reportedAgeSeconds) <= 5,
      evidence.messageAgeSeconds === null
        ? "No explicit stale-age wording is active; accepting outside a spoken GPS-lost event."
        : `GPS-lost wording age ${evidence.messageAgeSeconds}s matches projection age ${evidence.reportedAgeSeconds ?? "unknown"}s.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-lost-age-consistency",
    testId: "gps-lost-age-consistency",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "GPS-lost age reporting is consistent."
      : `GPS-lost age consistency check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      gpsIntegrity: gpsIntegritySummary(gpsIntegrity),
      notification: notificationSummary(notification),
      evidence,
    },
  });
}

async function runDeadReckoningProjectionBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const operational = gpsIntegrity.operationalDeadReckoning || gpsIntegrity.deadReckoning || {};
  const integrity = gpsIntegrity.integrityDeadReckoning || {};
  const vectors = gpsIntegrity.vectors || {};
  const assertions = [
    assertion(
      "operational-dr-position",
      gpsIntegrity.trust !== "lost" || validPosition(operational.position),
      gpsIntegrity.trust === "lost"
        ? "Lost GPS should leave an operational DR position available."
        : "GPS is not lost; operational DR position is advisory.",
    ),
    assertion(
      "operational-dr-uncertainty",
      finiteNonNegative(operational.uncertaintyRadiusMeters ?? 0),
      `Operational DR uncertainty is ${operational.uncertaintyRadiusMeters ?? 0} meters.`,
    ),
    assertion(
      "integrity-dr-shape",
      !integrity.position || (
        validPosition(integrity.position) &&
        finiteNonNegative(integrity.uncertaintyRadiusMeters ?? 0) &&
        (integrity.ageSeconds == null || finiteNonNegative(integrity.ageSeconds))
      ),
      integrity.position
        ? "Independent DR position, age, and uncertainty are coherent."
        : "Independent DR is not yet established; accepting while GPS Integrity is initialising.",
    ),
    assertion(
      "dr-sources-named",
      !operational.position || typeof operational.source === "string",
      operational.source
        ? `Operational DR source is ${operational.source}.`
        : "Operational DR source is missing.",
    ),
    assertion(
      "navigation-vector-roles",
      vectorRolesCoherent(vectors),
      "DR vectors should identify course/heading/tide roles when available.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "dead-reckoning-projection",
    testId: "dead-reckoning-projection",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      trust: gpsIntegrity.trust || "",
      operationalSource: operational.source || "",
      integritySource: integrity.source || "",
      vectorKeys: Object.keys(vectors),
    }],
    summary: result === "pass"
      ? "Dead-reckoning projections are coherent."
      : `Dead-reckoning projection check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      gpsIntegrity: gpsIntegritySummary(gpsIntegrity),
      operational,
      integrity,
      vectors,
    },
  });
}

async function runDeadReckoningLossExerciseBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  const observations = [];
  let acceptedBaseline = null;
  let finalSnapshot = null;

  try {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "trusted-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
    });
    acceptedBaseline = await waitForSnapshot(app, {
      timeoutMs: Math.min(8000, Math.max(5000, timeoutMs / 3)),
      predicate: (snapshot) => {
        const state = snapshot.gpsIntegrity || {};
        return state.acceptedGps === true &&
          validPosition(state.lastTrustedFix?.position) &&
          currentAvailable(state.current || state.lastTrustedCurrent);
      },
    });
    observations.push({
      phase: "trusted-baseline",
      accepted: Boolean(acceptedBaseline),
      gpsIntegrity: gpsIntegritySummary(acceptedBaseline?.gpsIntegrity || {}),
    });

    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "gps-lost-current-unavailable",
      position: baselinePosition,
      includeGps: false,
      includeCurrent: false,
    });
    finalSnapshot = await waitForSnapshot(app, {
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (snapshot) => deadReckoningLossExerciseEvidence(snapshot.gpsIntegrity || {}, baselinePosition).complete,
    }) || collectSnapshot(app);
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }

  const gpsIntegrity = finalSnapshot?.gpsIntegrity || {};
  const evidence = deadReckoningLossExerciseEvidence(gpsIntegrity, baselinePosition);
  const assertions = [
    assertion(
      "dr-baseline-accepted",
      Boolean(acceptedBaseline),
      acceptedBaseline
        ? "GPS Integrity accepted the injected trusted GPS/current baseline."
        : "GPS Integrity did not accept the injected trusted GPS/current baseline before timeout.",
    ),
    assertion(
      "dr-gps-lost",
      gpsIntegrity.trust === "lost" && gpsIntegrity.gps?.fixValid === false,
      gpsIntegrity.trust === "lost"
        ? "GPS Integrity entered lost-GPS state after GPS was removed."
        : `GPS Integrity did not enter lost-GPS state; trust=${gpsIntegrity.trust || "unknown"}.`,
    ),
    assertion(
      "dr-retained-current",
      evidence.retainedCurrent,
      evidence.retainedCurrent
        ? "GPS Integrity is using a retained current vector after GPS loss."
        : "GPS Integrity did not report a retained current vector after GPS loss.",
    ),
    assertion(
      "dr-position-moved",
      evidence.distanceMeters >= 1,
      `Operational DR moved ${displayMeters(evidence.distanceMeters)} from the trusted GPS baseline.`,
    ),
    assertion(
      "dr-moved-with-current-set",
      evidence.eastMeters >= 0.5 && Math.abs(evidence.northMeters) <= Math.max(2, evidence.distanceMeters * 0.6),
      `Operational DR movement east=${displayMeters(evidence.eastMeters)}, north=${displayMeters(evidence.northMeters)}.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "dead-reckoning-loss-exercise",
    testId: "dead-reckoning-loss-exercise",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [...observations, evidence],
    summary: result === "pass"
      ? "Dead reckoning moved using retained current after GPS and live current were removed."
      : `Dead reckoning GPS-loss exercise failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      gpsIntegrity: gpsIntegritySummary(gpsIntegrity),
      evidence,
    },
  });
}

async function runGpsRecoveryRealignsDrBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let lost = null;
  let recovered = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "recovery-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 3),
      predicate: (state) => state.acceptedGps === true,
    });
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "recovery-gps-lost",
      position: baselinePosition,
      includeGps: false,
      includeCurrent: false,
    });
    lost = await waitForGpsIntegrity(app, {
      timeoutMs: Math.min(9000, timeoutMs / 3),
      predicate: (state) => deadReckoningLossExerciseEvidence(state, baselinePosition).complete,
    });
    recovered = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "recovery-gps-restored",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) => {
        const operational = state.operationalDeadReckoning || state.deadReckoning || {};
        return state.acceptedGps === true &&
          operational.source === "gps-locked" &&
          offsetMetersBetween(baselinePosition, operational.position).distanceMeters < 1;
      },
    });
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const evidence = {
    baseline: gpsIntegritySummary(baseline || {}),
    lost: gpsIntegritySummary(lost || {}),
    recovered: gpsIntegritySummary(recovered || {}),
    recoveredOffsetMeters: recovered
      ? offsetMetersBetween(baselinePosition, (recovered.operationalDeadReckoning || recovered.deadReckoning || {}).position)
      : null,
  };
  const assertions = [
    assertion("gps-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion("gps-loss-drifts", Boolean(lost), "Lost GPS should produce a retained-current DR drift."),
    assertion(
      "gps-recovery-accepted",
      Boolean(recovered?.acceptedGps),
      recovered?.acceptedGps ? "Restored GPS was accepted." : "Restored GPS was not accepted.",
    ),
    assertion(
      "operational-dr-gps-locked",
      (recovered?.operationalDeadReckoning || recovered?.deadReckoning || {}).source === "gps-locked",
      `Operational DR source after recovery is ${(recovered?.operationalDeadReckoning || recovered?.deadReckoning || {}).source || "missing"}.`,
    ),
    assertion(
      "operational-dr-realigned",
      !evidence.recoveredOffsetMeters || evidence.recoveredOffsetMeters.distanceMeters < 1,
      evidence.recoveredOffsetMeters
        ? `Operational DR is ${displayMeters(evidence.recoveredOffsetMeters.distanceMeters)} from restored GPS.`
        : "Recovered DR position was not available.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-recovery-realigns-dr",
    testId: "gps-recovery-realigns-dr",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "GPS recovery realigned operational DR to the restored GPS fix."
      : `GPS recovery realign check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: evidence,
  });
}

async function runGpsJumpRejectionBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  const jumpedPosition = { latitude: OWN_POSITION.latitude + 0.08, longitude: OWN_POSITION.longitude + 0.08 };
  let baseline = null;
  let jumped = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "jump-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 2),
      predicate: (state) => state.acceptedGps === true,
    });
    jumped = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "impossible-gps-jump",
      position: jumpedPosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) => state.trust === "suspect" || state.acceptedGps === false,
    });
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const trustedOffset = jumped
    ? offsetMetersBetween(baselinePosition, jumped.lastTrustedFix?.position)
    : null;
  const positionJumpsBefore = Number(baseline?.counters?.positionJumps || 0);
  const positionJumpsAfter = Number(jumped?.counters?.positionJumps || 0);
  const assertions = [
    assertion("jump-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion(
      "jump-rejected",
      jumped?.acceptedGps === false && (jumped?.trust === "suspect" || /Position jump/i.test((jumped?.reasons || []).join(" "))),
      jumped ? `Jump trust=${jumped.trust}; acceptedGps=${jumped.acceptedGps}.` : "Jump state was not observed.",
    ),
    assertion(
      "jump-counter-incremented",
      positionJumpsAfter >= positionJumpsBefore + 1,
      `Position jump counter before=${positionJumpsBefore}, after=${positionJumpsAfter}.`,
    ),
    assertion(
      "trusted-baseline-retained",
      trustedOffset !== null && trustedOffset.distanceMeters < 1,
      trustedOffset
        ? `Trusted baseline moved ${displayMeters(trustedOffset.distanceMeters)} after rejected jump.`
        : "Trusted baseline was not available after rejected jump.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-jump-rejection",
    testId: "gps-jump-rejection",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ trustedOffset, positionJumpsBefore, positionJumpsAfter }],
    summary: result === "pass"
      ? "Impossible GPS jump was rejected and the trusted baseline was retained."
      : `GPS jump rejection check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), jumped: gpsIntegritySummary(jumped || {}) },
  });
}

async function runGpsIntermittentOutageCountBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let lost = null;
  let repeatedLost = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "intermittent-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 3),
      predicate: (state) => state.acceptedGps === true,
    });
    const startingLostFixes = Number(baseline?.counters?.lostFixes || 0);
    for (let index = 0; index < 3; index += 1) {
      publishDeadReckoningExerciseSample(app, {
        pluginId,
        runId,
        phase: `intermittent-gps-lost-${index + 1}`,
        position: baselinePosition,
        includeGps: false,
        includeCurrent: false,
      });
      repeatedLost = await waitForGpsIntegrity(app, {
        timeoutMs: Math.min(5000, Math.max(1500, timeoutMs / 4)),
        predicate: (state) => state.trust === "lost" && state.gps?.fixValid === false,
      }) || repeatedLost;
      if (!lost) lost = repeatedLost;
      await delay(750);
    }
    repeatedLost = collectSnapshot(app).gpsIntegrity || repeatedLost;
    repeatedLost._startingLostFixes = startingLostFixes;
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const before = Number(repeatedLost?._startingLostFixes ?? baseline?.counters?.lostFixes ?? 0);
  const after = Number(repeatedLost?.counters?.lostFixes ?? before);
  const assertions = [
    assertion("intermittent-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion("intermittent-lost-observed", Boolean(lost), "GPS lost state should be observed."),
    assertion(
      "continuous-outage-counted-once",
      after === before + 1,
      `Lost-fix counter before=${before}, after=${after}; a continuous outage should add exactly one.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-intermittent-outage-count",
    testId: "gps-intermittent-outage-count",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ lostFixesBefore: before, lostFixesAfter: after }],
    summary: result === "pass"
      ? "Repeated missing-GPS samples were counted as one continuous outage."
      : `GPS intermittent outage count check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), lost: gpsIntegritySummary(repeatedLost || {}) },
  });
}

async function runDockedNoDrDriftBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let final = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "docked-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 3),
      predicate: (state) => state.acceptedGps === true,
    });
    const deadline = Date.now() + Math.max(5000, timeoutMs - (Date.now() - startedAtMs));
    do {
      publishDeadReckoningExerciseSample(app, {
        pluginId,
        runId,
        phase: "docked-stationary-gps",
        position: baselinePosition,
        includeGps: true,
        includeCurrent: true,
      });
      await delay(POLL_MS);
      final = collectSnapshot(app).gpsIntegrity || final;
    } while (Date.now() < deadline);
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const integrity = final?.integrityDeadReckoning || {};
  const baselineIntegrity = baseline?.integrityDeadReckoning || {};
  const operational = final?.operationalDeadReckoning || final?.deadReckoning || {};
  const integrityOffset = offsetMetersBetween(baselinePosition, integrity.position);
  const integrityMovement = offsetMetersBetween(baselineIntegrity.position, integrity.position);
  const operationalOffset = offsetMetersBetween(baselinePosition, operational.position);
  const assertions = [
    assertion("docked-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion("docked-gps-remained-accepted", final?.acceptedGps === true, "Healthy stationary GPS should remain accepted."),
    assertion(
      "independent-dr-did-not-drift",
      integrityMovement.distanceMeters < 1,
      `Independent DR moved ${displayMeters(integrityMovement.distanceMeters)} during the docked interval; final GPS offset is ${displayMeters(integrityOffset.distanceMeters)}.`,
    ),
    assertion(
      "operational-dr-remained-gps-locked",
      operational.source === "gps-locked" && operationalOffset.distanceMeters < 1,
      `Operational DR source=${operational.source || "missing"}, offset=${displayMeters(operationalOffset.distanceMeters)}.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "docked-no-dr-drift",
    testId: "docked-no-dr-drift",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ integrityOffset, integrityMovement, operationalOffset }],
    summary: result === "pass"
      ? "Healthy stationary GPS did not allow tide-only independent DR drift."
      : `Docked no-DR-drift check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), final: gpsIntegritySummary(final || {}) },
  });
}

async function runGpsRecoveryFreshFixBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  const recoveredPosition = offsetPositionMeters(baselinePosition, { eastMeters: 4, northMeters: 0 });
  let baseline = null;
  let lost = null;
  let recovered = null;
  let restoreStartedAtMs = 0;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "fresh-fix-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 3),
      predicate: (state) => state.acceptedGps === true,
    });
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "fresh-fix-gps-lost",
      position: baselinePosition,
      includeGps: false,
      includeCurrent: false,
    });
    lost = await waitForGpsIntegrity(app, {
      timeoutMs: Math.min(7000, timeoutMs / 3),
      predicate: (state) => state.trust === "lost" && state.gps?.fixValid === false,
    });
    restoreStartedAtMs = Date.now();
    recovered = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "fresh-fix-gps-restored",
      position: recoveredPosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) => {
        const stateTimestampMs = Date.parse(state.timestamp || "");
        const receivedMs = Date.parse(state.gps?.lastReceivedPositionTimestamp || state.gps?.positionTimestamp || "");
        return state.acceptedGps === true &&
          state.gps?.fixValid === true &&
          Number.isFinite(stateTimestampMs) &&
          stateTimestampMs >= restoreStartedAtMs - 1000 &&
          Number.isFinite(receivedMs) &&
          receivedMs >= restoreStartedAtMs - 1000;
      },
    });
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const lastTrustedMs = Date.parse(recovered?.lastTrustedFix?.timestamp || "");
  const receivedMs = Date.parse(recovered?.gps?.lastReceivedPositionTimestamp || recovered?.gps?.positionTimestamp || "");
  const trustedFresh = Number.isFinite(lastTrustedMs) && lastTrustedMs >= restoreStartedAtMs - 1000;
  const receivedFresh = Number.isFinite(receivedMs) && receivedMs >= restoreStartedAtMs - 1000;
  const assertions = [
    assertion("fresh-fix-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion("fresh-fix-lost-observed", Boolean(lost), "GPS lost state should be observed before recovery."),
    assertion("fresh-fix-recovered", recovered?.acceptedGps === true && recovered?.gps?.fixValid === true, "Restored GPS should be accepted."),
    assertion(
      "fresh-fix-trusted-timestamp",
      trustedFresh,
      trustedFresh
        ? "Last trusted fix timestamp was refreshed when GPS returned."
        : `Last trusted fix timestamp ${recovered?.lastTrustedFix?.timestamp || "missing"} was not refreshed after recovery.`,
    ),
    assertion(
      "fresh-fix-received-timestamp",
      receivedFresh,
      receivedFresh
        ? "Last received GPS timestamp was refreshed when GPS returned."
        : `Last received GPS timestamp ${recovered?.gps?.lastReceivedPositionTimestamp || recovered?.gps?.positionTimestamp || "missing"} was not refreshed after recovery.`,
    ),
    assertion(
      "fresh-fix-position-updated",
      recovered ? offsetMetersBetween(recoveredPosition, recovered.gps?.position).distanceMeters < 1 : false,
      recovered
        ? `Recovered GPS position is ${displayMeters(offsetMetersBetween(recoveredPosition, recovered.gps?.position).distanceMeters)} from the injected fresh fix.`
        : "Recovered GPS position was not observed.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-recovery-fresh-fix",
    testId: "gps-recovery-fresh-fix",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      restoreStartedAt: new Date(restoreStartedAtMs || startedAtMs).toISOString(),
      lastTrustedFixTimestamp: recovered?.lastTrustedFix?.timestamp || "",
      lastReceivedPositionTimestamp: recovered?.gps?.lastReceivedPositionTimestamp || "",
      positionTimestamp: recovered?.gps?.positionTimestamp || "",
    }],
    summary: result === "pass"
      ? "GPS recovery created a fresh trusted fix timestamp."
      : `GPS recovery fresh-fix check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), lost: gpsIntegritySummary(lost || {}), recovered: gpsIntegritySummary(recovered || {}) },
  });
}

async function runLostGpsRetainedCurrentSourceBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let lost = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "retained-current-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 2),
      predicate: (state) => state.acceptedGps === true && currentAvailable(state.current || state.lastTrustedCurrent),
    });
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "retained-current-gps-lost",
      position: baselinePosition,
      includeGps: false,
      includeCurrent: false,
    });
    lost = await waitForGpsIntegrity(app, {
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) => {
        const evidence = deadReckoningLossExerciseEvidence(state, baselinePosition);
        return state.trust === "lost" && evidence.retainedCurrent;
      },
    });
  } finally {
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "restore-gps",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      currentDriftMps: 0,
    });
  }
  const current = lost?.current || {};
  const lastTrustedCurrent = lost?.lastTrustedCurrent || {};
  const retainedSource = ["last-trusted-current", "retained-current"].includes(String(current.source || ""));
  const assertions = [
    assertion("retained-current-baseline-accepted", Boolean(baseline), "Trusted GPS/current baseline should be accepted."),
    assertion("retained-current-gps-lost", lost?.trust === "lost" && lost?.gps?.fixValid === false, "GPS should be lost after GPS and live current are removed."),
    assertion(
      "retained-current-source-explicit",
      retainedSource,
      retainedSource
        ? `Current source is explicitly ${current.source}.`
        : `Current source should be retained-current/last-trusted-current, got ${current.source || "missing"}.`,
    ),
    assertion(
      "last-trusted-current-still-available",
      currentAvailable(lastTrustedCurrent),
      currentAvailable(lastTrustedCurrent)
        ? "Last trusted current remains available for DR."
        : "Last trusted current is missing after GPS loss.",
    ),
    assertion(
      "live-current-not-trusted-after-gps-loss",
      String(current.source || "") !== "live",
      `Current source after GPS loss is ${current.source || "missing"}.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "lost-gps-retained-current-source",
    testId: "lost-gps-retained-current-source",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ current: currentSummary(current), lastTrustedCurrent: currentSummary(lastTrustedCurrent) }],
    summary: result === "pass"
      ? "Lost-GPS DR is explicitly using retained current rather than live GPS-derived current."
      : `Lost-GPS retained-current source check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), lost: gpsIntegritySummary(lost || {}) },
  });
}

async function runStationaryAutomutePolicyShapeBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const policy = snapshot.trafficAudioPolicy || {};
  const audio = snapshot.audio || {};
  const stationaryMode = policy.automaticMuteActive === true || /stationary|muted|harbou?r|anchor/i.test(String(policy.status || ""));
  const assertions = [
    assertion(
      "stationary-automute-config-visible",
      typeof policy.automuteStationary === "boolean" && typeof policy.automuteAllowed === "boolean",
      "Traffic audio policy should expose automuteStationary and automuteAllowed booleans.",
    ),
    assertion(
      "stationary-automute-active-visible",
      typeof policy.automaticMuteActive === "boolean",
      "Traffic audio policy should expose whether stationary automute is currently active.",
    ),
    assertion(
      "stationary-automute-status-visible",
      typeof policy.status === "string" && policy.status.length > 0,
      policy.status ? `Traffic audio policy status is: ${policy.status}` : "Traffic audio policy status text is missing.",
    ),
    assertion(
      "audio-follows-traffic-policy",
      policy.muted !== true || audio.engineMuted === true || audio.muted === true,
      policy.muted === true
        ? `Traffic muted=${policy.muted}; Audio engineMuted=${audio.engineMuted}; Audio muted=${audio.muted}.`
        : "Traffic policy is not muted; no stationary mute propagation is expected.",
    ),
    assertion(
      "stationary-mute-explained-when-active",
      !stationaryMode || policy.muted === true || policy.automuteAllowed === false,
      stationaryMode
        ? `Stationary status is visible; muted=${policy.muted}, automuteAllowed=${policy.automuteAllowed}.`
        : "Traffic is not currently reporting a stationary/harbour/anchor mute state.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "stationary-automute-policy-shape",
    testId: "stationary-automute-policy-shape",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ trafficAudioPolicy: trafficPolicySummary(policy), audio: audioPolicySummary(audio) }],
    summary: result === "pass"
      ? "Stationary automute policy shape is explicit and visible to Audio."
      : `Stationary automute policy shape check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { trafficAudioPolicy: trafficPolicySummary(policy), audio: audioPolicySummary(audio) },
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
  const sequence = String((reportFileSequence += 1)).padStart(4, "0");
  const testId = safeReportFilePart(report.testId || report.scenario || "report");
  const phase = report.phase && report.phase !== "complete"
    ? `-${safeReportFilePart(report.phase)}`
    : "";
  const result = safeReportFilePart(report.result || (report.ok ? "pass" : "unknown"));
  const runId = safeReportFilePart(String(report.runId || "").slice(0, 8));
  const fileName = `${safeTimestamp}-${sequence}-${testId}${phase}-${result}${runId ? `-${runId}` : ""}.json`;
  await fs.promises.writeFile(
    path.join(directory, fileName),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function safeReportFilePart(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

function publishDeadReckoningExerciseSample(app, {
  pluginId,
  runId,
  phase,
  position,
  includeGps,
  includeCurrent,
  currentDriftMps = DR_EXERCISE_CURRENT_DRIFT_MPS,
}) {
  const timestamp = new Date().toISOString();
  const currentSetValue = includeCurrent ? DR_EXERCISE_CURRENT_SET_RAD : null;
  const currentDriftValue = includeCurrent ? currentDriftMps : null;
  const gpsPosition = includeGps ? position : null;
  app.handleMessage?.(pluginId, {
    context: "vessels.self",
    updates: [{
      $source: `ajrm-marine-bite-dr-${runId}`,
      timestamp,
      values: [
        { path: "navigation.position", value: gpsPosition },
        { path: "navigation.speedOverGround", value: includeGps ? 0 : null },
        { path: "navigation.courseOverGroundTrue", value: includeGps ? 0 : null },
        { path: "navigation.speedThroughWater", value: 0 },
        { path: "navigation.headingTrue", value: 0 },
        { path: "navigation.gnss.methodQuality", value: includeGps ? "GNSS fix" : "no GPS" },
        { path: "navigation.gnss.horizontalDilution", value: includeGps ? 0.8 : null },
        { path: "navigation.gnss.satellites", value: includeGps ? 12 : 0 },
        { path: "environment.current.setTrue", value: currentSetValue },
        { path: "environment.current.drift", value: currentDriftValue },
        { path: "environment.tide.setTrue", value: currentSetValue },
        { path: "environment.tide.drift", value: currentDriftValue },
        { path: "plugins.ajrmMarineConsole.bite.deadReckoningExercise", value: { runId, phase, timestamp } },
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
    gpsIntegrity: readSelfPath(app, WATCH_PATHS.gpsIntegrity),
    gpsIntegrityNotification: readSelfPath(app, WATCH_PATHS.gpsIntegrityNotification),
  };
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
      gpsIntegrity: Boolean(snapshot.gpsIntegrity),
      gpsIntegrityNotification: Boolean(snapshot.gpsIntegrityNotification),
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
    gpsTrust: snapshot.gpsIntegrity?.trust || "",
    gpsFixValid: snapshot.gpsIntegrity?.gps?.fixValid ?? null,
    gpsAccepted: snapshot.gpsIntegrity?.acceptedGps ?? null,
    gpsLostFixes: snapshot.gpsIntegrity?.counters?.lostFixes ?? null,
  };
}

function gpsIntegritySummary(state = {}) {
  const gps = state.gps || {};
  const operational = state.operationalDeadReckoning || state.deadReckoning || {};
  const integrity = state.integrityDeadReckoning || {};
  return {
    ok: state.ok,
    timestamp: state.timestamp,
    trust: state.trust,
    notificationState: state.notificationState,
    acceptedGps: state.acceptedGps,
    acceptedManualFix: state.acceptedManualFix,
    reasons: Array.isArray(state.reasons) ? state.reasons.slice(0, 8) : [],
    counters: state.counters || {},
    gps: {
      fixValid: gps.fixValid,
      positionPresent: validPosition(gps.position),
      positionTimestamp: gps.positionTimestamp || "",
      lastReceivedPositionTimestamp: gps.lastReceivedPositionTimestamp || "",
      positionAgeSeconds: gps.positionAgeSeconds ?? null,
      hdop: gps.hdop ?? null,
      satellites: gps.satellites ?? null,
      speedOverGround: gps.speedOverGround ?? null,
      courseOverGroundTrue: gps.courseOverGroundTrue ?? null,
      headingTrue: gps.headingTrue ?? null,
    },
    lastTrustedFix: {
      positionPresent: validPosition(state.lastTrustedFix?.position),
      timestamp: state.lastTrustedFix?.timestamp || "",
      source: state.lastTrustedFix?.source || "",
    },
    current: currentSummary(state.current || {}),
    lastTrustedCurrent: currentSummary(state.lastTrustedCurrent || {}),
    operationalDeadReckoning: drSummary(operational),
    integrityDeadReckoning: drSummary(integrity),
    vectorKeys: Object.keys(state.vectors || {}),
  };
}

function currentSummary(current = {}) {
  return {
    available: current.available ?? currentAvailable(current),
    source: current.source || "",
    setTrueDegrees: current.setTrueDegrees ?? null,
    driftKnots: current.driftKnots ?? null,
    timestamp: current.timestamp || "",
    ageSeconds: current.ageSeconds ?? null,
  };
}

function drSummary(track = {}) {
  return {
    positionPresent: validPosition(track.position),
    uncertaintyRadiusMeters: track.uncertaintyRadiusMeters ?? null,
    ageSeconds: track.ageSeconds ?? null,
    source: track.source || "",
    lastRealignedAt: track.lastRealignedAt || "",
    realignIntervalSeconds: track.realignIntervalSeconds ?? null,
  };
}

function gpsIntegrityObservations(state = {}) {
  return [{
    ts: new Date().toISOString(),
    trust: state.trust || "",
    acceptedGps: state.acceptedGps ?? null,
    fixValid: state.gps?.fixValid ?? null,
    counters: state.counters || {},
    reasons: Array.isArray(state.reasons) ? state.reasons.slice(0, 4) : [],
  }];
}

function gpsLostAgeEvidence(state = {}, notification = {}, nowMs = Date.now()) {
  const trust = String(state.trust || "").toLowerCase();
  const gps = state.gps || {};
  const reasons = Array.isArray(state.reasons) ? state.reasons : [];
  const message = notificationMessage(notification);
  const applicable = trust === "lost" || gps.fixValid === false || /gps position is (missing|stale)|gps lost/i.test(message);
  const lastReceivedMs = Date.parse(gps.lastReceivedPositionTimestamp || "");
  const positionTimestampMs = Date.parse(gps.positionTimestamp || "");
  const trustedMs = Date.parse(state.lastTrustedFix?.timestamp || "");
  const ageSourceMs = Number.isFinite(lastReceivedMs)
    ? lastReceivedMs
    : Number.isFinite(positionTimestampMs)
      ? positionTimestampMs
      : Number.isFinite(trustedMs)
        ? trustedMs
        : NaN;
  const reportedAgeSeconds = Number.isFinite(Number(gps.positionAgeSeconds))
    ? Math.round(Number(gps.positionAgeSeconds))
    : Number.isFinite(ageSourceMs)
      ? Math.max(0, Math.round((nowMs - ageSourceMs) / 1000))
      : null;
  const messageAgeSeconds = staleAgeFromText([message, ...reasons].join(" "));
  const staleCachedSource = applicable
    && Number.isFinite(positionTimestampMs)
    && Number.isFinite(trustedMs)
    && trustedMs - positionTimestampMs > 30_000
    && (messageAgeSeconds == null || messageAgeSeconds > Math.round((nowMs - trustedMs) / 1000) + 30);
  return {
    applicable,
    trust,
    fixValid: gps.fixValid ?? null,
    ageSourceTimestamp: Number.isFinite(ageSourceMs) ? new Date(ageSourceMs).toISOString() : "",
    positionTimestamp: Number.isFinite(positionTimestampMs) ? new Date(positionTimestampMs).toISOString() : "",
    lastReceivedPositionTimestamp: Number.isFinite(lastReceivedMs) ? new Date(lastReceivedMs).toISOString() : "",
    lastTrustedFixTimestamp: Number.isFinite(trustedMs) ? new Date(trustedMs).toISOString() : "",
    reportedAgeSeconds,
    messageAgeSeconds,
    staleCachedSource,
    message,
    reasons: reasons.slice(0, 8),
  };
}

function notificationSummary(notification = {}) {
  return {
    state: notification.state || "",
    message: notificationMessage(notification),
    method: notification.method || [],
    timestamp: notification.timestamp || notification.value?.timestamp || "",
  };
}

function notificationMessage(notification = {}) {
  if (typeof notification === "string") return notification;
  return String(
    notification.message
      || notification.value?.message
      || notification.data?.message
      || notification.data?.notificationsPlus?.presentation?.message
      || notification.presentation?.message
      || "",
  );
}

function staleAgeFromText(text) {
  const match = String(text || "").match(/(?:stale|old|received|fix is)\D{0,40}(\d+)\s*seconds?/i);
  return match ? Number(match[1]) : null;
}

function validPosition(position) {
  return Number.isFinite(Number(position?.latitude))
    && Number.isFinite(Number(position?.longitude))
    && Math.abs(Number(position.latitude)) <= 90
    && Math.abs(Number(position.longitude)) <= 180;
}

function deadReckoningLossExerciseEvidence(state = {}, baselinePosition = OWN_POSITION) {
  const operational = state.operationalDeadReckoning || state.deadReckoning || {};
  const position = operational.position;
  const offsets = validPosition(position)
    ? offsetMetersBetween(baselinePosition, position)
    : { eastMeters: 0, northMeters: 0, distanceMeters: 0 };
  const retainedCurrent =
    state.current?.source === "last-trusted-current" ||
    state.current?.source === "retained-current" ||
    state.vectors?.tide?.source === "last-trusted-current" ||
    (state.trust === "lost" && state.lastTrustedCurrent && currentAvailable(state.lastTrustedCurrent));
  return {
    complete: state.trust === "lost" &&
      state.gps?.fixValid === false &&
      retainedCurrent &&
      validPosition(position) &&
      offsets.distanceMeters >= 1,
    trust: state.trust || "",
    fixValid: state.gps?.fixValid ?? null,
    operationalSource: operational.source || "",
    currentSource: state.current?.source || "",
    retainedCurrent,
    positionPresent: validPosition(position),
    eastMeters: offsets.eastMeters,
    northMeters: offsets.northMeters,
    distanceMeters: offsets.distanceMeters,
    current: state.current || null,
    lastTrustedCurrent: state.lastTrustedCurrent || null,
  };
}

function offsetMetersBetween(from, to) {
  if (!validPosition(from) || !validPosition(to)) {
    return { eastMeters: 0, northMeters: 0, distanceMeters: 0 };
  }
  const meanLatRad = ((Number(from.latitude) + Number(to.latitude)) / 2) * Math.PI / 180;
  const northMeters = (Number(to.latitude) - Number(from.latitude)) * 111_320;
  const eastMeters = (Number(to.longitude) - Number(from.longitude)) * 111_320 * Math.cos(meanLatRad);
  return {
    eastMeters,
    northMeters,
    distanceMeters: Math.sqrt(eastMeters ** 2 + northMeters ** 2),
  };
}

function offsetPositionMeters(position, { eastMeters = 0, northMeters = 0 } = {}) {
  if (!validPosition(position)) return position;
  const latitude = Number(position.latitude) + Number(northMeters || 0) / 111_320;
  const meanLatRad = Number(position.latitude) * Math.PI / 180;
  const longitude = Number(position.longitude) + Number(eastMeters || 0) / (111_320 * Math.cos(meanLatRad));
  return { latitude, longitude };
}

function currentAvailable(value = {}) {
  return value?.available === true ||
    (Number.isFinite(Number(value.setTrue)) && Number.isFinite(Number(value.drift)));
}

function displayMeters(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unknown";
  return `${number.toFixed(number < 10 ? 1 : 0)} m`;
}

function finiteNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function ageSeconds(timestamp, nowMs = Date.now()) {
  const timestampMs = Date.parse(timestamp || "");
  if (!Number.isFinite(timestampMs)) return null;
  return Math.max(0, (nowMs - timestampMs) / 1000);
}

function vectorRolesCoherent(vectors = {}) {
  const keys = Object.keys(vectors || {});
  if (!keys.length) return true;
  const text = JSON.stringify(vectors).toLowerCase();
  return (
    /heading|throughwater|stw|single/.test(text) ||
    /course|ground|cog|double/.test(text) ||
    /tide|current|drift|triple/.test(text)
  );
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

function audioProgressSummary(audio = {}) {
  const state = audio.timeline?.event?.state || audio.timelineState || "unknown";
  const queue = audio.queueLength ?? "unknown";
  const activeMessage = audio.active?.message || audio.preparing?.message || audio.lastAnnouncement?.message || "";
  const suffix = activeMessage
    ? ` Last audio message: ${String(activeMessage).slice(0, 120)}`
    : "";
  return `Audio state: ${state}; queue length: ${queue}.${suffix}`;
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
  biteAudioSummaryEvidence,
  publishSyntheticEncounter,
  unwrapSignalKLeaf,
};
