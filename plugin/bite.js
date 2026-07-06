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
const OVERTAKING_TEST_TARGET_MMSI = "235912347";
const OVERTAKING_TEST_TARGET_NAME = "BITE OVERTAKING TARGET";
const CLOSE_QUARTERS_TEST_TARGET_MMSI = "235912348";
const CLOSE_QUARTERS_TEST_TARGET_NAME = "BITE CLOSE TARGET";
const UNNAMED_TEST_TARGET_MMSI = "235912349";
const HEAD_ON_TEST_TARGET_MMSI = "235912350";
const HEAD_ON_TEST_TARGET_NAME = "BITE HEAD ON TARGET";
const GIVE_WAY_TEST_TARGET_MMSI = "235912351";
const GIVE_WAY_TEST_TARGET_NAME = "BITE GIVE WAY TARGET";
const STAND_ON_TEST_TARGET_MMSI = "235912352";
const STAND_ON_TEST_TARGET_NAME = "BITE STAND ON TARGET";
const TARGET_OVERTAKING_TEST_TARGET_MMSI = "235912353";
const TARGET_OVERTAKING_TEST_TARGET_NAME = "BITE TARGET OVERTAKING";
const SAME_COURSE_TEST_TARGET_MMSI = "235912354";
const SAME_COURSE_TEST_TARGET_NAME = "BITE SAME COURSE TARGET";
const ADVISORY_NO_PROMPT_TEST_TARGET_MMSI = "235912355";
const ADVISORY_NO_PROMPT_TEST_TARGET_NAME = "BITE ADVISORY TARGET";
const CPA_DEDUP_TEST_TARGET_MMSI = "235912356";
const CPA_DEDUP_TEST_TARGET_NAME = "BITE CPA DEDUP TARGET";
const VISUAL_AUDIO_MATCH_TEST_TARGET_MMSI = "235912357";
const VISUAL_AUDIO_MATCH_TEST_TARGET_NAME = "BITE WORDING MATCH TARGET";
const SAFETY_RETENTION_TEST_TARGET_MMSI = "235912358";
const SAFETY_RETENTION_TEST_TARGET_NAME = "BITE SAFETY RETENTION TARGET";
const AUDIO_SUMMARY_PRIORITY = 500;
const AUDIO_SUMMARY_EXPIRES_SECONDS = 600;
const HARBOUR_EDITOR_PLUGIN_ID = "signalk-ajrm-marine-harbour-editor";
const ALERT_PANEL_PLUGIN_ID = "signalk-ajrm-marine-alerts";
const DR_PLOTTER_PLUGIN_ID = "signalk-ajrm-marine-dr-plotter";
const GPS_INTEGRITY_PLUGIN_ID = "signalk-ajrm-marine-gps-integrity";
const INSTRUMENT_ALERTS_PLUGIN_ID = "signalk-ajrm-marine-instrument-alerts";
const INSTRUMENTS_PLUGIN_ID = "signalk-ajrm-marine-instruments";
const LOGGER_PLUGIN_ID = "signalk-ajrm-marine-logger";
const PI_CONTROLLER_PLUGIN_ID = "signalk-ajrm-marine-pi-controller";
const SIMULATOR_PLUGIN_ID = "signalk-ajrm-marine-simulator";
const SNAPSHOT_PLUGIN_ID = "signalk-ajrm-marine-snapshot";
const VESSEL_DATABASE_PLUGIN_ID = "signalk-ajrm-marine-vessel-database";
const VOYAGE_VIEWER_PLUGIN_ID = "signalk-ajrm-marine-voyage-viewer";
const OWN_POSITION = { latitude: 56.21122, longitude: -5.55756 };
const TARGET_POSITION = { latitude: 56.21122, longitude: -5.54756 };
const QUIET_TARGET_POSITION = { latitude: 56.24122, longitude: -5.49756 };
const DR_EXERCISE_CURRENT_SET_RAD = Math.PI / 2;
const DR_EXERCISE_CURRENT_DRIFT_MPS = 1 * KNOTS_TO_MPS;

const WATCH_PATHS = {
  traffic: "plugins.ajrmMarineTraffic.targets",
  trafficAudioPolicy: "plugins.ajrmMarineTraffic.audioPolicy",
  trafficAutoProfile: "plugins.ajrmMarineTraffic.autoProfile",
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
const SKIPPER_SETTINGS_SANITY_TEST_ID = "skipper-settings-sanity";
const AUDIO_SUMMARY_TEST_ID = "audio-output-summary";
const METERS_PER_NM = 1852;
const BITE_TRAFFIC_PROFILE = "coastal";
const BITE_TRAFFIC_PROFILES = Object.freeze({
  current: BITE_TRAFFIC_PROFILE,
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
    warning: {
      bySize: {
        small: { cpa: 50, tcpa: 180, speed: 0.5 },
        medium: { cpa: 100, tcpa: 240, speed: 0.5 },
        large: { cpa: 200, tcpa: 360, speed: 0.5 },
      },
    },
    danger: {
      bySize: {
        small: { cpa: 25, tcpa: 60, speed: 3 },
        medium: { cpa: 50, tcpa: 120, speed: 3 },
        large: { cpa: 100, tcpa: 180, speed: 3 },
      },
    },
  },
  coastal: {
    automuteStationary: false,
    cpaSensitivity: 1,
    tcpaLookahead: 1,
    repeatSensitivity: 1,
    warning: {
      bySize: {
        small: { cpa: 0.4 * METERS_PER_NM, tcpa: 600, speed: 0 },
        medium: { cpa: 0.8 * METERS_PER_NM, tcpa: 900, speed: 0 },
        large: { cpa: 1.5 * METERS_PER_NM, tcpa: 1200, speed: 0 },
      },
    },
    danger: {
      bySize: {
        small: { cpa: 0.15 * METERS_PER_NM, tcpa: 300, speed: 0.5 },
        medium: { cpa: 0.4 * METERS_PER_NM, tcpa: 480, speed: 0.5 },
        large: { cpa: 0.8 * METERS_PER_NM, tcpa: 720, speed: 0.5 },
      },
    },
  },
  offshore: {
    automuteStationary: false,
    cpaSensitivity: 1,
    tcpaLookahead: 1,
    repeatSensitivity: 1,
    warning: {
      bySize: {
        small: { cpa: 0.5 * METERS_PER_NM, tcpa: 720, speed: 0 },
        medium: { cpa: 1.25 * METERS_PER_NM, tcpa: 1200, speed: 0 },
        large: { cpa: 3 * METERS_PER_NM, tcpa: 1800, speed: 0 },
      },
    },
    danger: {
      bySize: {
        small: { cpa: 0.2 * METERS_PER_NM, tcpa: 360, speed: 0 },
        medium: { cpa: 0.6 * METERS_PER_NM, tcpa: 600, speed: 0 },
        large: { cpa: 1.5 * METERS_PER_NM, tcpa: 900, speed: 0 },
      },
    },
  },
});
const BITE_AUDIO_POLICY = Object.freeze({
  muted: false,
  automuteStationary: true,
  automuteStationarySpeed: 0.35,
  automuteStationaryDelaySeconds: 10,
  automuteMovingDelaySeconds: 3,
  allWellEnabled: true,
  allWellMessage: "All's well.",
  allWellIntervalMinutes: 30,
});
const BITE_AUTO_PROFILE = Object.freeze({
  enabled: false,
});
const REQUIRED_PLUGIN_AVAILABILITY_TESTS = Object.freeze([
  pluginAvailabilityTest({
    pluginId: packageInfo.name,
    id: "console-availability",
    number: "0.1",
    title: "Console availability",
    required: true,
  }),
  ...REQUIRED_SUITE_PLUGINS.map((pluginId, index) =>
    pluginAvailabilityTest({
      pluginId,
      id: `${shortPluginId(pluginId)}-availability`,
      number: `0.${index + 2}`,
      title: `${suitePluginTitle(pluginId)} availability`,
      required: true,
    })
  ),
]);
const OPTIONAL_PLUGIN_AVAILABILITY_TESTS = Object.freeze([
  pluginAvailabilityTest({
    pluginId: VESSEL_DATABASE_PLUGIN_ID,
    id: "vessel-database-availability",
    number: "9.1",
    title: "Vessel Database availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: SNAPSHOT_PLUGIN_ID,
    id: "snapshot-availability",
    number: "9.2",
    title: "Snapshot availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: LOGGER_PLUGIN_ID,
    id: "logger-availability",
    number: "9.3",
    title: "Logger availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: VOYAGE_VIEWER_PLUGIN_ID,
    id: "voyage-viewer-availability",
    number: "9.4",
    title: "Voyage Viewer availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: SIMULATOR_PLUGIN_ID,
    id: "simulator-availability",
    number: "9.5",
    title: "Simulator availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
    id: "gps-integrity-availability",
    number: "3.0",
    title: "GPS Integrity availability",
    optional: true,
    groupId: "gps-dr",
  }),
  pluginAvailabilityTest({
    pluginId: DR_PLOTTER_PLUGIN_ID,
    id: "dr-plotter-availability",
    number: "3.0.1",
    title: "DR Plotter availability",
    optional: true,
    groupId: "gps-dr",
  }),
  pluginAvailabilityTest({
    pluginId: ALERT_PANEL_PLUGIN_ID,
    id: "alert-panel-availability",
    number: "9.6",
    title: "Alert Panel availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: INSTRUMENTS_PLUGIN_ID,
    id: "instruments-availability",
    number: "9.7",
    title: "Instruments availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: INSTRUMENT_ALERTS_PLUGIN_ID,
    id: "instrument-alerts-availability",
    number: "9.8",
    title: "Instrument Alerts availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: HARBOUR_EDITOR_PLUGIN_ID,
    id: "harbour-editor-availability",
    number: "9.9",
    title: "Harbour Editor availability",
    optional: true,
  }),
  pluginAvailabilityTest({
    pluginId: PI_CONTROLLER_PLUGIN_ID,
    id: "pi-controller-availability",
    number: "9.10",
    title: "Pi Controller availability",
    optional: true,
  }),
]);
const OPTIONAL_PLUGIN_CONTRACT_TESTS = Object.freeze([
  pluginContractTest({
    pluginId: VESSEL_DATABASE_PLUGIN_ID,
    id: "vessel-database-summary-contract",
    number: "9.1.1",
    title: "Vessel Database summary contract",
    description: "Checks the optional Vessel Database publishes the suite-facing summary used by other apps and captures.",
  }),
  pluginContractTest({
    pluginId: LOGGER_PLUGIN_ID,
    id: "logger-api-contract",
    number: "9.3.1",
    title: "Logger runtime API contract",
    description: "Checks the optional Logger exposes the runtime API used by BITE, Capture, and future suite orchestration.",
  }),
  pluginContractTest({
    pluginId: LOGGER_PLUGIN_ID,
    id: "logger-replay-sanity-contract",
    number: "9.3.2",
    title: "Logger replay sanity contract",
    description: "Checks Logger exposes replay state clearly enough to avoid replaying derived data or stale timestamps as live navigation.",
  }),
  pluginContractTest({
    pluginId: INSTRUMENT_ALERTS_PLUGIN_ID,
    id: "instrument-alerts-depth-callout-capability",
    number: "9.8.1",
    title: "Instrument Alerts depth callout capability",
    description: "Checks Instrument Alerts advertises the anchoring depth callout capability before BITE relies on it.",
  }),
  pluginContractTest({
    pluginId: HARBOUR_EDITOR_PLUGIN_ID,
    id: "harbour-editor-default-data-contract",
    number: "9.9.1",
    title: "Harbour Editor default data contract",
    description: "Checks Harbour Editor status reports local/default harbour data without requiring Git-backed storage.",
  }),
  pluginContractTest({
    pluginId: PI_CONTROLLER_PLUGIN_ID,
    id: "pi-controller-telemetry-contract",
    number: "9.10.1",
    title: "Pi Controller telemetry contract",
    description: "Checks Pi Controller publishes host telemetry paths that Capture, Logger, and Snapshot can include.",
  }),
  pluginContractTest({
    pluginId: SNAPSHOT_PLUGIN_ID,
    id: "snapshot-api-contract",
    number: "9.2.1",
    title: "Snapshot API contract",
    description: "Checks Snapshot exposes the in-process snapshot API used for support/debug bundles.",
  }),
]);
const PLUGIN_AVAILABILITY_TESTS = Object.freeze([
  ...REQUIRED_PLUGIN_AVAILABILITY_TESTS,
  ...OPTIONAL_PLUGIN_AVAILABILITY_TESTS,
]);
const OPTIONAL_PLUGIN_STATUS_PATHS = Object.freeze({
  [ALERT_PANEL_PLUGIN_ID]: "plugins.ajrmMarineAlerts",
  [DR_PLOTTER_PLUGIN_ID]: "plugins.ajrmMarineDrPlotter",
  "signalk-ajrm-marine-gps-integrity": WATCH_PATHS.gpsIntegrity,
  "signalk-ajrm-marine-harbour-editor": WATCH_PATHS.harbourEditor,
  [INSTRUMENT_ALERTS_PLUGIN_ID]: "plugins.ajrmMarineInstrumentAlerts",
  [INSTRUMENTS_PLUGIN_ID]: "plugins.ajrmMarineInstruments",
  [LOGGER_PLUGIN_ID]: "plugins.ajrmMarineLogger.playback",
  [PI_CONTROLLER_PLUGIN_ID]: "plugins.ajrmMarinePiController",
  [SIMULATOR_PLUGIN_ID]: "plugins.ajrmMarineSimulator",
  [SNAPSHOT_PLUGIN_ID]: "plugins.ajrmMarineSnapshot",
  [VESSEL_DATABASE_PLUGIN_ID]: "plugins.ajrmMarineVesselDatabase.summary",
  [VOYAGE_VIEWER_PLUGIN_ID]: "plugins.ajrmMarineVoyageViewer",
});
let reportFileSequence = 0;
const TESTS = [
  {
    id: PREFLIGHT_TEST_ID,
    number: "0",
    title: "Required plugins and safety isolation",
    description: "Checks that required AJRM Marine plugins are installed/enabled, simulator or live feeds are not active, then snapshots skipper settings and applies BITE defaults.",
    timeoutSeconds: 5,
    blocking: true,
  },
  {
    id: SKIPPER_SETTINGS_SANITY_TEST_ID,
    number: "0.99",
    title: "Skipper settings sanity",
    description: "Checks the skipper's saved Traffic/audio settings are within sensible limits, such as non-zero CPA/TCPA thresholds for normal sailing profiles.",
    timeoutSeconds: 5,
  },
  ...PLUGIN_AVAILABILITY_TESTS,
  ...OPTIONAL_PLUGIN_CONTRACT_TESTS,
  {
    id: "core-projections",
    number: "1.1",
    title: "Core status projections",
    description: "Checks that Traffic, Display, Notifications, and Audio are publishing the status paths BITE needs to observe.",
    timeoutSeconds: 10,
  },
  {
    id: "projection-contracts",
    number: "1.2",
    title: "Projection contracts",
    description: "Checks that core projections carry the expected contract names, versions, sessions, and sequence fields.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-policy-consistency",
    number: "1.3",
    title: "Audio policy consistency",
    description: "Checks that Traffic's authoritative mute policy is visible to Audio without disagreement.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-renderer-readiness",
    number: "1.4",
    title: "Audio renderer readiness",
    description: "Checks that Audio is enabled and its Piper/FFmpeg/rendering dependencies are either ready or explicitly reported unavailable.",
    timeoutSeconds: 5,
  },
  {
    id: "notifications-broker-health",
    number: "1.5",
    title: "Notifications broker health",
    description: "Checks that Notifications exposes broker state, audio sequence state, and bounded history/active arrays.",
    timeoutSeconds: 5,
  },
  {
    id: "collision-audio-chain",
    number: "2.1",
    title: "Collision visual/audio chain",
    description: "Publishes a temporary crossing target and checks Traffic, Display, Notifications, and Audio all react.",
    timeoutSeconds: 45,
  },
  {
    id: "quiet-target-no-alert",
    number: "2.2",
    title: "Quiet target no-alert",
    description: "Publishes a stopped/far-away target and checks the suite does not create a fresh visual or audible alert for it.",
    timeoutSeconds: 15,
  },
  {
    id: "gps-integrity-health",
    number: "3.1",
    title: "GPS Integrity health",
    description: "Optional check that GPS Integrity is publishing trust, fix, counter, and timestamp state in a coherent form.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-lost-age-consistency",
    number: "3.2",
    title: "GPS lost age consistency",
    description: "Optional check that GPS-lost wording and timestamps do not come from a stale cached source when a fresher loss is known.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-integrity-diagnostics-contract",
    number: "3.3",
    title: "GPS Integrity diagnostics contract",
    description: "Optional check that GPS Integrity publishes the diagnostic block Voyage Viewer uses for end-of-day review.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "dead-reckoning-projection",
    number: "3.4",
    title: "Dead reckoning projection",
    description: "Optional check that operational and independent DR projections expose positions, ages, uncertainty, and vector roles coherently.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "dead-reckoning-loss-exercise",
    number: "3.5",
    title: "DR GPS-loss exercise",
    description: "Optional active test that injects a trusted GPS/current baseline, removes GPS and current, and checks operational DR moves using the retained current vector.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-recovery-realigns-dr",
    number: "3.6",
    title: "GPS recovery realigns DR",
    description: "Optional active test that lets retained-current DR drift after GPS loss, restores GPS, and checks operational DR locks back to GPS.",
    timeoutSeconds: 30,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-jump-rejection",
    number: "3.7",
    title: "GPS jump rejection",
    description: "Optional active test that injects an impossible GPS jump and checks GPS Integrity rejects it without moving the trusted baseline.",
    timeoutSeconds: 20,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-intermittent-outage-count",
    number: "3.8",
    title: "GPS intermittent outage count",
    description: "Optional active test that repeats missing-GPS samples and checks a continuous outage is counted once rather than once per update.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "docked-no-dr-drift",
    number: "3.9",
    title: "Docked no-DR-drift",
    description: "Optional active test that injects a stationary healthy GPS fix with tide running and checks independent DR does not drift away.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-recovery-fresh-fix",
    number: "3.10",
    title: "GPS recovery fresh fix",
    description: "Optional active test that loses GPS, restores it, and checks the restored GPS fix timestamp is fresh rather than inherited from an old cache.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "lost-gps-retained-current-source",
    number: "3.11",
    title: "Lost-GPS retained current source",
    description: "Optional active test that removes GPS and live current together and checks DR explicitly uses the last trusted current vector.",
    timeoutSeconds: 25,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "stationary-automute-policy-shape",
    number: "1.6",
    title: "Stationary automute policy shape",
    description: "Checks that Traffic's shared audio policy exposes enough state to prove whether stationary automute is armed, allowed, and active.",
    timeoutSeconds: 5,
  },
  {
    id: "capture-api-contract",
    number: "1.7",
    title: "Capture API contract",
    description: "Checks that Capture exposes the start/stop/status/automatic-recording API BITE relies on for diagnostic bundles.",
    timeoutSeconds: 5,
  },
  {
    id: "traffic-api-contract",
    number: "1.8",
    title: "Traffic API contract",
    description: "Checks that Traffic exposes status and shared audio-policy control so BITE can unmute safely and restore the prior state.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-status-detail-contract",
    number: "1.9",
    title: "Audio status detail contract",
    description: "Checks that Audio exposes queue, recent-event, output, dependency, and mute-state details for debugging delayed speech.",
    timeoutSeconds: 5,
  },
  {
    id: "notifications-visual-contract",
    number: "1.10",
    title: "Notifications visual contract",
    description: "Checks that Notifications active visual events carry presentation, delivery, priority, and timestamp fields.",
    timeoutSeconds: 5,
  },
  {
    id: "audio-playable-output-path",
    number: "1.11",
    title: "Audio playable output path",
    description: "Publishes a forced short audio check and verifies Audio exposes a recent playable MP3 URL for browser and desktop players.",
    timeoutSeconds: 45,
  },
  {
    id: "gps-explicit-no-fix-immediate",
    number: "3.12",
    title: "GPS explicit no-fix immediate",
    description: "Optional active test that injects an explicit GNSS no-fix update and checks GPS Integrity reports lost without waiting for a stale-position timeout.",
    timeoutSeconds: 15,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-weak-signal-detection",
    number: "3.13",
    title: "GPS weak-signal detection",
    description: "Optional active test that injects a weak GNSS sample and checks GPS Integrity reports degraded signal and increments the weak-signal counter.",
    timeoutSeconds: 20,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "traffic-overtaking-wording",
    number: "2.3",
    title: "Traffic overtaking wording",
    description: "Publishes an overtaking encounter and checks the visual/audio wording includes the overtaking phrase and CPA direction.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-close-quarters-wording",
    number: "2.4",
    title: "Traffic close-quarters wording",
    description: "Publishes a close-quarters encounter and checks the visual/audio wording says close quarters through the alert chain.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-unnamed-spoken-name",
    number: "2.5",
    title: "Traffic unnamed spoken name",
    description: "Publishes an MMSI-only target and checks spoken audio does not attempt to read the MMSI as the vessel name.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-head-on-prompt",
    number: "2.6",
    title: "Traffic head-on prompt",
    description: "Publishes a head-on collision encounter and checks the alert/audio chain says alter starboard, pass port-to-port.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-give-way-prompt",
    number: "2.7",
    title: "Traffic give-way prompt",
    description: "Publishes a starboard-bow collision encounter and checks the alert/audio chain says Give Way.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-stand-on-prompt",
    number: "2.8",
    title: "Traffic stand-on prompt",
    description: "Publishes a port-side collision encounter and checks the alert/audio chain says Stand On.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-target-overtaking-wording",
    number: "2.9",
    title: "Traffic target overtaking wording",
    description: "Publishes a target overtaking own vessel from astern and checks the alert/audio chain says it is overtaking you.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-same-course-wording",
    number: "2.10",
    title: "Traffic same-course wording",
    description: "Publishes a similar-course passing encounter and checks the alert/audio chain says same general course with a CPA side.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-target-projection-contract",
    number: "2.11",
    title: "Traffic target projection contract",
    description: "Checks that Traffic target projections include target identity, encounter state, and useful debugging fields.",
    timeoutSeconds: 5,
  },
  {
    id: "traffic-audio-policy-contract",
    number: "2.12",
    title: "Traffic audio policy contract",
    description: "Checks that Traffic's shared mute/automute policy carries voyage/profile/manual-override state explicitly.",
    timeoutSeconds: 5,
  },
  {
    id: "traffic-advisory-no-action-prompt",
    number: "2.13",
    title: "Traffic advisory has no action prompt",
    description: "Publishes an advisory-level encounter and checks it stays descriptive, without COLREG manoeuvre prompts.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-cpa-deduplicated-wording",
    number: "2.14",
    title: "Traffic CPA wording de-duplicated",
    description: "Publishes a passing encounter and checks CPA wording is not repeated after a CPA-will-be phrase.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-visual-audio-wording-alignment",
    number: "2.15",
    title: "Traffic visual/audio wording alignment",
    description: "Publishes a named encounter and checks the visual and spoken paths preserve the same essential encounter wording.",
    timeoutSeconds: 30,
  },
  {
    id: "traffic-harbour-profile-boundary",
    number: "2.16",
    title: "Traffic harbour/profile boundary",
    description: "Checks Traffic exposes enough auto-profile boundary state to prove harbour/coastal transitions and stationary automute decisions.",
    timeoutSeconds: 5,
  },
  {
    id: "traffic-safety-message-retained",
    number: "2.17",
    title: "Traffic safety message retained",
    description: "Publishes a collision encounter while lower-priority system audio is queued and checks the safety message remains visible to Audio.",
    timeoutSeconds: 35,
  },
  {
    id: "gps-vector-arrow-contract",
    number: "3.14",
    title: "GPS/DR vector arrow contract",
    description: "Optional check that GPS Integrity publishes the classic single/double/triple vector roles used by DR Plotter.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-counter-contract",
    number: "3.15",
    title: "GPS Integrity counter contract",
    description: "Optional check that GPS Integrity event counters are present, non-negative, and internally plausible.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "gps-current-contract",
    number: "3.16",
    title: "GPS/DR current contract",
    description: "Optional check that live and retained current/set data are explicit enough for lost-GPS dead reckoning.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: GPS_INTEGRITY_PLUGIN_ID,
  },
  {
    id: "dr-plot-persistence-contract",
    number: "3.17",
    title: "DR plot persistence contract",
    description: "Optional check that DR Plotter publishes server-side breadcrumb/fix persistence state so plots survive page changes and Capture can bundle them.",
    timeoutSeconds: 5,
    optional: true,
    pluginId: DR_PLOTTER_PLUGIN_ID,
  },
  {
    id: AUDIO_SUMMARY_TEST_ID,
    number: "99",
    title: "Audible summary output",
    description: "Publishes a final spoken BITE summary so the skipper can confirm the selected audio output was actually heard.",
    timeoutSeconds: 180,
  },
];
const OPTIONAL_PLUGIN_BITE_GROUPS = OPTIONAL_PLUGIN_AVAILABILITY_TESTS
  .filter((test) => test.groupId !== "gps-dr")
  .map((test) => ({
    id: test.pluginId,
    number: test.number,
    title: suitePluginTitle(test.pluginId),
    description: `Optional ${suitePluginTitle(test.pluginId)} plugin availability and status check.`,
    pluginId: test.pluginId,
    testIds: [
      test.id,
      ...OPTIONAL_PLUGIN_CONTRACT_TESTS
        .filter((contractTest) => contractTest.pluginId === test.pluginId)
        .map((contractTest) => contractTest.id),
    ],
  }));
const BITE_GROUP_DEFINITIONS = [
  {
    id: "safety",
    number: "0",
    title: "Pre-test safety",
    description: "Required plugin checks, isolation from live/simulator data, BITE defaults, and skipper setting sanity checks.",
    testIds: [PREFLIGHT_TEST_ID, SKIPPER_SETTINGS_SANITY_TEST_ID],
  },
  {
    id: "required-plugins",
    number: "0.x",
    title: "Required plugins",
    description: "Each required AJRM Marine plugin is installed, enabled, visible to Console, and operational where a runtime check is available.",
    testIds: REQUIRED_PLUGIN_AVAILABILITY_TESTS.map((test) => test.id),
  },
  {
    id: "core",
    number: "1",
    title: "Core suite readiness",
    description: "Console, Traffic, Display, Notifications, and Audio contracts needed by the suite.",
    testIds: [
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
    ],
  },
  {
    id: "traffic",
    number: "2",
    title: "Traffic encounters",
    description: "Collision/advisory generation, action prompts, passing wording, and spoken target names.",
    testIds: [
      "collision-audio-chain",
      "quiet-target-no-alert",
      "traffic-overtaking-wording",
      "traffic-close-quarters-wording",
      "traffic-unnamed-spoken-name",
      "traffic-head-on-prompt",
      "traffic-give-way-prompt",
      "traffic-stand-on-prompt",
      "traffic-target-overtaking-wording",
      "traffic-same-course-wording",
      "traffic-target-projection-contract",
      "traffic-audio-policy-contract",
      "traffic-advisory-no-action-prompt",
      "traffic-cpa-deduplicated-wording",
      "traffic-visual-audio-wording-alignment",
      "traffic-harbour-profile-boundary",
      "traffic-safety-message-retained",
    ],
  },
  {
    id: "gps-dr",
    number: "3",
    title: "GPS Integrity and DR Plotter",
    description: "GPS loss, stale fixes, weak signals, DR drift, retained current, and GPS recovery behaviour.",
    testIds: [
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
  },
  ...OPTIONAL_PLUGIN_BITE_GROUPS,
  {
    id: "summary",
    number: "99",
    title: "Audible summary",
    description: "Final spoken check that confirms the selected audio output can be heard.",
    testIds: [AUDIO_SUMMARY_TEST_ID],
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
const MAX_REPORTS = 200;
const AJRM_MARINE_CAPTURE_API_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarineCaptureApi");
const AJRM_MARINE_TRAFFIC_API_REGISTRY = Symbol.for("ajrmMarineTrafficApi");
const AJRM_MARINE_LOGGER_API_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarineLoggerApi");
const AJRM_MARINE_SNAPSHOT_API_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarineSnapshotApi");

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
        groups: biteGroupsForApp(app),
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
      if (options.background === true) {
        return startBackgroundRunAll(options);
      }
      running = true;
      currentRunAll = null;
      try {
        lastRunAllReport = await runAllBiteTests(app, {
          pluginId,
          consoleVersion: version,
          timeoutSeconds: options.timeoutSeconds,
          groupId: options.groupId,
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
    async runGroup(options = {}) {
      if (running) {
        const error = new Error("BITE run already in progress");
        error.statusCode = 409;
        throw error;
      }
      if (options.background === true) {
        return startBackgroundRunAll(options);
      }
      running = true;
      currentRunAll = null;
      try {
        lastRunAllReport = await runAllBiteTests(app, {
          pluginId,
          consoleVersion: version,
          timeoutSeconds: options.timeoutSeconds,
          groupId: options.groupId,
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

  function startBackgroundRunAll(options = {}) {
    running = true;
    currentRunAll = null;
    const runPromise = runAllBiteTests(app, {
      pluginId,
      consoleVersion: version,
      timeoutSeconds: options.timeoutSeconds,
      groupId: options.groupId,
      onProgress: (progress) => {
        currentRunAll = progress;
      },
      recordReport: async (report) => {
        reports = [...reports, report].slice(-MAX_REPORTS);
        await saveReport(report);
      },
    });
    runPromise
      .then(async (report) => {
        lastRunAllReport = report;
        reports = [...reports, report].slice(-MAX_REPORTS);
        await saveReport(report);
      })
      .catch(async (error) => {
        app.error(`[${pluginId}] background BITE run failed: ${error.stack || error.message}`);
        const report = backgroundRunFailureReport({
          consoleVersion: version,
          groupId: options.groupId,
          error,
        });
        lastRunAllReport = report;
        reports = [...reports, report].slice(-MAX_REPORTS);
        await saveReport(report).catch(() => {});
      })
      .finally(() => {
        running = false;
        currentRunAll = null;
      });
    return currentRunAll || backgroundRunStartedProgress({ consoleVersion: version, groupId: options.groupId });
  }
}

async function runAllBiteTests(app, { pluginId, consoleVersion, timeoutSeconds, groupId = "", recordReport, onProgress }) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const reports = [];
  const capture = captureApi(app);
  const traffic = trafficApi(app);
  const group = groupId ? biteGroupByIdForApp(app, groupId) : null;
  if (groupId && !group) {
    const error = new Error(`Unknown BITE group: ${groupId}`);
    error.statusCode = 400;
    throw error;
  }
  const selectedTests = runnableBiteTestsForApp(app, { groupId });
  const runLabel = group ? `${group.title} group` : "Run all";
  const captureComment = `AJRM Marine BITE ${runLabel} ${new Date().toISOString()}`;
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
      running: true,
      runId,
      startedAt,
      groupId: group?.id || "",
      groupTitle: group?.title || "",
      testIds: selectedTests.map((test) => test.id),
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
        captureComment,
        group,
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
    for (const test of selectedTests) {
      progress({ phase: "running", currentTestId: test.id });
      const report = await runBiteTestById(app, {
        pluginId,
        testId: test.id,
        consoleVersion,
        timeoutMs: boundedTimeout(testTimeoutSeconds(test, timeoutSeconds)),
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
        group,
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
    if (app.ajrmMarineConsoleBiteSettingsSnapshot?.active) {
      const settingsRestore = await restoreBiteSettings(app);
      if (!settingsRestore.ok) {
        restoreError = settingsRestore.message;
        progress({ phase: "bite-settings-restore-failed", currentTestId: null });
      } else {
        progress({ phase: "bite-settings-restored", currentTestId: null });
      }
    }
    const settingsManagedByBite = reports.some((report) =>
      report?.testId === PREFLIGHT_TEST_ID && report?.snapshot?.settings?.snapshotOk === true
    );
    if (traffic?.setAudioPolicy && trafficWasMuted !== null && !settingsManagedByBite) {
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
    group,
  });
}

function backgroundRunStartedProgress({ consoleVersion, groupId = "" }) {
  const startedAt = new Date().toISOString();
  return {
    ok: true,
    contract: "ajrm-marine-console-bite-run-all-progress",
    contractVersion: 1,
    consoleVersion,
    running: true,
    runId: "",
    startedAt,
    groupId: String(groupId || ""),
    groupTitle: "",
    phase: "starting",
    currentTestId: null,
    testIds: [],
    capture: {
      started: false,
      start: null,
      stop: null,
      error: null,
      automaticRecordingBeforeTest: null,
    },
    trafficAudio: {
      mutedBeforeTest: null,
      restoreError: null,
    },
    reports: [],
  };
}

function backgroundRunFailureReport({ consoleVersion, groupId = "", error }) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const groupDefinition = groupId
    ? BITE_GROUP_DEFINITIONS.find((group) => group.id === groupId)
    : null;
  const message = error?.message || String(error || "Unknown BITE background run failure");
  return {
    ok: false,
    contract: "ajrm-marine-console-bite-run-all-report",
    contractVersion: 1,
    consoleVersion,
    runId,
    testId: groupDefinition ? `run-group:${groupDefinition.id}` : "run-all",
    scenario: groupDefinition ? "run-group" : "run-all",
    groupId: groupDefinition?.id || String(groupId || ""),
    groupTitle: groupDefinition?.title || "",
    phase: "complete",
    result: "fail",
    startedAt,
    finishedAt: startedAt,
    durationSeconds: 0,
    capture: {
      comment: "",
      started: false,
      start: null,
      stop: null,
      error: message,
      restoreError: null,
    },
    reports: [],
    summary: `BITE background run failed: ${message}`,
  };
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
  group = null,
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
    testId: group ? `run-group:${group.id}` : "run-all",
    scenario: group ? "run-group" : "run-all",
    groupId: group?.id || "",
    groupTitle: group?.title || "",
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
    const group = biteGroupForTest(test);
    const groupedTest = {
      ...test,
      groupId: group?.id || "other",
      groupTitle: group?.title || "Other checks",
    };
    if (!test.optional) return groupedTest;
    const evidence = optionalPluginEvidence(app, test.pluginId);
    return {
      ...groupedTest,
      enabled: evidence.installed,
      disabledReason: evidence.installed
        ? ""
        : `${test.title} is disabled because ${test.pluginId} is not installed, not enabled, or not visible to Console.`,
    };
  }).sort((left, right) => biteTestOrder(left) - biteTestOrder(right));
}

function biteGroupsForApp(app) {
  const tests = biteTestsForApp(app);
  const byId = new Map(tests.map((test) => [test.id, test]));
  return BITE_GROUP_DEFINITIONS.map((group) => {
    const groupTests = group.testIds.map((testId) => byId.get(testId)).filter(Boolean);
    const enabledCount = groupTests.filter((test) => test.enabled !== false).length;
    return {
      id: group.id,
      title: group.title,
      number: group.number || "",
      description: group.description,
      pluginId: group.pluginId || "",
      testIds: groupTests.map((test) => test.id),
      count: groupTests.length,
      enabledCount,
      enabled: enabledCount > 0,
    };
  }).filter((group) => group.count > 0);
}

function biteGroupForTest(test) {
  return BITE_GROUP_DEFINITIONS.find((group) => group.testIds.includes(test.id)) || null;
}

function biteGroupByIdForApp(app, groupId) {
  return biteGroupsForApp(app).find((group) => group.id === groupId) || null;
}

function runnableBiteTestsForApp(app, { groupId = "" } = {}) {
  const group = groupId ? biteGroupByIdForApp(app, groupId) : null;
  const selectedIds = group ? new Set(group.testIds) : null;
  return biteTestsForApp(app)
    .filter((item) => {
      if (item.id === PREFLIGHT_TEST_ID) return false;
      if (item.enabled === false) return false;
      if (group && item.id === AUDIO_SUMMARY_TEST_ID) return true;
      return !selectedIds || selectedIds.has(item.id);
    })
    .sort((left, right) => {
      if (left.id === AUDIO_SUMMARY_TEST_ID) return 1;
      if (right.id === AUDIO_SUMMARY_TEST_ID) return -1;
      return biteTestOrder(left) - biteTestOrder(right);
    });
}

function biteTestOrder(test) {
  const raw = String(test?.number || "");
  const parts = raw.split(".").map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return Number.MAX_SAFE_INTEGER;
  return parts.reduce((total, part, index) => total + part * (index === 0 ? 1000 : 1000 / (100 ** index)), 0);
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

function loggerApi(app) {
  return app.ajrmMarineLoggerApi || globalThis[AJRM_MARINE_LOGGER_API_REGISTRY] || null;
}

function snapshotApi(app) {
  return app.ajrmMarineSnapshotApi || globalThis[AJRM_MARINE_SNAPSHOT_API_REGISTRY] || null;
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
  if (testId === SKIPPER_SETTINGS_SANITY_TEST_ID) return runSkipperSettingsSanityBite(app, { consoleVersion });
  const availabilityTest = pluginAvailabilityTestById(testId);
  if (availabilityTest && testId !== "harbour-editor-availability") {
    return runPluginAvailabilityBite(app, { consoleVersion, test: availabilityTest });
  }
  if (testId === "core-projections") return runCoreProjectionBite(app, { consoleVersion });
  if (testId === "projection-contracts") return runProjectionContractsBite(app, { consoleVersion });
  if (testId === "audio-policy-consistency") return runAudioPolicyConsistencyBite(app, { consoleVersion });
  if (testId === "audio-renderer-readiness") return runAudioRendererReadinessBite(app, { consoleVersion });
  if (testId === "notifications-broker-health") return runNotificationsBrokerHealthBite(app, { consoleVersion });
  if (testId === "capture-api-contract") return runCaptureApiContractBite(app, { consoleVersion });
  if (testId === "traffic-api-contract") return runTrafficApiContractBite(app, { consoleVersion });
  if (testId === "audio-status-detail-contract") return runAudioStatusDetailContractBite(app, { consoleVersion });
  if (testId === "notifications-visual-contract") return runNotificationsVisualContractBite(app, { consoleVersion });
  if (testId === "audio-playable-output-path") {
    return runAudioPlayableOutputPathBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "audio-output-summary") {
    return runAudioOutputSummaryBite(app, { pluginId, consoleVersion, priorReports, timeoutMs });
  }
  if (testId === "vessel-database-summary-contract") {
    return runVesselDatabaseSummaryContractBite(app, { consoleVersion });
  }
  if (testId === "logger-api-contract") {
    return runLoggerApiContractBite(app, { consoleVersion });
  }
  if (testId === "logger-replay-sanity-contract") {
    return runLoggerReplaySanityContractBite(app, { consoleVersion });
  }
  if (testId === "instrument-alerts-depth-callout-capability") {
    return runInstrumentAlertsDepthCalloutCapabilityBite(app, { consoleVersion });
  }
  if (testId === "harbour-editor-availability") {
    return runHarbourEditorAvailabilityBite(app, { consoleVersion });
  }
  if (testId === "harbour-editor-default-data-contract") {
    return runHarbourEditorDefaultDataContractBite(app, { consoleVersion });
  }
  if (testId === "pi-controller-telemetry-contract") {
    return runPiControllerTelemetryContractBite(app, { consoleVersion });
  }
  if (testId === "snapshot-api-contract") {
    return runSnapshotApiContractBite(app, { consoleVersion });
  }
  if (testId === "quiet-target-no-alert") {
    return runQuietTargetNoAlertBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "gps-integrity-health") return runGpsIntegrityHealthBite(app, { consoleVersion });
  if (testId === "gps-lost-age-consistency") return runGpsLostAgeConsistencyBite(app, { consoleVersion });
  if (testId === "gps-integrity-diagnostics-contract") {
    return runGpsIntegrityDiagnosticsContractBite(app, { consoleVersion });
  }
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
  if (testId === "gps-explicit-no-fix-immediate") {
    return runGpsExplicitNoFixImmediateBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "gps-weak-signal-detection") {
    return runGpsWeakSignalDetectionBite(app, { pluginId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-overtaking-wording") {
    return runTrafficOvertakingWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-close-quarters-wording") {
    return runTrafficCloseQuartersWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-unnamed-spoken-name") {
    return runTrafficUnnamedSpokenNameBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-head-on-prompt") {
    return runTrafficHeadOnPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-give-way-prompt") {
    return runTrafficGiveWayPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-stand-on-prompt") {
    return runTrafficStandOnPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-target-overtaking-wording") {
    return runTrafficTargetOvertakingWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-same-course-wording") {
    return runTrafficSameCourseWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-target-projection-contract") {
    return runTrafficTargetProjectionContractBite(app, { consoleVersion });
  }
  if (testId === "traffic-audio-policy-contract") {
    return runTrafficAudioPolicyContractBite(app, { consoleVersion });
  }
  if (testId === "traffic-advisory-no-action-prompt") {
    return runTrafficAdvisoryNoActionPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-cpa-deduplicated-wording") {
    return runTrafficCpaDeduplicatedWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-visual-audio-wording-alignment") {
    return runTrafficVisualAudioWordingAlignmentBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "traffic-harbour-profile-boundary") {
    return runTrafficHarbourProfileBoundaryBite(app, { consoleVersion });
  }
  if (testId === "traffic-safety-message-retained") {
    return runTrafficSafetyMessageRetainedBite(app, { pluginId, testId, consoleVersion, timeoutMs });
  }
  if (testId === "gps-vector-arrow-contract") return runGpsVectorArrowContractBite(app, { consoleVersion });
  if (testId === "gps-counter-contract") return runGpsCounterContractBite(app, { consoleVersion });
  if (testId === "gps-current-contract") return runGpsCurrentContractBite(app, { consoleVersion });
  if (testId === "dr-plot-persistence-contract") return runDrPlotPersistenceContractBite(app, { consoleVersion });
  return runCollisionAudioBite(app, { pluginId, testId, consoleVersion, timeoutMs });
}

async function runPreflightBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const requiredPluginEvidence = requiredSuitePluginEvidence(app);
  const simulatorEvidence = simulatorOutputEvidence(app);
  const liveFeedEvidence = recentLiveFeedEvidence(app, startedAtMs);
  const baseAssertions = [
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
  const safeToPrepareSettings = baseAssertions.every((item) => item.pass);
  const settingsEvidence = safeToPrepareSettings
    ? await prepareBiteSettings(app)
    : {
        ok: false,
        skipped: true,
        message: "BITE settings were not changed because the pre-test safety checks failed.",
      };
  const assertions = [
    ...baseAssertions,
    assertion(
      "bite-settings-snapshot",
      !safeToPrepareSettings || settingsEvidence.snapshotOk === true,
      settingsEvidence.snapshotOk
        ? "Skipper Traffic/audio settings were snapshotted for restoration."
        : settingsEvidence.message || "Skipper Traffic/audio settings could not be snapshotted.",
    ),
    assertion(
      "bite-settings-defaults-applied",
      !safeToPrepareSettings || settingsEvidence.defaultsApplied === true,
      settingsEvidence.defaultsApplied
        ? "BITE Traffic/audio defaults were applied for repeatable tests."
        : settingsEvidence.message || "BITE Traffic/audio defaults could not be applied.",
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
      settings: settingsEvidence,
    },
  };
}

async function prepareBiteSettings(app) {
  const traffic = trafficApi(app);
  if (!traffic?.status || !traffic?.setProfile || !traffic?.setProfiles || !traffic?.setAudioPolicy) {
    return {
      ok: false,
      snapshotOk: false,
      defaultsApplied: false,
      message: "Traffic API cannot snapshot and apply BITE profile/audio settings. Update AJRM Marine Traffic.",
    };
  }
  const previous = app.ajrmMarineConsoleBiteSettingsSnapshot;
  if (previous?.active) {
    await restoreBiteSettings(app);
  }
  const status = await traffic.status();
  const snapshot = trafficSettingsSnapshot(status);
  app.ajrmMarineConsoleBiteSettingsSnapshot = {
    active: true,
    createdAt: new Date().toISOString(),
    snapshot,
  };
  await traffic.setProfiles(jsonClone(BITE_TRAFFIC_PROFILES));
  await traffic.setProfile(BITE_TRAFFIC_PROFILE);
  if (traffic.setAutoProfile) {
    await traffic.setAutoProfile(jsonClone(BITE_AUTO_PROFILE));
  }
  await traffic.setAudioPolicy(jsonClone(BITE_AUDIO_POLICY));
  return {
    ok: true,
    snapshotOk: true,
    defaultsApplied: true,
    message: "Skipper settings snapshotted and BITE defaults applied.",
    snapshot: settingsSnapshotSummary(snapshot),
    defaults: {
      profile: BITE_TRAFFIC_PROFILE,
      profiles: settingsSnapshotSummary({ profiles: BITE_TRAFFIC_PROFILES }).profiles,
      autoProfile: BITE_AUTO_PROFILE,
      audioPolicy: BITE_AUDIO_POLICY,
    },
  };
}

async function restoreBiteSettings(app) {
  const state = app.ajrmMarineConsoleBiteSettingsSnapshot;
  if (!state?.active || !state.snapshot) {
    return { ok: true, skipped: true, message: "No BITE settings snapshot was active." };
  }
  const traffic = trafficApi(app);
  if (!traffic) {
    return { ok: false, message: "Traffic API is unavailable; skipper settings could not be restored." };
  }
  const { snapshot } = state;
  const errors = [];
  try {
    if (snapshot.profiles && typeof traffic.setProfiles === "function") {
      await traffic.setProfiles(jsonClone(snapshot.profiles));
    }
  } catch (error) {
    errors.push(`profiles: ${error.message || String(error)}`);
  }
  try {
    if (snapshot.profile && typeof traffic.setProfile === "function") {
      await traffic.setProfile(snapshot.profile);
    }
  } catch (error) {
    errors.push(`profile: ${error.message || String(error)}`);
  }
  try {
    if (snapshot.autoProfileSettings && typeof traffic.setAutoProfile === "function") {
      await traffic.setAutoProfile(jsonClone(snapshot.autoProfileSettings));
    }
  } catch (error) {
    errors.push(`auto-profile: ${error.message || String(error)}`);
  }
  try {
    if (snapshot.audioPolicyCommand && typeof traffic.setAudioPolicy === "function") {
      await traffic.setAudioPolicy(jsonClone(snapshot.audioPolicyCommand));
    }
  } catch (error) {
    errors.push(`audio policy: ${error.message || String(error)}`);
  }
  if (!errors.length) {
    app.ajrmMarineConsoleBiteSettingsSnapshot = null;
  }
  return {
    ok: errors.length === 0,
    message: errors.length
      ? `BITE could not restore all skipper settings: ${errors.join("; ")}`
      : "Skipper Traffic/audio settings restored.",
    errors,
    snapshot: settingsSnapshotSummary(snapshot),
  };
}

function trafficSettingsSnapshot(status = {}) {
  const audioPolicy = status.audioPolicy || status.trafficAudioPolicy || {};
  const autoProfile = status.autoProfile || {};
  return {
    profile: status.profile || status.profiles?.current || audioPolicy.profile || "",
    profiles: jsonClone(status.profiles || {}),
    autoProfileSettings: jsonClone(autoProfile.settings || {}),
    audioPolicyCommand: trafficAudioPolicyCommand(audioPolicy),
    rawAudioPolicy: jsonClone(audioPolicy),
  };
}

function trafficAudioPolicyCommand(policy = {}) {
  const keys = [
    "muted",
    "automuteStationary",
    "automuteStationarySpeed",
    "automuteStationaryDelaySeconds",
    "automuteMovingDelaySeconds",
    "allWellEnabled",
    "allWellMessage",
    "allWellIntervalMinutes",
  ];
  return keys.reduce((command, key) => {
    if (policy[key] !== undefined) command[key] = policy[key];
    return command;
  }, {});
}

function settingsSnapshotSummary(snapshot = {}) {
  return {
    profile: snapshot.profile || "",
    profiles: summarizeTrafficProfiles(snapshot.profiles),
    autoProfile: snapshot.autoProfileSettings || null,
    audioPolicy: snapshot.audioPolicyCommand || null,
  };
}

async function runSkipperSettingsSanityBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let snapshot = app.ajrmMarineConsoleBiteSettingsSnapshot?.snapshot || null;
  let snapshotError = "";
  if (!snapshot) {
    const traffic = trafficApi(app);
    try {
      snapshot = traffic?.status ? trafficSettingsSnapshot(await traffic.status()) : null;
    } catch (error) {
      snapshotError = error.message || String(error);
    }
  }
  const sanity = analyseSkipperTrafficSettings(snapshot || {});
  const assertions = [
    assertion(
      "skipper-settings-readable",
      Boolean(snapshot),
      snapshot
        ? "Skipper Traffic/audio settings are readable."
        : `Skipper Traffic/audio settings are not readable${snapshotError ? `: ${snapshotError}` : "."}`,
    ),
    assertion(
      "skipper-profile-thresholds-sensible",
      sanity.profileProblems.length === 0,
      sanity.profileProblems.length
        ? `Traffic profile thresholds need review: ${sanity.profileProblems.slice(0, 6).join("; ")}`
        : "Traffic CPA/TCPA/sensitivity settings are within sensible bounds.",
    ),
    assertion(
      "skipper-audio-policy-sensible",
      sanity.audioProblems.length === 0,
      sanity.audioProblems.length
        ? `Traffic audio/automute settings need review: ${sanity.audioProblems.join("; ")}`
        : "Traffic mute, automute, and all's-well settings are within sensible bounds.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: SKIPPER_SETTINGS_SANITY_TEST_ID,
    testId: SKIPPER_SETTINGS_SANITY_TEST_ID,
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: sanity.observations,
    summary: result === "pass"
      ? "Skipper Traffic/audio settings are within sensible BITE boundaries."
      : `Skipper settings sanity check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      snapshotError,
      settings: settingsSnapshotSummary(snapshot || {}),
      sanity,
    },
  });
}

function analyseSkipperTrafficSettings(snapshot = {}) {
  const profiles = snapshot.profiles || {};
  const profileProblems = [];
  const observations = [];
  for (const profileName of ["harbor", "coastal", "offshore"]) {
    const profile = profiles[profileName] || {};
    for (const sensitivityKey of ["cpaSensitivity", "tcpaLookahead", "repeatSensitivity"]) {
      const value = Number(profile[sensitivityKey]);
      if (!Number.isFinite(value) || value <= 0) {
        profileProblems.push(`${profileName} ${sensitivityKey} must be greater than zero`);
      } else if (value > 10) {
        profileProblems.push(`${profileName} ${sensitivityKey} is unusually high (${value})`);
      }
    }
    for (const severity of ["warning", "danger"]) {
      const criteria = profile[severity] || {};
      const sized = criteria.bySize || criteria;
      for (const size of ["small", "medium", "large"]) {
        const rule = sized[size] || criteria;
        const cpa = Number(rule?.cpa);
        const tcpa = Number(rule?.tcpa);
        if (!Number.isFinite(cpa) || cpa <= 0) {
          profileProblems.push(`${profileName} ${severity} ${size} CPA must be greater than zero`);
        } else if (cpa > 12 * METERS_PER_NM) {
          profileProblems.push(`${profileName} ${severity} ${size} CPA is unusually large (${Math.round(cpa)} m)`);
        }
        if (!Number.isFinite(tcpa) || tcpa <= 0) {
          profileProblems.push(`${profileName} ${severity} ${size} TCPA must be greater than zero`);
        } else if (tcpa < 10) {
          profileProblems.push(`${profileName} ${severity} ${size} TCPA is too short (${tcpa} s)`);
        } else if (tcpa > 7200) {
          profileProblems.push(`${profileName} ${severity} ${size} TCPA is unusually long (${tcpa} s)`);
        }
      }
    }
    observations.push({
      profile: profileName,
      automuteStationary: profile.automuteStationary,
      cpaSensitivity: profile.cpaSensitivity,
      tcpaLookahead: profile.tcpaLookahead,
      repeatSensitivity: profile.repeatSensitivity,
    });
  }
  const audio = snapshot.audioPolicyCommand || {};
  const audioProblems = [];
  if (typeof audio.muted !== "boolean" && audio.muted !== undefined) audioProblems.push("muted must be true or false");
  if (typeof audio.automuteStationary !== "boolean" && audio.automuteStationary !== undefined) {
    audioProblems.push("automuteStationary must be true or false");
  }
  const stationarySpeed = Number(audio.automuteStationarySpeed);
  if (!Number.isFinite(stationarySpeed) || stationarySpeed < 0) {
    audioProblems.push("stationary automute speed must be zero or greater");
  } else if (stationarySpeed > 5) {
    audioProblems.push(`stationary automute speed is unusually high (${stationarySpeed} m/s)`);
  }
  for (const key of ["automuteStationaryDelaySeconds", "automuteMovingDelaySeconds"]) {
    const value = Number(audio[key]);
    if (!Number.isFinite(value) || value < 0) {
      audioProblems.push(`${key} must be zero or greater`);
    } else if (value > 300) {
      audioProblems.push(`${key} is unusually long (${value} s)`);
    }
  }
  const allWellInterval = Number(audio.allWellIntervalMinutes);
  if (!Number.isFinite(allWellInterval) || allWellInterval <= 0) {
    audioProblems.push("all's-well interval must be greater than zero minutes");
  } else if (allWellInterval > 240) {
    audioProblems.push(`all's-well interval is unusually long (${allWellInterval} minutes)`);
  }
  return {
    ok: profileProblems.length === 0 && audioProblems.length === 0,
    profileProblems,
    audioProblems,
    observations,
  };
}

function summarizeTrafficProfiles(profiles = {}) {
  const summary = {};
  for (const profileName of ["anchor", "harbor", "coastal", "offshore"]) {
    const profile = profiles?.[profileName] || {};
    summary[profileName] = {
      automuteStationary: profile.automuteStationary,
      cpaSensitivity: profile.cpaSensitivity,
      tcpaLookahead: profile.tcpaLookahead,
      repeatSensitivity: profile.repeatSensitivity,
      warning: summarizeCriteria(profile.warning),
      danger: summarizeCriteria(profile.danger),
    };
  }
  if (profiles?.current) summary.current = profiles.current;
  return summary;
}

function summarizeCriteria(criteria = {}) {
  if (!criteria || typeof criteria !== "object") return {};
  const result = {};
  for (const size of ["small", "medium", "large"]) {
    const sized = criteria.bySize?.[size] || criteria[size];
    if (sized) result[size] = {
      cpa: Math.round(Number(sized.cpa) || 0),
      tcpa: Math.round(Number(sized.tcpa) || 0),
      speed: Number(sized.speed) || 0,
    };
  }
  if (!Object.keys(result).length && (criteria.cpa !== undefined || criteria.tcpa !== undefined)) {
    result.default = {
      cpa: Math.round(Number(criteria.cpa) || 0),
      tcpa: Math.round(Number(criteria.tcpa) || 0),
      speed: Number(criteria.speed) || 0,
    };
  }
  return result;
}

function jsonClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
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
  const pathName = OPTIONAL_PLUGIN_STATUS_PATHS[pluginId];
  return pathName ? readSelfPath(app, pathName) : null;
}

function pluginAvailabilityTest(options) {
  const pluginId = String(options.pluginId || "");
  return {
    id: options.id,
    number: options.number,
    title: options.title || `${suitePluginTitle(pluginId)} availability`,
    description: `${options.optional ? "Optional" : "Required"} check that ${suitePluginTitle(pluginId)} is installed, enabled, and visible to Console.`,
    timeoutSeconds: 5,
    optional: options.optional === true,
    required: options.required === true,
    pluginId,
    groupId: options.groupId || "",
  };
}

function pluginAvailabilityTestById(testId) {
  return PLUGIN_AVAILABILITY_TESTS.find((test) => test.id === testId) || null;
}

function pluginContractTest(options) {
  const pluginId = String(options.pluginId || "");
  return {
    id: options.id,
    number: options.number,
    title: options.title || `${suitePluginTitle(pluginId)} contract`,
    description: options.description || `Checks the suite-facing ${suitePluginTitle(pluginId)} runtime contract.`,
    timeoutSeconds: options.timeoutSeconds || 5,
    optional: true,
    pluginId,
    groupId: options.groupId || "",
  };
}

function shortPluginId(pluginId) {
  return String(pluginId || "")
    .replace(/^signalk-ajrm-marine-/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function suitePluginTitle(pluginId) {
  const titles = {
    "signalk-ajrm-marine-alerts": "Alert Panel",
    "signalk-ajrm-marine-audio": "Audio",
    "signalk-ajrm-marine-capture": "Capture",
    "signalk-ajrm-marine-console": "Console",
    "signalk-ajrm-marine-display": "Display",
    "signalk-ajrm-marine-dr-plotter": "DR Plotter",
    "signalk-ajrm-marine-gps-integrity": "GPS Integrity",
    "signalk-ajrm-marine-harbour-editor": "Harbour Editor",
    "signalk-ajrm-marine-instrument-alerts": "Instrument Alerts",
    "signalk-ajrm-marine-instruments": "Instruments",
    "signalk-ajrm-marine-logger": "Logger",
    "signalk-ajrm-marine-notifications": "Notifications",
    "signalk-ajrm-marine-pi-controller": "Pi Controller",
    "signalk-ajrm-marine-simulator": "Simulator",
    "signalk-ajrm-marine-snapshot": "Snapshot",
    "signalk-ajrm-marine-traffic": "Traffic",
    "signalk-ajrm-marine-vessel-database": "Vessel Database",
    "signalk-ajrm-marine-voyage-viewer": "Voyage Viewer",
  };
  if (titles[pluginId]) return titles[pluginId];
  return String(pluginId || "Plugin")
    .replace(/^signalk-ajrm-marine-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pluginAvailabilityEvidence(app, pluginId) {
  if (pluginId === packageInfo.name) {
    return {
      pluginId,
      installed: true,
      title: suitePluginTitle(pluginId),
      version: packageInfo.version,
      url: "/signalk-ajrm-marine-console/",
      kind: "webapp",
      status: readSelfPath(app, "plugins.ajrmMarineConsole"),
    };
  }
  return optionalPluginEvidence(app, pluginId);
}

async function runPluginAvailabilityBite(app, { consoleVersion, test }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = pluginAvailabilityEvidence(app, test.pluginId);
  const requiredEvidence = test.required ? requiredSuitePluginEvidence(app) : null;
  const runtimeCheck = requiredEvidence?.runtimeChecks?.find((item) => item.id === test.pluginId) || null;
  const assertions = [
    assertion(
      "plugin-visible",
      evidence.installed,
      evidence.installed
        ? `${suitePluginTitle(test.pluginId)} is installed and visible to Console.`
        : `${suitePluginTitle(test.pluginId)} is not installed, not enabled, or not visible to Console.`,
    ),
    assertion(
      "webapp-route",
      evidence.installed && evidence.url.length > 0,
      evidence.url
        ? `${suitePluginTitle(test.pluginId)} webapp route is ${evidence.url}.`
        : `${suitePluginTitle(test.pluginId)} webapp route is missing.`,
    ),
  ];
  if (test.required && test.pluginId !== packageInfo.name) {
    assertions.push(assertion(
      "required-runtime",
      runtimeCheck?.ok === true,
      runtimeCheck?.ok === true
        ? `${suitePluginTitle(test.pluginId)} runtime check passed.`
        : runtimeCheck?.message || `${suitePluginTitle(test.pluginId)} runtime check is missing or failed.`,
    ));
  }
  if (evidence.status) {
    assertions.push(assertion(
      "status-projection-visible",
      true,
      `${suitePluginTitle(test.pluginId)} status projection is visible.`,
    ));
  }
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: test.id,
    testId: test.id,
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? `${suitePluginTitle(test.pluginId)} plugin availability check passed.`
      : `${suitePluginTitle(test.pluginId)} plugin availability check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: evidence,
  });
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
  const settingsRestore = await restoreBiteSettings(app);
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
    assertion(
      "bite-settings-restored",
      settingsRestore.ok,
      settingsRestore.ok
        ? settingsRestore.message
        : `BITE settings restore failed: ${settingsRestore.message}`,
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
      settingsRestore,
    }],
    summary: result === "pass"
      ? "Spoken BITE summary was requested. Confirm it was heard on the selected audio output."
      : `Spoken BITE summary check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      message,
      audio: audioPolicySummary(finalAudio),
      audioDeliveryEvidence: deliveryEvidence,
      audioClientSettleMs: clientSettleMs,
      settingsRestore,
      precedingTests: reportsToSummarize.map((report) => ({
        testId: report.testId,
        result: report.result,
        summary: report.summary,
      })),
    },
  });
}

async function runAudioPlayableOutputPathBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const message = "Marine built in tests audio file path check.";
  let publishError = "";
  try {
    publishBiteAudioSummary(app, { pluginId, runId, message });
  } catch (error) {
    publishError = error.message || String(error);
  }
  const deliveryEvidence = publishError
    ? null
    : await waitForBiteAudioSummary(app, { message, startedAtMs, timeoutMs });
  const playableEvidence = publishError
    ? null
    : await waitForPlayableAudioEvidence(app, { message, startedAtMs, timeoutMs });
  const finalAudio = readSelfPath(app, WATCH_PATHS.audio) || {};
  const assertions = [
    assertion(
      "audio-path-check-published",
      !publishError,
      publishError
        ? `Could not publish audio path check: ${publishError}`
        : "Audio path check was published to Notifications.",
    ),
    assertion(
      "audio-path-check-rendered",
      Boolean(deliveryEvidence),
      deliveryEvidence
        ? `Audio reports the path check reached ${deliveryEvidence.state}.`
        : `Audio has not yet rendered the path check. ${audioProgressSummary(finalAudio)}`,
    ),
    assertion(
      "playable-audio-url-visible",
      Boolean(playableEvidence?.url),
      playableEvidence?.url
        ? `Playable audio URL is visible: ${playableEvidence.url}`
        : "Audio status does not expose a recent audioUrl/publicAudioUrl/assetUrl for the rendered announcement.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "audio-playable-output-path",
    testId: "audio-playable-output-path",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      message,
      audioEvidence: deliveryEvidence,
      playableEvidence,
      audioProgress: audioProgressSummary(finalAudio),
    }],
    summary: result === "pass"
      ? "Audio rendered a BITE check and exposed a playable MP3 path for clients."
      : `Audio playable output path check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      message,
      audio: audioPolicySummary(finalAudio),
      deliveryEvidence,
      playableEvidence,
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

async function waitForPlayableAudioEvidence(app, { message, startedAtMs, timeoutMs }) {
  const deadline = Date.now() + Math.max(5000, Number(timeoutMs) || 30000);
  do {
    const evidence = playableAudioEvidence(readSelfPath(app, WATCH_PATHS.audio), {
      message,
      startedAtMs,
    });
    if (evidence?.url) return evidence;
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
  hdop = 0.8,
  satellites = 12,
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
    hdop,
    satellites,
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

function playableAudioEvidence(audio, { message, startedAtMs }) {
  if (!audio || typeof audio !== "object") return null;
  const candidates = [];
  if (audio.lastAnnouncement) candidates.push({ ...audio.lastAnnouncement, source: "lastAnnouncement" });
  for (const announcement of audio.recentAnnouncements || []) {
    candidates.push({ ...announcement, source: "recentAnnouncements" });
  }
  for (const event of audio.recentEvents || []) {
    candidates.push({ ...event, source: "recentEvents" });
  }
  const candidate = candidates.find((entry) => {
    const text = String(entry.message || "");
    const timestamp = entry.renderedAt || entry.localPlaybackStartedAt || entry.localPlaybackCompletedAt ||
      entry.queuedAt || entry.receivedAt || entry.ts || "";
    return text.includes(message) && freshEnough(timestamp, startedAtMs) && Boolean(audioOutputUrl(entry));
  });
  if (!candidate) return null;
  return {
    source: candidate.source || "",
    message: candidate.message || "",
    timestamp: candidate.renderedAt || candidate.localPlaybackStartedAt || candidate.localPlaybackCompletedAt ||
      candidate.queuedAt || candidate.receivedAt || candidate.ts || "",
    url: audioOutputUrl(candidate),
  };
}

function audioOutputUrl(entry = {}) {
  return String(
    entry.publicAudioUrl ||
    entry.audioUrl ||
    entry.publicAssetUrl ||
    entry.assetUrl ||
    entry.url ||
    "",
  );
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
      expiresSeconds: AUDIO_SUMMARY_EXPIRES_SECONDS,
    },
    history: {
      policy: "always",
    },
    expiresAt: new Date(Date.now() + AUDIO_SUMMARY_EXPIRES_SECONDS * 1000).toISOString(),
    audioExpiresAt: new Date(Date.now() + AUDIO_SUMMARY_EXPIRES_SECONDS * 1000).toISOString(),
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

async function runVesselDatabaseSummaryContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, VESSEL_DATABASE_PLUGIN_ID);
  const summary = evidence.status || {};
  const stats = summary.stats || {};
  const assertions = [
    assertion(
      "vessel-database-visible",
      evidence.installed,
      evidence.installed
        ? "Vessel Database is installed and visible to Console."
        : "Vessel Database is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "summary-visible",
      Boolean(evidence.status),
      evidence.status
        ? "Vessel Database summary projection is visible."
        : "Vessel Database summary projection is missing.",
    ),
    assertion(
      "summary-identity",
      summary.plugin === VESSEL_DATABASE_PLUGIN_ID || typeof summary.version === "string",
      "Vessel Database summary should identify the plugin or version.",
    ),
    assertion(
      "vessel-count",
      finiteNonNegative(summary.vesselCount),
      "Vessel Database summary should include a non-negative vessel count.",
    ),
    assertion(
      "fill-policy-visible",
      typeof summary.fillMissingData === "boolean",
      "Vessel Database summary should expose whether missing AIS fields are being filled.",
    ),
    assertion(
      "stats-visible",
      ["learned", "updated", "filled", "ignored", "errors"].some((key) => finiteNonNegative(stats[key])),
      "Vessel Database summary should expose at least one non-negative stats counter.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "vessel-database-summary-contract",
    testId: "vessel-database-summary-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "Vessel Database summary contract is available."
      : `Vessel Database summary contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      url: evidence.url,
      version: evidence.version,
      summary,
    },
  });
}

async function runLoggerApiContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, LOGGER_PLUGIN_ID);
  const api = loggerApi(app);
  let status = null;
  let statusError = "";
  let paths = null;
  try {
    status = typeof api?.status === "function" ? await api.status() : null;
  } catch (error) {
    statusError = error?.message || String(error);
  }
  try {
    paths = typeof api?.paths === "function" ? api.paths() : null;
  } catch (_error) {
    paths = null;
  }
  const assertions = [
    assertion(
      "logger-visible",
      evidence.installed,
      evidence.installed
        ? "Logger is installed and visible to Console."
        : "Logger is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "api-visible",
      Boolean(api),
      api ? "Logger runtime API is visible." : "Logger runtime API is missing.",
    ),
    assertion(
      "api-methods",
      ["status", "startCapture", "stopCapture", "paths"].every((method) => typeof api?.[method] === "function"),
      "Logger runtime API should expose status, startCapture, stopCapture, and paths methods.",
    ),
    assertion(
      "status-readable",
      Boolean(status) && !statusError,
      statusError ? `Logger status threw: ${statusError}` : "Logger status is readable.",
    ),
    assertion(
      "status-shape",
      status?.ok === true || Boolean(status?.recording || status?.playback || status?.paths),
      "Logger status should expose ok/recording/playback/path state.",
    ),
    assertion(
      "paths-visible",
      Boolean(paths) || Boolean(status?.paths),
      "Logger API should expose the configured recording paths.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "logger-api-contract",
    testId: "logger-api-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "Logger runtime API contract is available."
      : `Logger runtime API contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      url: evidence.url,
      version: evidence.version,
      status,
      statusError,
      paths,
    },
  });
}

async function runLoggerReplaySanityContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, LOGGER_PLUGIN_ID);
  const api = loggerApi(app);
  let status = null;
  let statusError = "";
  try {
    status = typeof api?.status === "function" ? await api.status() : null;
  } catch (error) {
    statusError = error?.message || String(error);
  }
  const playback = status?.playback || evidence.status || {};
  const assertions = [
    assertion(
      "logger-visible",
      evidence.installed,
      evidence.installed
        ? "Logger is installed and visible to Console."
        : "Logger is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "playback-state-visible",
      Boolean(playback && typeof playback === "object"),
      "Logger should expose a playback state object.",
    ),
    assertion(
      "playback-active-explicit",
      typeof playback.active === "boolean",
      "Logger playback state should explicitly expose whether replay is active.",
    ),
    assertion(
      "playback-speed-visible",
      playback.speed == null || Number.isFinite(Number(playback.speed)),
      playback.speed == null
        ? "Logger playback speed is omitted; accepting idle logger status."
        : `Logger playback speed is ${playback.speed}.`,
    ),
    assertion(
      "fresh-timestamp-policy-visible",
      playback.active !== true ||
        playback.freshTimestamps === true ||
        playback.retimestamp === true ||
        playback.timestampMode === "fresh",
      playback.active === true
        ? "Active Logger replay should publish fresh Signal K update timestamps."
        : "Logger replay is idle; fresh timestamp policy is not currently exercised.",
    ),
    assertion(
      "derived-data-replay-disabled-or-explicit",
      playback.derivedDataReplay === false ||
        playback.replayDerivedData === false ||
        playback.excludeDerivedData === true ||
        playback.active !== true,
      playback.active === true
        ? "Active Logger replay should avoid replaying derived suite data unless explicitly configured safe."
        : "Logger replay is idle; derived data replay is not currently active.",
    ),
  ];
  if (statusError) {
    assertions.push(assertion("status-readable", false, `Logger status threw: ${statusError}`));
  }
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "logger-replay-sanity-contract",
    testId: "logger-replay-sanity-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ evidence, playback }],
    summary: result === "pass"
      ? "Logger replay state is explicit enough for safe voyage replay."
      : `Logger replay sanity contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { status, playback, statusError },
  });
}

async function runInstrumentAlertsDepthCalloutCapabilityBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, INSTRUMENT_ALERTS_PLUGIN_ID);
  const status = evidence.status || {};
  const capabilities = status.capabilities || {};
  const depthCallout = status.depthCallout || capabilities.depthCallout || {};
  const supported = depthCallout === true ||
    depthCallout.supported === true ||
    depthCallout.available === true ||
    capabilities.anchoringDepthCallout === true;
  const assertions = [
    assertion(
      "instrument-alerts-visible",
      evidence.installed,
      evidence.installed
        ? "Instrument Alerts is installed and visible to Console."
        : "Instrument Alerts is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "depth-callout-capability-visible",
      supported,
      supported
        ? "Instrument Alerts advertises anchoring depth callout support."
        : "Instrument Alerts does not yet advertise anchoring depth callout support.",
    ),
    assertion(
      "depth-source-visible",
      !supported || Boolean(depthCallout.path || depthCallout.sourcePath || status.monitors),
      supported
        ? "Depth callout exposes a depth path/source or monitor list."
        : "Depth callout capability is not available.",
    ),
    assertion(
      "depth-callout-audio-policy-visible",
      !supported || depthCallout.audio !== false,
      supported
        ? "Depth callout is able to request audio output."
        : "Depth callout capability is not available.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "instrument-alerts-depth-callout-capability",
    testId: "instrument-alerts-depth-callout-capability",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ evidence, depthCallout }],
    summary: result === "pass"
      ? "Instrument Alerts advertises the anchoring depth callout capability."
      : `Instrument Alerts depth callout capability failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { status, depthCallout },
  });
}

async function runHarbourEditorDefaultDataContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, HARBOUR_EDITOR_PLUGIN_ID);
  const status = evidence.status || {};
  const assertions = [
    assertion(
      "harbour-editor-visible",
      evidence.installed,
      evidence.installed
        ? "Harbour Editor is installed and visible to Console."
        : "Harbour Editor is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "status-contract",
      status.contract === "ajrm-marine-harbour-editor-status" && status.enabled === true,
      "Harbour Editor status should be enabled and use the recognised status contract.",
    ),
    assertion(
      "harbour-count",
      finiteNonNegative(status.harbourCount),
      "Harbour Editor status should include a non-negative local harbour count.",
    ),
    assertion(
      "default-harbour-count",
      finiteNonNegative(status.defaultHarbourCount) && Number(status.defaultHarbourCount) > 0,
      "Harbour Editor should report a non-empty default harbour set.",
    ),
    assertion(
      "seed-state-visible",
      typeof status.seedState === "string" && status.seedState.length > 0,
      "Harbour Editor should report local/default data seed state.",
    ),
    assertion(
      "local-data-not-smaller-than-defaults",
      !finiteNonNegative(status.harbourCount) ||
        !finiteNonNegative(status.defaultHarbourCount) ||
        Number(status.harbourCount) >= Number(status.defaultHarbourCount),
      "Local harbour count should not be smaller than the installed default set.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "harbour-editor-default-data-contract",
    testId: "harbour-editor-default-data-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "Harbour Editor default-data contract is available."
      : `Harbour Editor default-data contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: evidence,
  });
}

async function runPiControllerTelemetryContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, PI_CONTROLLER_PLUGIN_ID);
  const telemetry = evidence.status || {};
  const system = telemetry.system || telemetry;
  const memory = system.memory || {};
  const processInfo = system.process || {};
  const assertions = [
    assertion(
      "pi-controller-visible",
      evidence.installed,
      evidence.installed
        ? "Pi Controller is installed and visible to Console."
        : "Pi Controller is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "telemetry-visible",
      Boolean(evidence.status),
      evidence.status
        ? "Pi Controller telemetry projection is visible."
        : "Pi Controller telemetry projection is missing.",
    ),
    assertion(
      "host-identity",
      typeof system.hostname === "string" || typeof system.platform === "string" || typeof telemetry.version === "string",
      "Pi Controller telemetry should identify the host, platform, or plugin version.",
    ),
    assertion(
      "uptime-visible",
      finiteNonNegative(system.uptimeSeconds) || finiteNonNegative(system.uptime),
      "Pi Controller telemetry should expose non-negative host uptime.",
    ),
    assertion(
      "memory-visible",
      finiteNonNegative(memory.totalBytes) || finiteNonNegative(memory.freeBytes) || finiteNonNegative(memory.usedBytes),
      "Pi Controller telemetry should expose memory counters.",
    ),
    assertion(
      "process-visible",
      finiteNonNegative(processInfo.pid) || finiteNonNegative(processInfo.uptimeSeconds),
      "Pi Controller telemetry should expose Signal K process information.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "pi-controller-telemetry-contract",
    testId: "pi-controller-telemetry-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [evidence],
    summary: result === "pass"
      ? "Pi Controller telemetry contract is available."
      : `Pi Controller telemetry contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      url: evidence.url,
      version: evidence.version,
      telemetry,
    },
  });
}

async function runSnapshotApiContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, SNAPSHOT_PLUGIN_ID);
  const api = snapshotApi(app);
  let snapshot = null;
  let snapshotError = "";
  if (api?.snapshot) {
    try {
      snapshot = await api.snapshot({ reason: "bite-contract" });
    } catch (error) {
      snapshotError = error.message || String(error);
    }
  }
  const assertions = [
    assertion(
      "snapshot-visible",
      evidence.installed,
      evidence.installed
        ? "Snapshot is installed and visible to Console."
        : "Snapshot is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "snapshot-api-visible",
      typeof api?.snapshot === "function",
      "Snapshot should expose an in-process snapshot() API for diagnostic bundles.",
    ),
    assertion(
      "snapshot-callable",
      !api?.snapshot || (snapshot && typeof snapshot === "object" && !snapshotError),
      snapshotError ? `Snapshot API failed: ${snapshotError}` : "Snapshot API should return a diagnostic object.",
    ),
    assertion(
      "snapshot-has-content",
      !snapshot || Object.keys(snapshot).length > 0,
      "Snapshot API should return a non-empty object.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "snapshot-api-contract",
    testId: "snapshot-api-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ ...evidence, snapshotError }],
    summary: result === "pass"
      ? "Snapshot API contract is available."
      : `Snapshot API contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      evidence,
      snapshotKeys: snapshot && typeof snapshot === "object" ? Object.keys(snapshot).slice(0, 30) : [],
      snapshotError,
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

async function runCaptureApiContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const capture = captureApi(app);
  let status = null;
  let statusError = "";
  if (capture?.status) {
    try {
      status = await capture.status();
    } catch (error) {
      statusError = error.message || String(error);
    }
  }
  const assertions = [
    assertion(
      "capture-api-present",
      Boolean(capture),
      capture ? "Capture API registry is present." : "Capture API registry is missing.",
    ),
    assertion(
      "capture-control-methods",
      Boolean(capture?.status && capture?.start && capture?.stop && capture?.setAutomaticRecordingEnabled),
      "Capture API should expose status, start, stop, and setAutomaticRecordingEnabled methods.",
    ),
    assertion(
      "capture-status-readable",
      Boolean(status && typeof status === "object"),
      status
        ? "Capture status is readable."
        : `Capture status is not readable${statusError ? `: ${statusError}` : "."}`,
    ),
    assertion(
      "capture-enabled-state-explicit",
      !status || typeof status.enabled === "boolean" || typeof status.automaticRecordingEnabled === "boolean",
      "Capture status should expose whether automatic recording is enabled.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "capture-api-contract",
    testId: "capture-api-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ statusError }],
    summary: result === "pass"
      ? "Capture API contract is usable for BITE diagnostic bundles."
      : `Capture API contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: status,
  });
}

async function runTrafficApiContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const traffic = trafficApi(app);
  let status = null;
  let statusError = "";
  if (traffic?.status) {
    try {
      status = await traffic.status();
    } catch (error) {
      statusError = error.message || String(error);
    }
  }
  const assertions = [
    assertion(
      "traffic-api-present",
      Boolean(traffic),
      traffic ? "Traffic API registry is present." : "Traffic API registry is missing.",
    ),
    assertion(
      "traffic-control-methods",
      Boolean(traffic?.status && traffic?.setAudioPolicy && traffic?.setProfile && traffic?.setProfiles),
      "Traffic API should expose status, setAudioPolicy, setProfile, and setProfiles methods.",
    ),
    assertion(
      "traffic-status-readable",
      Boolean(status && typeof status === "object"),
      status
        ? "Traffic status is readable."
        : `Traffic status is not readable${statusError ? `: ${statusError}` : "."}`,
    ),
    assertion(
      "traffic-status-audio-policy",
      !status || Boolean((status.audioPolicy || status.trafficAudioPolicy) && status.profile && status.profiles),
      "Traffic status should expose audio policy, selected profile, and profile settings.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "traffic-api-contract",
    testId: "traffic-api-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ statusError }],
    summary: result === "pass"
      ? "Traffic API contract is usable for shared audio-policy control."
      : `Traffic API contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: status,
  });
}

async function runAudioStatusDetailContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const audio = snapshot.audio || {};
  const dependencies = audio.dependencies || {};
  const recentEvents = Array.isArray(audio.recentEvents) ? audio.recentEvents : [];
  const hasOutputState = ["localPlayback", "liveStream", "publicHttpStream", "browserPlayback"].some((key) =>
    Object.prototype.hasOwnProperty.call(audio, key)
  );
  const assertions = [
    assertion(
      "audio-contract",
      audio.contract === "ajrm-marine-audio-status",
      audio.contract ? `Audio status contract is ${audio.contract}.` : "Audio status projection is missing.",
    ),
    assertion(
      "audio-mute-booleans",
      ["enabled", "muted", "pluginMuted", "engineMuted"].every((key) => typeof audio[key] === "boolean"),
      "Audio status should expose enabled, muted, pluginMuted, and engineMuted booleans.",
    ),
    assertion(
      "audio-queue-length",
      finiteNonNegative(audio.queueLength ?? 0),
      `Audio queue length is ${audio.queueLength ?? 0}.`,
    ),
    assertion(
      "audio-recent-events-array",
      Array.isArray(audio.recentEvents),
      "Audio status should expose recentEvents for delayed/interrupted audio debugging.",
    ),
    assertion(
      "audio-recent-events-shaped",
      recentEvents.length === 0 || recentEvents.every((event) => event && typeof event.event === "string" && (event.ts || event.timestamp)),
      "Audio recent events should include event names and timestamps.",
    ),
    assertion(
      "audio-dependencies-explicit",
      typeof dependencies === "object" && (Object.prototype.hasOwnProperty.call(dependencies, "ok") || typeof dependencies.summary === "string"),
      "Audio dependency readiness should be explicit.",
    ),
    assertion(
      "audio-output-state-explicit",
      hasOutputState,
      "Audio status should expose selected output paths.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "audio-status-detail-contract",
    testId: "audio-status-detail-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [],
    summary: result === "pass"
      ? "Audio status details are sufficient for queue and output debugging."
      : `Audio status detail contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      audio: audioPolicySummary(audio),
      dependencies,
      recentEvents: recentEvents.slice(0, 8),
    },
  });
}

async function runNotificationsVisualContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const notifications = snapshot.notifications || {};
  const active = Array.isArray(notifications.active) ? notifications.active : [];
  const visualEvents = active.filter((event) => event?.delivery?.visual !== false);
  const assertions = [
    assertion(
      "notifications-contract",
      notifications.contract === "notifications-plus-projection",
      notifications.contract ? `Notifications contract is ${notifications.contract}.` : "Notifications projection is missing.",
    ),
    assertion(
      "notifications-active-array",
      Array.isArray(notifications.active),
      "Notifications active list should be an array.",
    ),
    assertion(
      "notifications-history-arrays",
      Array.isArray(notifications.history) && Array.isArray(notifications.recentActivity),
      "Notifications should expose history and recentActivity arrays.",
    ),
    assertion(
      "visual-events-shaped",
      visualEvents.length === 0 || visualEvents.every((event) =>
        Boolean(event.timestamp) &&
        Boolean(event.presentation?.message || event.message) &&
        Boolean(event.priority) &&
        Boolean(event.delivery)
      ),
      "Active visual events should include timestamp, presentation message, priority, and delivery policy.",
    ),
    assertion(
      "audio-sequence-numeric",
      Number.isFinite(Number(notifications.audioSequence)),
      "Notifications should expose numeric audioSequence for audio-chain debugging.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "notifications-visual-contract",
    testId: "notifications-visual-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ activeCount: active.length, visualCount: visualEvents.length }],
    summary: result === "pass"
      ? "Notifications visual event contract is coherent."
      : `Notifications visual contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      contract: notifications.contract,
      sequence: notifications.sequence,
      active: active.slice(0, 8),
      historyCount: Array.isArray(notifications.history) ? notifications.history.length : null,
      recentActivityCount: Array.isArray(notifications.recentActivity) ? notifications.recentActivity.length : null,
      audioSequence: notifications.audioSequence,
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

async function runGpsIntegrityDiagnosticsContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const diagnostics = gpsIntegrity.diagnostics || {};
  const observed = diagnostics.observed || {};
  const decision = diagnostics.decision || {};
  const thresholds = diagnostics.thresholds || {};
  const assertions = [
    assertion(
      "gps-diagnostics-contract",
      diagnostics.contract === "ajrm-marine-gps-integrity-diagnostics" &&
        Number(diagnostics.contractVersion) >= 1,
      diagnostics.contract
        ? `GPS Integrity diagnostics contract is ${diagnostics.contract} v${diagnostics.contractVersion}.`
        : "GPS Integrity diagnostics contract is missing.",
    ),
    assertion(
      "gps-diagnostics-observed-inputs",
      typeof observed.positionPresent === "boolean" &&
        typeof observed.fixValid === "boolean" &&
        Object.prototype.hasOwnProperty.call(observed, "hdop") &&
        Object.prototype.hasOwnProperty.call(observed, "satellites"),
      "Diagnostics should expose observed position/fix/HDOP/satellite inputs.",
    ),
    assertion(
      "gps-diagnostics-decision-flags",
      typeof decision.acceptedGps === "boolean" &&
        typeof decision.positionJumpRejected === "boolean" &&
        typeof decision.degradedSignalActive === "boolean" &&
        typeof decision.drDiscrepancyActive === "boolean" &&
        Array.isArray(decision.reasons),
      "Diagnostics should expose accepted/rejected/degraded/DR decision flags and reasons.",
    ),
    assertion(
      "gps-diagnostics-thresholds",
      ["maxBoatSpeedKnots", "maxHdop", "minSatellites", "gpsLostSeconds", "warningDrDiscrepancyMeters", "alarmDrDiscrepancyMeters"]
        .every((key) => Number.isFinite(Number(thresholds[key]))),
      "Diagnostics should expose the thresholds used for the decision.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-integrity-diagnostics-contract",
    testId: "gps-integrity-diagnostics-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      trust: gpsIntegrity.trust || "",
      diagnosticsContract: diagnostics.contract || "",
      observed,
      decision,
      thresholds,
    }],
    summary: result === "pass"
      ? "GPS Integrity diagnostics contract is present for voyage review."
      : `GPS Integrity diagnostics contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { gpsIntegrity: gpsIntegritySummary(gpsIntegrity), diagnostics },
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
      gpsIntegrity.trust === "lost" && gpsUnavailable(gpsIntegrity),
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
      jumped?.acceptedGps !== true && (jumped?.trust === "suspect" || /Position jump/i.test((jumped?.reasons || []).join(" "))),
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
        predicate: (state) => state.trust === "lost" && gpsUnavailable(state),
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
      predicate: (state) => state.trust === "lost" && gpsUnavailable(state),
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
    assertion("retained-current-gps-lost", lost?.trust === "lost" && gpsUnavailable(lost), "GPS should be lost after GPS and live current are removed."),
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

async function runGpsExplicitNoFixImmediateBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let lost = null;
  let noFixStartedAtMs = 0;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "explicit-no-fix-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(6000, timeoutMs / 2),
      predicate: (state) => state.acceptedGps === true && state.gps?.fixValid === true,
    });
    noFixStartedAtMs = Date.now();
    publishDeadReckoningExerciseSample(app, {
      pluginId,
      runId,
      phase: "explicit-no-fix",
      position: baselinePosition,
      includeGps: false,
      includeCurrent: false,
    });
    lost = await waitForGpsIntegrity(app, {
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) =>
        state.trust === "lost" &&
        gpsUnavailable(state) &&
        (state.gps?.explicitGpsUnavailable === true || /no fix|no gps|missing|invalid/i.test((state.reasons || []).join(" "))),
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
  const observedAtMs = Date.parse(lost?.timestamp || "");
  const lossDelaySeconds = Number.isFinite(observedAtMs) && noFixStartedAtMs
    ? Math.max(0, (observedAtMs - noFixStartedAtMs) / 1000)
    : null;
  const assertions = [
    assertion("explicit-no-fix-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted before the no-fix sample."),
    assertion("explicit-no-fix-lost", lost?.trust === "lost" && gpsUnavailable(lost), "Explicit GNSS no-fix should make GPS Integrity report lost."),
    assertion(
      "explicit-no-fix-flag-visible",
      lost?.gps?.explicitGpsUnavailable === true || /no fix|no gps/i.test((lost?.reasons || []).join(" ")),
      lost?.gps?.explicitGpsUnavailable === true
        ? "GPS Integrity exposes explicitGpsUnavailable=true."
        : `GPS Integrity reasons: ${(lost?.reasons || []).join("; ") || "missing"}.`,
    ),
    assertion(
      "explicit-no-fix-not-stale-timeout",
      lossDelaySeconds !== null && lossDelaySeconds <= 8,
      lossDelaySeconds === null
        ? "No explicit loss timestamp was observed."
        : `GPS lost was observed ${lossDelaySeconds.toFixed(1)} seconds after explicit no-fix injection.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-explicit-no-fix-immediate",
    testId: "gps-explicit-no-fix-immediate",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{
      noFixStartedAt: noFixStartedAtMs ? new Date(noFixStartedAtMs).toISOString() : "",
      observedLossDelaySeconds: lossDelaySeconds,
      reasons: lost?.reasons || [],
    }],
    summary: result === "pass"
      ? "Explicit GNSS no-fix was treated as lost GPS immediately."
      : `Explicit no-fix GPS check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), lost: gpsIntegritySummary(lost || {}) },
  });
}

async function runGpsWeakSignalDetectionBite(app, { pluginId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const baselinePosition = { ...OWN_POSITION };
  let baseline = null;
  let degraded = null;
  try {
    baseline = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "weak-signal-baseline",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      timeoutMs: Math.min(7000, timeoutMs / 2),
      predicate: (state) => state.acceptedGps === true,
    });
    degraded = await publishAndWaitForGpsIntegrity(app, {
      pluginId,
      runId,
      phase: "weak-signal-degraded",
      position: baselinePosition,
      includeGps: true,
      includeCurrent: true,
      hdop: 12,
      satellites: 2,
      timeoutMs: Math.max(5000, timeoutMs - (Date.now() - startedAtMs)),
      predicate: (state) => gpsWeakSignalObserved(state),
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
  const before = Number(baseline?.counters?.degradedSignals || 0);
  const after = Number(degraded?.counters?.degradedSignals || before);
  const reasons = (degraded?.reasons || []).join(" ");
  const assertions = [
    assertion("weak-signal-baseline-accepted", Boolean(baseline), "Trusted GPS baseline should be accepted."),
    assertion(
      "weak-signal-degraded",
      gpsWeakSignalObserved(degraded || {}),
      degraded
        ? `Weak sample trust=${degraded.trust}; degradedSignalActive=${degraded.degradedSignalActive}.`
        : "Weak GPS sample was not observed.",
    ),
    assertion(
      "weak-signal-counter-incremented",
      after >= before + 1,
      `Weak-signal counter before=${before}, after=${after}.`,
    ),
    assertion(
      "weak-signal-reason-visible",
      /HDOP|satellites/i.test(reasons),
      reasons ? `Weak-signal reasons: ${reasons}` : "Weak-signal reasons were not published.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-weak-signal-detection",
    testId: "gps-weak-signal-detection",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ degradedSignalsBefore: before, degradedSignalsAfter: after, reasons }],
    summary: result === "pass"
      ? "Weak GPS signal was detected and counted."
      : `GPS weak-signal detection failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { baseline: gpsIntegritySummary(baseline || {}), degraded: gpsIntegritySummary(degraded || {}) },
  });
}

function gpsWeakSignalObserved(state = {}) {
  const observed = state.diagnostics?.observed || {};
  const hdop = Number(observed.hdop ?? state.gps?.hdop);
  const satellites = Number(observed.satellites ?? state.gps?.satellites);
  return (
    (Number.isFinite(hdop) && hdop >= 12) ||
    (Number.isFinite(satellites) && satellites <= 2)
  ) && (
    state.degradedSignalActive === true ||
    state.diagnostics?.decision?.degradedSignalActive === true ||
    (Array.isArray(state.reasons) && state.reasons.some((reason) => /HDOP|satellites/i.test(String(reason))))
  );
}

async function runGpsVectorArrowContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const vectors = gpsIntegrity.vectors || {};
  const heading = vectors.headingThroughWater || vectors.heading || {};
  const cog = vectors.courseOverGround || vectors.cog || {};
  const tide = vectors.tide || vectors.current || {};
  const assertions = [
    assertion(
      "gps-vectors-present",
      Boolean(vectors && Object.keys(vectors).length),
      "GPS Integrity should publish vector role metadata for DR Plotter.",
    ),
    assertion(
      "heading-single-arrow",
      !heading.available || /single/i.test(String(heading.role || heading.arrow || heading.label || "")),
      "Heading/STW vector should identify the single-arrow convention when available.",
    ),
    assertion(
      "cog-double-arrow",
      !cog.available || /double/i.test(String(cog.role || cog.arrow || cog.label || "")),
      "COG/SOG vector should identify the double-arrow convention when available.",
    ),
    assertion(
      "tide-triple-arrow",
      !tide.available || /triple/i.test(String(tide.role || tide.arrow || tide.label || "")),
      "Tide/current vector should identify the triple-arrow convention when available.",
    ),
    assertion(
      "navigation-vector-roles-coherent",
      vectorRolesCoherent(vectors),
      "Published navigation vector roles should be recognisable.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-vector-arrow-contract",
    testId: "gps-vector-arrow-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ vectorKeys: Object.keys(vectors) }],
    summary: result === "pass"
      ? "GPS/DR vector arrow contract is coherent."
      : `GPS/DR vector arrow contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { gpsIntegrity: gpsIntegritySummary(gpsIntegrity), vectors },
  });
}

async function runGpsCounterContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const counters = gpsIntegrity.counters || {};
  const counterKeys = [
    "evaluations",
    "acceptedFixes",
    "rejectedFixes",
    "positionJumps",
    "lostFixes",
    "degradedSignals",
    "drDiscrepancies",
  ];
  const numeric = counterKeys.every((key) => finiteNonNegative(counters[key]));
  const evaluations = Number(counters.evaluations);
  const accepted = Number(counters.acceptedFixes || 0);
  const rejected = Number(counters.rejectedFixes || 0);
  const assertions = [
    assertion(
      "gps-counter-object",
      counters && typeof counters === "object",
      "GPS Integrity should expose a counters object.",
    ),
    assertion(
      "gps-counters-non-negative",
      numeric,
      "GPS Integrity counters should be present and non-negative.",
    ),
    assertion(
      "gps-counter-evaluations-plausible",
      !Number.isFinite(evaluations) || accepted + rejected <= evaluations,
      `GPS counter totals accepted=${accepted}, rejected=${rejected}, evaluations=${Number.isFinite(evaluations) ? evaluations : "unknown"}.`,
    ),
    assertion(
      "gps-counter-losses-not-overcounted",
      !Number.isFinite(evaluations) || Number(counters.lostFixes || 0) <= evaluations,
      `GPS outage counter is ${counters.lostFixes ?? "unknown"} for ${Number.isFinite(evaluations) ? evaluations : "unknown"} evaluations.`,
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-counter-contract",
    testId: "gps-counter-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ counters }],
    summary: result === "pass"
      ? "GPS Integrity counters are coherent."
      : `GPS Integrity counter contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { gpsIntegrity: gpsIntegritySummary(gpsIntegrity) },
  });
}

async function runGpsCurrentContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const gpsIntegrity = snapshot.gpsIntegrity || {};
  const current = gpsIntegrity.current || {};
  const lastTrustedCurrent = gpsIntegrity.lastTrustedCurrent || {};
  const currentIsAvailable = currentAvailable(current);
  const lastTrustedAvailable = currentAvailable(lastTrustedCurrent);
  const assertions = [
    assertion(
      "current-availability-explicit",
      typeof current.available === "boolean" || currentIsAvailable,
      "GPS Integrity current state should explicitly say whether live current is available.",
    ),
    assertion(
      "current-source-explicit",
      !currentIsAvailable || typeof current.source === "string",
      current.source ? `Current source is ${current.source}.` : "Available current has no source label.",
    ),
    assertion(
      "current-set-drift-numeric",
      !currentIsAvailable || (
        (Number.isFinite(Number(current.setTrueDegrees)) || Number.isFinite(Number(current.setTrue))) &&
        (Number.isFinite(Number(current.driftKnots)) || Number.isFinite(Number(current.drift)))
      ),
      "Available current should expose numeric set and drift.",
    ),
    assertion(
      "last-trusted-current-retained",
      !lastTrustedAvailable || Boolean(lastTrustedCurrent.timestamp || lastTrustedCurrent.source || lastTrustedCurrent.setTrueDegrees != null),
      "Last trusted current should retain timestamp/source/set data for lost-GPS DR.",
    ),
    assertion(
      "lost-gps-current-source-safe",
      gpsIntegrity.trust !== "lost" || !currentIsAvailable || /last|trusted|retained|manual|config|estimated|live/i.test(String(current.source || "")),
      gpsIntegrity.trust === "lost"
        ? `Lost-GPS current source is ${current.source || "missing"}.`
        : "GPS is not lost; retained-current source check is advisory.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "gps-current-contract",
    testId: "gps-current-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ current: currentSummary(current), lastTrustedCurrent: currentSummary(lastTrustedCurrent) }],
    summary: result === "pass"
      ? "GPS/DR current contract is coherent."
      : `GPS/DR current contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { gpsIntegrity: gpsIntegritySummary(gpsIntegrity), current, lastTrustedCurrent },
  });
}

async function runDrPlotPersistenceContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evidence = optionalPluginEvidence(app, DR_PLOTTER_PLUGIN_ID);
  const status = evidence.status || {};
  const plotPersistence = status.plotFixPersistence || status.plotFixes || status.fixes || {};
  const trackPersistence = status.trackPersistence || status.track || status.breadcrumbs || {};
  const assertions = [
    assertion(
      "dr-plotter-visible",
      evidence.installed,
      evidence.installed
        ? "DR Plotter is installed and visible to Console."
        : "DR Plotter is not installed, not enabled, or not visible to Console.",
    ),
    assertion(
      "plot-fixes-server-side",
      plotPersistence.serverSide === true ||
        plotPersistence.persisted === true ||
        plotPersistence.storage === "server" ||
        Number.isFinite(Number(plotPersistence.count)),
      "DR Plotter should expose server-side persisted plot-fix state.",
    ),
    assertion(
      "breadcrumb-track-server-side",
      trackPersistence.serverSide === true ||
        trackPersistence.persisted === true ||
        trackPersistence.storage === "server" ||
        Number.isFinite(Number(trackPersistence.count)),
      "DR Plotter should expose server-side persisted breadcrumb/track state.",
    ),
    assertion(
      "plot-retention-visible",
      status.plotFixIntervalMinutes != null ||
        status.retentionHours != null ||
        plotPersistence.retentionHours != null ||
        plotPersistence.maxCount != null,
      "DR Plotter status should expose plot interval or retention/pruning policy.",
    ),
    assertion(
      "capture-bundle-path-visible",
      Boolean(status.capturePath || status.dataDirectory || plotPersistence.file || trackPersistence.file),
      "DR Plotter should expose where persisted plot/track data is stored for Capture bundles.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "dr-plot-persistence-contract",
    testId: "dr-plot-persistence-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ evidence, plotPersistence, trackPersistence }],
    summary: result === "pass"
      ? "DR Plotter exposes persisted fix/track state for page refreshes and voyage bundles."
      : `DR Plotter persistence contract failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { status, plotPersistence, trackPersistence },
  });
}

async function runTrafficOvertakingWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: OVERTAKING_TEST_TARGET_MMSI,
      name: OVERTAKING_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 240, northMeters: 90 }),
      speedMps: 3 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 6 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/You are overtaking it/i, /CPA will be (ahead|on your port side|on your starboard side)/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Overtaking encounter wording was present in the Traffic alert chain.",
    failSummary: "Traffic overtaking wording check failed",
  });
}

async function runTrafficCloseQuartersWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: CLOSE_QUARTERS_TEST_TARGET_MMSI,
      name: CLOSE_QUARTERS_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 45 }),
      speedMps: 3 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
      lengthMeters: 7,
      beamMeters: 2,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 6 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Close quarters/i, /CPA \d+ meters/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Close-quarters encounter wording was present in the Traffic alert chain.",
    failSummary: "Traffic close-quarters wording check failed",
  });
}

async function runTrafficUnnamedSpokenNameBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: UNNAMED_TEST_TARGET_MMSI,
      name: "",
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 45 }),
      speedMps: 3 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
      lengthMeters: 7,
      beamMeters: 2,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 6 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Small craft|Medium vessel|Large vessel/i],
    expectedAudioPatterns: [/Small craft|Medium vessel|Large vessel/i],
    forbiddenAudioPatterns: [new RegExp(UNNAMED_TEST_TARGET_MMSI)],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Unnamed target spoken wording omitted the MMSI while preserving the alert chain.",
    failSummary: "Traffic unnamed spoken-name check failed",
  });
}

async function runTrafficHeadOnPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: HEAD_ON_TEST_TARGET_MMSI,
      name: HEAD_ON_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 0 }),
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: (3 * Math.PI) / 2,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Risk of collision/i, /Head-on: alter starboard, pass port-to-port/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Head-on collision prompt was present in the Traffic alert chain.",
    failSummary: "Traffic head-on prompt check failed",
  });
}

async function runTrafficGiveWayPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: GIVE_WAY_TEST_TARGET_MMSI,
      name: GIVE_WAY_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: -220 }),
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: 0,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Risk of collision/i, /Give Way/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Give-way collision prompt was present in the Traffic alert chain.",
    failSummary: "Traffic give-way prompt check failed",
  });
}

async function runTrafficStandOnPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: STAND_ON_TEST_TARGET_MMSI,
      name: STAND_ON_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 220 }),
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Risk of collision/i, /Stand On/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Stand-on collision prompt was present in the Traffic alert chain.",
    failSummary: "Traffic stand-on prompt check failed",
  });
}

async function runTrafficTargetOvertakingWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: TARGET_OVERTAKING_TEST_TARGET_MMSI,
      name: TARGET_OVERTAKING_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: -180, northMeters: -80 }),
      speedMps: 7 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 4 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/It is overtaking you/i, /CPA will be on your (port|starboard) side/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Target-overtaking wording was present in the Traffic alert chain.",
    failSummary: "Traffic target-overtaking wording check failed",
  });
}

async function runTrafficSameCourseWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: SAME_COURSE_TEST_TARGET_MMSI,
      name: SAME_COURSE_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: -40, northMeters: -80 }),
      speedMps: 4 * KNOTS_TO_MPS,
      courseRad: (80 * Math.PI) / 180,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Same general course/i, /CPA will be on your (port|starboard) side/i],
    forbiddenPatterns: [/CPA will be ahead\. CPA /i],
    passSummary: "Same-course passing wording was present in the Traffic alert chain.",
    failSummary: "Traffic same-course wording check failed",
  });
}

async function runTrafficAdvisoryNoActionPromptBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: ADVISORY_NO_PROMPT_TEST_TARGET_MMSI,
      name: ADVISORY_NO_PROMPT_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 400 }),
      speedMps: 3 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
      lengthMeters: 7,
      beamMeters: 2,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 6 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/Traffic advisory/i, /(Close quarters|CPA)/i],
    forbiddenPatterns: [
      /Head-on: alter starboard/i,
      /pass port-to-port/i,
      /\bGive Way\b/i,
      /\bStand On\b/i,
      /Risk of collision/i,
    ],
    passSummary: "Advisory-level traffic wording remained descriptive without manoeuvre prompts.",
    failSummary: "Traffic advisory no-action-prompt check failed",
  });
}

async function runTrafficCpaDeduplicatedWordingBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  return runTrafficMessageScenarioBite(app, {
    pluginId,
    testId,
    consoleVersion,
    timeoutMs,
    target: {
      mmsi: CPA_DEDUP_TEST_TARGET_MMSI,
      name: CPA_DEDUP_TEST_TARGET_NAME,
      position: offsetPositionMeters(OWN_POSITION, { eastMeters: -40, northMeters: -80 }),
      speedMps: 4 * KNOTS_TO_MPS,
      courseRad: (80 * Math.PI) / 180,
      lengthMeters: 18,
      beamMeters: 5,
      aisClass: "B",
    },
    own: {
      position: OWN_POSITION,
      speedMps: 5 * KNOTS_TO_MPS,
      courseRad: Math.PI / 2,
    },
    expectedPatterns: [/CPA will be on your (port|starboard) side/i, /\d+ (meters|miles) in \d+ (second|seconds|minute|minutes)/i],
    forbiddenPatterns: [
      /CPA will be[^.]*\.\s*CPA\s/i,
      /CPA will be ahead\.\s*CPA\s/i,
      /CPA will be astern\.\s*CPA\s/i,
    ],
    passSummary: "Traffic CPA pass wording avoided repeating CPA after the CPA-will-be phrase.",
    failSummary: "Traffic CPA de-duplication wording check failed",
  });
}

async function runTrafficVisualAudioWordingAlignmentBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const target = {
    mmsi: VISUAL_AUDIO_MATCH_TEST_TARGET_MMSI,
    name: VISUAL_AUDIO_MATCH_TEST_TARGET_NAME,
    position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 45 }),
    speedMps: 3 * KNOTS_TO_MPS,
    courseRad: Math.PI / 2,
    lengthMeters: 7,
    beamMeters: 2,
    aisClass: "B",
  };
  const own = {
    position: OWN_POSITION,
    speedMps: 6 * KNOTS_TO_MPS,
    courseRad: Math.PI / 2,
  };
  const observations = [];
  let lastRefreshAt = 0;
  let finalSnapshot = null;
  let evaluation = null;
  try {
    publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
    while (Date.now() - startedAtMs <= timeoutMs) {
      if (Date.now() - lastRefreshAt >= REFRESH_MS) {
        publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
        lastRefreshAt = Date.now();
      }
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficVisualAudioAlignment(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
      });
      if (evaluation.observation) observations.push(evaluation.observation);
      if (evaluation.complete) break;
      await delay(POLL_MS);
    }
    if (!evaluation) {
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficVisualAudioAlignment(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
      });
    }
  } finally {
    await clearSyntheticScenarioTarget(app, { pluginId, runId, target });
  }
  const result = evaluation?.result || "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: testId,
    testId,
    result,
    startedAt,
    startedAtMs,
    target: {
      mmsi: target.mmsi,
      name: target.name,
    },
    assertions: evaluation?.assertions || [],
    observations: observations.slice(-12),
    summary: result === "pass"
      ? "Traffic visual and audio paths preserved the same essential encounter wording."
      : `Traffic visual/audio wording alignment check failed: ${(evaluation?.assertions || []).filter((item) => !item.pass).map((item) => item.id).join(", ") || "unknown"}.`,
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
  });
}

async function runTrafficTargetProjectionContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const traffic = snapshot.traffic || {};
  const targets = Array.isArray(traffic.targets) ? traffic.targets : [];
  const targetAssertions = targets.map((target) =>
    Boolean(target && (target.id || target.mmsi || target.name) && target.encounter && typeof target.encounter.state === "string")
  );
  const assertions = [
    assertion(
      "traffic-target-contract",
      traffic.contract === "ajrm-marine-traffic-targets" && traffic.authoritative === true,
      traffic.contract
        ? `Traffic target contract is ${traffic.contract}; authoritative=${traffic.authoritative === true}.`
        : "Traffic target projection is missing.",
    ),
    assertion(
      "traffic-target-array",
      Array.isArray(traffic.targets),
      "Traffic target projection should expose a targets array.",
    ),
    assertion(
      "traffic-target-identity",
      targets.length === 0 || targetAssertions.every(Boolean),
      targets.length === 0
        ? "No current Traffic targets; accepting an empty projection."
        : "Every projected target should expose identity and encounter state.",
    ),
    assertion(
      "traffic-debug-sequence",
      Boolean(traffic.sessionId) && Number.isFinite(Number(traffic.sequence)),
      "Traffic target projection should expose sessionId and sequence for replay/debug correlation.",
    ),
    assertion(
      "traffic-profile-visible",
      typeof traffic.profile === "string" && traffic.profile.length > 0,
      traffic.profile ? `Traffic profile is ${traffic.profile}.` : "Traffic profile is missing.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "traffic-target-projection-contract",
    testId: "traffic-target-projection-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ targetCount: targets.length }],
    summary: result === "pass"
      ? "Traffic target projection contract is coherent."
      : `Traffic target projection contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: {
      contract: traffic.contract,
      sessionId: traffic.sessionId,
      sequence: traffic.sequence,
      profile: traffic.profile,
      targets: targets.slice(0, 12),
    },
  });
}

async function runTrafficAudioPolicyContractBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const policy = snapshot.trafficAudioPolicy || {};
  const assertions = [
    assertion(
      "traffic-audio-policy-contract",
      policy.contract === "ajrm-marine-traffic-audio-policy" && policy.authoritative === true,
      policy.contract
        ? `Traffic audio policy contract is ${policy.contract}; authoritative=${policy.authoritative === true}.`
        : "Traffic audio policy projection is missing.",
    ),
    assertion(
      "traffic-audio-policy-booleans",
      ["muted", "automuteStationary", "automuteAllowed", "automaticMuteActive", "manualOverride"].every((key) =>
        typeof policy[key] === "boolean"
      ),
      "Traffic audio policy should expose mute, automute, and manual-override booleans.",
    ),
    assertion(
      "traffic-audio-policy-identity",
      Boolean(policy.sessionId) && Number.isFinite(Number(policy.sequence)) && Boolean(policy.correlationId),
      "Traffic audio policy should expose session, sequence, and correlation identifiers.",
    ),
    assertion(
      "traffic-voyage-profile-state",
      typeof policy.profile === "string" && typeof policy.status === "string",
      policy.profile
        ? `Traffic profile=${policy.profile}; status=${policy.status || "missing"}.`
        : "Traffic audio policy profile/status is missing.",
    ),
    assertion(
      "traffic-audio-policy-mode",
      !policy.mode || policy.mode === "traffic",
      policy.mode ? `Traffic audio policy mode is ${policy.mode}.` : "Traffic audio policy mode is omitted; accepting older status.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "traffic-audio-policy-contract",
    testId: "traffic-audio-policy-contract",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ trafficAudioPolicy: trafficPolicySummary(policy) }],
    summary: result === "pass"
      ? "Traffic audio policy contract is coherent."
      : `Traffic audio policy contract check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: trafficPolicySummary(policy),
  });
}

async function runTrafficHarbourProfileBoundaryBite(app, { consoleVersion }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const snapshot = collectSnapshot(app);
  const traffic = snapshot.traffic || {};
  const policy = snapshot.trafficAudioPolicy || {};
  const profile = policy.profile || traffic.profile || "";
  const autoProfile = snapshot.trafficAutoProfile || policy.autoProfile || traffic.autoProfile || traffic.profileAutomation || {};
  const autoProfileSettings = autoProfile.settings || autoProfile.options || {};
  const autoProfileStatus = autoProfile.status || autoProfile.reason || "";
  const boundary = policy.harbourBoundary || traffic.harbourBoundary || traffic.harbour || {};
  const assertions = [
    assertion(
      "traffic-profile-visible",
      typeof profile === "string" && profile.length > 0,
      profile ? `Traffic profile is ${profile}.` : "Traffic profile is missing.",
    ),
    assertion(
      "auto-profile-state-visible",
      autoProfile && typeof autoProfile === "object" &&
        (
          typeof autoProfile.enabled === "boolean" ||
          typeof autoProfile.active === "boolean" ||
          typeof autoProfileSettings.enabled === "boolean"
        ),
      "Traffic should expose whether auto-profile switching is enabled/active.",
    ),
    assertion(
      "harbour-boundary-state-visible",
      Boolean(
        boundary.name ||
        boundary.region ||
        boundary.inside != null ||
        autoProfile.harbourName ||
        autoProfile.regionName ||
        autoProfile.insideRegionName ||
        autoProfile.nearestRegionName ||
        autoProfileStatus ||
        policy.status,
      ),
      "Traffic should expose harbour/boundary status used to explain harbour/coastal transitions.",
    ),
    assertion(
      "stationary-automute-bound-to-profile",
      typeof policy.automuteStationary === "boolean" && typeof policy.automuteAllowed === "boolean",
      "Traffic audio policy should expose stationary automute setting and whether the current profile allows it.",
    ),
    assertion(
      "auto-profile-debounce-visible",
      autoProfile.enterDistanceMeters != null ||
        autoProfile.exitDistanceMeters != null ||
        autoProfileSettings.enterDistanceMeters != null ||
        autoProfileSettings.exitDistanceMeters != null ||
        autoProfile.enterDistance != null ||
        autoProfile.exitDistance != null ||
        autoProfile.refreshRegionsSeconds != null ||
        autoProfileSettings.refreshRegionsSeconds != null ||
        autoProfileStatus,
      "Traffic auto-profile status should expose a boundary threshold, refresh cadence, or reason.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: "traffic-harbour-profile-boundary",
    testId: "traffic-harbour-profile-boundary",
    result,
    startedAt,
    startedAtMs,
    assertions,
    observations: [{ profile, autoProfile, boundary, trafficAudioPolicy: trafficPolicySummary(policy) }],
    summary: result === "pass"
      ? "Traffic exposes harbour/profile boundary state clearly enough for BITE and debugging."
      : `Traffic harbour/profile boundary check failed: ${assertions.filter((item) => !item.pass).map((item) => item.id).join(", ")}.`,
    snapshot: { trafficProfile: traffic.profile, audioPolicy: trafficPolicySummary(policy), autoProfile, boundary },
  });
}

async function runTrafficSafetyMessageRetainedBite(app, { pluginId, testId, consoleVersion, timeoutMs }) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const systemMessage = "Marine built in tests low priority queue marker.";
  const target = {
    mmsi: SAFETY_RETENTION_TEST_TARGET_MMSI,
    name: SAFETY_RETENTION_TEST_TARGET_NAME,
    position: offsetPositionMeters(OWN_POSITION, { eastMeters: 220, northMeters: 0 }),
    speedMps: 5 * KNOTS_TO_MPS,
    courseRad: (3 * Math.PI) / 2,
    lengthMeters: 22,
    beamMeters: 6,
    aisClass: "A",
  };
  const own = {
    position: OWN_POSITION,
    speedMps: 5 * KNOTS_TO_MPS,
    courseRad: Math.PI / 2,
  };
  const observations = [];
  let lastRefreshAt = 0;
  let finalSnapshot = null;
  let evaluation = null;
  let publishError = "";
  try {
    try {
      publishBiteAudioSummary(app, { pluginId, runId, message: systemMessage });
    } catch (error) {
      publishError = error.message || String(error);
    }
    publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
    while (Date.now() - startedAtMs <= timeoutMs) {
      if (Date.now() - lastRefreshAt >= REFRESH_MS) {
        publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
        lastRefreshAt = Date.now();
      }
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficMessageScenarioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
        expectedPatterns: [/Collision alarm/i, /Risk of collision|Head-on|CPA/i],
        forbiddenPatterns: [],
        strict: true,
      });
      const safetyEvidence = findAudioEvidence(finalSnapshot.audio || {}, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
        strict: true,
      });
      if (evaluation.observation || safetyEvidence) {
        observations.push({
          ...(evaluation.observation || {}),
          safetyAudioState: safetyEvidence?.state || "",
          safetyAudioMessage: safetyEvidence?.message || "",
        });
      }
      if (evaluation.complete && safetyEvidence) break;
      await delay(POLL_MS);
    }
    if (!evaluation) {
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficMessageScenarioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
        expectedPatterns: [/Collision alarm/i, /Risk of collision|Head-on|CPA/i],
        forbiddenPatterns: [],
        strict: true,
      });
    }
  } finally {
    await clearSyntheticScenarioTarget(app, { pluginId, runId, target });
  }
  const safetyEvidence = findAudioEvidence(finalSnapshot?.audio || {}, {
    startedAtMs,
    targetName: target.name,
    targetMmsi: target.mmsi,
    strict: true,
  });
  const assertions = [
    assertion(
      "low-priority-marker-published",
      !publishError,
      publishError
        ? `Could not publish low-priority marker: ${publishError}`
        : "A lower-priority marker was queued before the safety scenario.",
    ),
    ...(evaluation?.assertions || []),
    assertion(
      "safety-audio-retained-after-marker",
      Boolean(safetyEvidence),
      safetyEvidence
        ? `Audio retained the safety message as ${safetyEvidence.state}: ${safetyEvidence.message}`
        : "Audio did not show retained/queued/rendered evidence for the safety message after a lower-priority marker.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: testId,
    testId,
    result,
    startedAt,
    startedAtMs,
    target: { mmsi: target.mmsi, name: target.name },
    assertions,
    observations: observations.slice(-12),
    summary: result === "pass"
      ? "Collision-level safety audio remained visible after lower-priority queue activity."
      : trafficScenarioFailureSummary("Traffic safety message retention check failed", { assertions }, finalSnapshot, target),
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
  });
}

async function runTrafficMessageScenarioBite(app, {
  pluginId,
  testId,
  consoleVersion,
  timeoutMs,
  target,
  own,
  expectedPatterns,
  forbiddenPatterns = [],
  expectedAudioPatterns = [],
  forbiddenAudioPatterns = [],
  passSummary,
  failSummary,
}) {
  const runId = randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const observations = [];
  let lastRefreshAt = 0;
  let finalSnapshot = null;
  let evaluation = null;
  try {
    publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
    while (Date.now() - startedAtMs <= timeoutMs) {
      if (Date.now() - lastRefreshAt >= REFRESH_MS) {
        publishSyntheticTrafficScenario(app, { pluginId, runId, target, own });
        lastRefreshAt = Date.now();
      }
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficMessageScenarioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
        expectedPatterns,
        forbiddenPatterns,
        expectedAudioPatterns,
        forbiddenAudioPatterns,
        strict: true,
      });
      if (evaluation.observation) observations.push(evaluation.observation);
      if (evaluation.complete) break;
      await delay(POLL_MS);
    }
    if (!evaluation) {
      finalSnapshot = collectSnapshot(app);
      evaluation = evaluateTrafficMessageScenarioSnapshot(finalSnapshot, {
        startedAtMs,
        targetName: target.name,
        targetMmsi: target.mmsi,
        expectedPatterns,
        forbiddenPatterns,
        expectedAudioPatterns,
        forbiddenAudioPatterns,
        strict: true,
      });
    }
  } finally {
    await clearSyntheticScenarioTarget(app, { pluginId, runId, target });
  }
  const result = evaluation?.result || "fail";
  return biteReport({
    consoleVersion,
    runId,
    scenario: testId,
    testId,
    result,
    startedAt,
    startedAtMs,
    target: {
      mmsi: target.mmsi,
      name: target.name,
    },
    assertions: evaluation?.assertions || [],
    observations: observations.slice(-12),
    summary: result === "pass"
      ? passSummary
      : trafficScenarioFailureSummary(failSummary, evaluation, finalSnapshot, target),
    snapshot: finalSnapshot ? summarizeSnapshot(finalSnapshot) : null,
  });
}

function trafficScenarioFailureSummary(prefix, evaluation, snapshot, target = {}) {
  const failed = (evaluation?.assertions || []).filter((item) => !item.pass);
  const failedIds = failed.map((item) => item.id).join(", ") || "unknown";
  const snapshotSummary = snapshot ? summarizeSnapshot(snapshot) : null;
  const targetLabel = target.name || target.mmsi || "scenario target";
  const primary = [];
  if (failed.some((item) => item.id === "traffic-alert")) primary.push("Traffic did not publish an alert/advisory for the target");
  if (failed.some((item) => item.id === "display-message")) primary.push("Display/Notifications did not receive a visual message");
  if (failed.some((item) => item.id === "audio-path-message")) primary.push("Notifications/Audio did not receive a spoken message");
  const diagnostic = primary.length
    ? primary.join("; ")
    : failed.slice(0, 2).map((item) => item.message).join(" ");
  const profileText = snapshotSummary
    ? ` Profile=${snapshotSummary.trafficProfile || "unknown"}, Traffic targets=${snapshotSummary.trafficTargets ?? "unknown"}, active alert states=${(snapshotSummary.trafficAlertStates || []).join(", ") || "none"}.`
    : "";
  return `${prefix}: ${diagnostic || "No detailed failure diagnostic was available"}. Target=${targetLabel}. Failed checks: ${failedIds}.${profileText}`;
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

function evaluateTrafficVisualAudioAlignment(snapshot, { startedAtMs, targetName, targetMmsi }) {
  const trafficAlert = findTrafficAlert(snapshot.traffic, targetName, targetMmsi);
  const displayEvidence = findDisplayAlertEvidence(snapshot.notifications, {
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
  const audioEvidence = findAudioEvidence(snapshot.audio || {}, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict: true,
  });
  const visualText = [
    trafficAlert?.encounter?.message,
    displayEvidence?.message,
  ].filter(Boolean).join(" | ");
  const audioText = [
    brokerEvidence?.message,
    audioEvidence?.message,
  ].filter(Boolean).join(" | ");
  const essentialPatterns = [
    /Close quarters|Risk of collision|CPA will be|CPA \d+/i,
    /\d+ (meters|miles) in \d+ (second|seconds|minute|minutes)/i,
  ];
  const assertions = [
    assertion(
      "traffic-alert",
      Boolean(trafficAlert),
      trafficAlert
        ? `Traffic published ${trafficAlert.encounter?.state} for ${trafficAlert.name}.`
        : "Traffic has not published a warn/alarm/emergency for the wording-alignment target.",
    ),
    assertion(
      "display-message",
      Boolean(displayEvidence),
      displayEvidence
        ? `Display-facing message found: ${displayEvidence.message}`
        : "Display-facing alert message was not found for the wording-alignment target.",
    ),
    assertion(
      "audio-path-message",
      Boolean(brokerEvidence || audioEvidence),
      brokerEvidence
        ? `Notifications audio message found: ${brokerEvidence.message}`
        : audioEvidence
          ? `Audio renderer message found: ${audioEvidence.message}`
          : "Audio path message was not found for the wording-alignment target.",
    ),
    ...essentialPatterns.map((pattern, index) =>
      assertion(
        `essential-visual-wording-${index + 1}`,
        pattern.test(visualText),
        pattern.test(visualText)
          ? `Visual path contains essential wording ${pattern}.`
          : `Visual path is missing essential wording ${pattern}: ${visualText || "no visual text"}.`,
      )
    ),
    ...essentialPatterns.map((pattern, index) =>
      assertion(
        `essential-audio-wording-${index + 1}`,
        pattern.test(audioText),
        pattern.test(audioText)
          ? `Audio path contains essential wording ${pattern}.`
          : `Audio path is missing essential wording ${pattern}: ${audioText || "no audio text"}.`,
      )
    ),
    assertion(
      "named-target-preserved",
      new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(visualText) &&
        new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(audioText),
      "Named targets should keep the same vessel name in visual and spoken wording.",
    ),
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return {
    complete: result === "pass" || Date.now() - startedAtMs >= DEFAULT_TIMEOUT_MS,
    result,
    assertions,
    observation: visualText || audioText
      ? {
          ts: new Date().toISOString(),
          visualText,
          audioText,
        }
      : null,
  };
}

function evaluateTrafficMessageScenarioSnapshot(snapshot, {
  startedAtMs,
  targetName,
  targetMmsi,
  expectedPatterns,
  forbiddenPatterns = [],
  expectedAudioPatterns = [],
  forbiddenAudioPatterns = [],
  strict = false,
}) {
  const trafficAlert = findTrafficAlert(snapshot.traffic, targetName, targetMmsi);
  const displayEvidence = findDisplayAlertEvidence(snapshot.notifications, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict,
  });
  let brokerEvidence = findBrokerAudioEvidence(snapshot.notificationsAudio, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict,
  });
  let audioEvidence = findAudioEvidence(snapshot.audio || {}, {
    startedAtMs,
    targetName,
    targetMmsi,
    strict,
  });
  if (!targetName && expectedAudioPatterns.length) {
    brokerEvidence = brokerEvidence || findBrokerAudioEvidenceByPatterns(snapshot.notificationsAudio, {
      startedAtMs,
      patterns: expectedAudioPatterns,
    });
    audioEvidence = audioEvidence || findAudioEvidenceByPatterns(snapshot.audio || {}, {
      startedAtMs,
      patterns: expectedAudioPatterns,
    });
  }
  const text = [
    trafficAlert?.encounter?.message,
    displayEvidence?.message,
    brokerEvidence?.message,
    audioEvidence?.message,
  ].filter(Boolean).join(" | ");
  const audioText = [
    brokerEvidence?.message,
    audioEvidence?.message,
  ].filter(Boolean).join(" | ");
  const expected = expectedPatterns.map((pattern, index) =>
    assertion(
      `expected-wording-${index + 1}`,
      pattern.test(text),
      pattern.test(text)
        ? `Found expected wording ${pattern}.`
        : `Expected wording ${pattern} was not found in: ${text || "no messages"}.`,
    )
  );
  const forbidden = forbiddenPatterns.map((pattern, index) =>
    assertion(
      `forbidden-wording-${index + 1}`,
      !pattern.test(text),
      pattern.test(text)
        ? `Forbidden wording ${pattern} was found in: ${text}.`
        : `Forbidden wording ${pattern} was not present.`,
    )
  );
  const expectedAudio = expectedAudioPatterns.map((pattern, index) =>
    assertion(
      `expected-audio-wording-${index + 1}`,
      pattern.test(audioText),
      pattern.test(audioText)
        ? `Found expected audio wording ${pattern}.`
        : `Expected audio wording ${pattern} was not found in: ${audioText || "no audio messages"}.`,
    )
  );
  const forbiddenAudio = forbiddenAudioPatterns.map((pattern, index) =>
    assertion(
      `forbidden-audio-wording-${index + 1}`,
      !pattern.test(audioText),
      pattern.test(audioText)
        ? `Forbidden audio wording ${pattern} was found in: ${audioText}.`
        : `Forbidden audio wording ${pattern} was not present.`,
    )
  );
  const assertions = [
    assertion(
      "traffic-alert",
      Boolean(trafficAlert),
      trafficAlert
        ? `Traffic published ${trafficAlert.encounter?.state} for ${trafficAlert.name}.`
        : "Traffic has not published a warn/alarm/emergency for the scenario target.",
    ),
    assertion(
      "display-message",
      Boolean(displayEvidence),
      displayEvidence
        ? `Display-facing message found: ${displayEvidence.message}`
        : "Display-facing alert message was not found for the scenario target.",
    ),
    assertion(
      "audio-path-message",
      Boolean(brokerEvidence || audioEvidence),
      brokerEvidence
        ? `Notifications audio message found: ${brokerEvidence.message}`
        : audioEvidence
          ? `Audio renderer message found: ${audioEvidence.message}`
          : "Audio path message was not found for the scenario target.",
    ),
    ...expected,
    ...forbidden,
    ...expectedAudio,
    ...forbiddenAudio,
  ];
  const result = assertions.every((item) => item.pass) ? "pass" : "fail";
  return {
    complete: result === "pass" || Date.now() - startedAtMs >= DEFAULT_TIMEOUT_MS,
    result,
    assertions,
    observation: trafficAlert || displayEvidence || brokerEvidence || audioEvidence
      ? {
          ts: new Date().toISOString(),
          trafficState: trafficAlert?.encounter?.state || "",
          message: text,
          audioMessage: audioText,
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
  hdop = 0.8,
  satellites = 12,
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
        { path: "navigation.gnss.horizontalDilution", value: includeGps ? hdop : null },
        { path: "navigation.gnss.satellites", value: includeGps ? satellites : 0 },
        { path: "environment.current.setTrue", value: currentSetValue },
        { path: "environment.current.drift", value: currentDriftValue },
        { path: "environment.tide.setTrue", value: currentSetValue },
        { path: "environment.tide.drift", value: currentDriftValue },
        { path: "plugins.ajrmMarineConsole.bite.deadReckoningExercise", value: { runId, phase, timestamp } },
      ],
    }],
  });
}

function publishSyntheticTrafficScenario(app, { pluginId, runId, target, own }) {
  const timestamp = new Date().toISOString();
  const sourceName = `ajrm-marine-bite-${runId}`;
  const ownCourse = Number.isFinite(Number(own?.courseRad)) ? Number(own.courseRad) : 0;
  const ownSpeed = Number.isFinite(Number(own?.speedMps)) ? Number(own.speedMps) : 0;
  const targetCourse = Number.isFinite(Number(target?.courseRad)) ? Number(target.courseRad) : 0;
  const targetSpeed = Number.isFinite(Number(target?.speedMps)) ? Number(target.speedMps) : 0;

  app.handleMessage(pluginId, {
    context: "vessels.self",
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        { path: "navigation.position", value: own?.position || OWN_POSITION },
        { path: "navigation.speedOverGround", value: ownSpeed },
        { path: "navigation.speedThroughWater", value: ownSpeed },
        { path: "navigation.courseOverGroundTrue", value: ownCourse },
        { path: "navigation.headingTrue", value: ownCourse },
        { path: "navigation.state", value: ownSpeed > 0.2 ? "underWay" : "stopped" },
      ],
    }],
  });
  app.handleMessage(pluginId, {
    context: `vessels.urn:mrn:imo:mmsi:${target.mmsi}`,
    updates: [{
      $source: sourceName,
      timestamp,
      values: [
        {
          path: "",
          value: {
            mmsi: target.mmsi,
            name: target.name,
          },
        },
        { path: "navigation.position", value: target.position },
        { path: "navigation.speedOverGround", value: targetSpeed },
        { path: "navigation.courseOverGroundTrue", value: targetCourse },
        { path: "navigation.state", value: targetSpeed > 0.2 ? "underWay" : "stopped" },
        { path: "design.length", value: { overall: target.lengthMeters || 18 } },
        { path: "design.beam", value: target.beamMeters || 5 },
        { path: "sensors.ais.class", value: target.aisClass || "B" },
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

async function clearSyntheticScenarioTarget(app, { pluginId, runId, target }) {
  const quietTarget = {
    ...target,
    position: offsetPositionMeters(OWN_POSITION, { eastMeters: 8000, northMeters: 8000 }),
    speedMps: 0,
    courseRad: 0,
  };
  const own = {
    position: OWN_POSITION,
    speedMps: 0,
    courseRad: 0,
  };
  for (let index = 0; index < 3; index += 1) {
    publishSyntheticTrafficScenario(app, { pluginId, runId, target: quietTarget, own });
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
    trafficAutoProfile: readSelfPath(app, WATCH_PATHS.trafficAutoProfile),
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
    return unwrapSignalKLeaf(value.value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => unwrapSignalKLeaf(item));
  }
  if (value && typeof value === "object" && !Object.prototype.hasOwnProperty.call(value, "contract")) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, unwrapSignalKLeaf(entry)]),
    );
  }
  return value === undefined ? null : value;
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

function findBrokerAudioEvidenceByPatterns(value, { startedAtMs, patterns }) {
  const candidates = flattenObjects(value);
  const freshTimestamp = candidates.some((candidate) =>
    freshEnough(candidateTimestamp(candidate), startedAtMs),
  );
  const match = candidates.find((candidate) => {
    const message = candidate?.message || candidate?.presentation?.message || candidate?.audioMessage || "";
    return (freshEnough(candidateTimestamp(candidate), startedAtMs) || freshTimestamp)
      && message
      && patterns.every((pattern) => pattern.test(message));
  });
  return match ? { ...match, message: match.message || match.presentation?.message || match.audioMessage || "" } : null;
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

function findAudioEvidenceByPatterns(audio, { startedAtMs, patterns }) {
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
      && /accepted|queued|audio-ready|rendered|speaker|skipped|muted|lastAnnouncement/i.test(state)
      && patterns.every((pattern) => pattern.test(message));
  });
  if (!match) return null;
  return {
    ...match,
    state: String(match.state || match.event || ""),
    suppressed: /skipped|muted/i.test(String(match.state || match.event || "")),
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
  return (targetName ? text.includes(targetName) : false)
    || (targetMmsi ? text.includes(targetMmsi) : false)
    || (allowBiteWildcard && /BITE TEST/i.test(text));
}

function matchesTarget(target, targetName, targetMmsi) {
  return (targetName ? String(target?.name || "").includes(targetName) : false)
    || (targetMmsi ? String(target?.mmsi || "") === targetMmsi : false)
    || (targetMmsi ? String(target?.id || "").includes(targetMmsi) : false);
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

function gpsUnavailable(state = {}) {
  const gps = state.gps || {};
  return state.trust === "lost" ||
    state.acceptedGps === false ||
    gps.fixValid === false ||
    (state.trust === "lost" && gps.fixValid == null && !validPosition(gps.position));
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
      gpsUnavailable(state) &&
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
    (Number.isFinite(Number(value.setTrue)) && Number.isFinite(Number(value.drift))) ||
    (Number.isFinite(Number(value.setTrueDegrees)) && Number.isFinite(Number(value.driftKnots)));
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
  return Math.max(5, Math.min(300, seconds)) * 1000;
}

function testTimeoutSeconds(test, runTimeoutSeconds) {
  const testSeconds = Number(test?.timeoutSeconds);
  const runSeconds = Number(runTimeoutSeconds);
  if (Number.isFinite(testSeconds) && Number.isFinite(runSeconds)) {
    return Math.max(testSeconds, runSeconds);
  }
  if (Number.isFinite(testSeconds)) return testSeconds;
  if (Number.isFinite(runSeconds)) return runSeconds;
  return DEFAULT_TIMEOUT_MS / 1000;
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
