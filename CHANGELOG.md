# Changelog

## 0.5.35

- Extend BITE test `00` to verify required AJRM Marine Suite plugins are
  installed and operational before any synthetic traffic is injected.
- Stop BITE Run all with a concrete missing/disabled plugin reason when a
  required suite component is absent or not publishing the expected status/API.

## 0.5.34

- Make AJRM Marine Capture a required suite dependency because BITE and support
  diagnostics rely on it to create evidence bundles.
- Show Capture as a Core suite app in the Console catalogue.

## 0.5.33

- Make BITE Run all preflight failures explain the concrete blocker, for
  example `AJRM Marine Simulator output is ON` or the exact fresh own-vessel
  Signal K paths/sources that indicate a live feed.
- Show failed child-test assertions and live-feed observations directly in the
  BITE dashboard Run all report instead of requiring the raw JSON snapshot.

## 0.5.32

- Fix BITE collision audio evaluation when audio is muted: Audio can briefly
  publish an `accepted` timeline event before the queue records the real
  `skipped: Muted...` evidence. BITE now prefers skipped/muted evidence when
  mute policy is active.
- Wait for synthetic collision target cleanup to propagate before ending the
  BITE collision test, reducing misleading post-test `BITE TEST TARGET QUIET`
  alert residue in Capture bundles.

## 0.5.31

- Add BITE test `01 Core status projections` to confirm Traffic, Display,
  Notifications, and Audio are publishing the status paths the harness needs.
- Keep the collision test as `02 Collision visual/audio chain`.
- Add BITE test `03 Quiet target no-alert` to confirm a stopped/far-away
  synthetic target does not create a fresh visual or audible alert.
- Tighten BITE no-alert matching so negative tests require the exact synthetic
  target rather than the broader BITE collision phrase matcher.

## 0.5.30

- Add BITE test `00 Pre-test safety isolation`, which checks for active
  simulator output or fresh live own-vessel navigation/instrument data before
  test data is injected.
- Make Run all execute test 00 before starting Capture; if it fails, Run all is
  blocked and no synthetic encounter test is run.
- Remember the latest current-version report for each BITE test so the
  dashboard keeps green/red test status across page refreshes until the next
  software update resets tests to amber.

## 0.5.29

- Move the BITE dashboard from the Overview screen into its own native Console
  tab placed immediately after Overview and before Signal K.

## 0.5.28

- Persist each child BITE report before stopping Capture during Run all, so the
  voyage zip includes the current run's test evidence rather than only earlier
  reports.

## 0.5.27

- Make Run all BITE tests start AJRM Marine Capture first, run the numbered
  tests server-side, then stop Capture so the voyage/debug bundle includes the
  BITE JSON reports.

## 0.5.26

- Update the Console web asset cache-buster after the BITE dashboard failure
  handling change, so browsers load the corrected script immediately after
  install.

## 0.5.25

- Return completed BITE failures as normal JSON reports instead of HTTP 500
  transport errors, so the Console dashboard can show a red test with the real
  assertion details. The browser also preserves report bodies from older
  servers that still returned failed reports with non-200 status codes.

## 0.5.24

- Add a BITE dashboard to the Console overview with numbered tests, amber
  not-run state, green pass/red fail traffic lights, per-test run buttons, a
  run-all button, and a detailed report panel.
- Persist BITE reports as JSON under the Console plugin data directory so
  voyage/debug bundles can include them for offline analysis. Reports from an
  older Console version remain archived but do not count as current pass/fail
  status after a software update.

## 0.5.23

- Clean up the Display-facing BITE assertion text so successful reports show
  the matched priority level and collision message rather than raw nested
  projection fields.

## 0.5.22

- Make the Display-facing BITE assertion recognise Notifications priority
  levels such as `danger`, and avoid false failures when the current audio
  delivery projection has already advanced but Audio has recorded matching
  accepted/rendered evidence.

## 0.5.21

- Extend Console BITE to verify the Display-facing visual alert path as well
  as Traffic, Notifications, and Audio. The report now checks that Display is
  publishing status and that the Notifications visual projection contains the
  BITE collision event.

## 0.5.20

- Correct BITE report wording so the Traffic assertion and observations show
  the target encounter state, such as `alarm`, rather than `undefined`.

## 0.5.19

- Unwrap Signal K leaf values when BITE reads watched paths with `getSelfPath`,
  so the report evaluates real Traffic, Notifications, and Audio projections
  instead of the surrounding `{ value, timestamp }` wrapper.

## 0.5.18

- Publish BITE synthetic vessel deltas using Signal K `$source` and root vessel
  static data, matching the simulator's delta shape so Traffic can ingest the
  temporary target.

## 0.5.17

- Fix the first BITE collision scenario to use a collision-capable vessel MMSI
  instead of the reserved AIS AtoN `99...` range, and include watched-path
  presence in failed BITE reports.

## 0.5.16

- Add first Console BITE routes: `GET /bite/status` and `POST /bite/run`.
  The initial guarded scenario publishes a temporary crossing target, verifies
  the Traffic -> Notifications -> Audio safety chain, then publishes a quiet
  cleanup sample.

## 0.5.15

- Make the Console browser-audio host consume Audio's recent-announcements
  list in order, so rapid traffic advisories and collision alarms are not
  hidden by a later profile announcement between status polls.

## 0.5.14

- Back off Console-hosted browser audio status polling after Audio
  authentication failures so stale or unauthenticated Console views do not
  produce repeated Audio status 401s.

## 0.5.13

- Rename the optional suite catalogue entry from Alerts to Alert Panel.

## 0.5.12

- Reduce the Console AppStore dependency core to Display, Traffic,
  Notifications, and Audio.
- Move Vessel Database, voyage diagnostics, GPS/DR, instruments, simulator, and
  Pi support apps into optional recommended groups shown on the Overview screen.
- Add AJRM Marine Alert Panel to the advertised optional suite catalogue.

## 0.5.11

- Rename the Overview eyebrow from "Current watch" to "Suite overview" for
  public-facing screenshots.

## 0.5.10

- Improve shared help geometry diagrams with explicit high-contrast SVG labels
  and dark label plates so sector wording remains readable on dark panels.

## 0.5.9

- Show every AJRM Marine app on the Overview screen, with missing apps greyed
  out as downloadable suite capabilities.
- Select every installed AJRM Marine suite webapp for the tab bar by default,
  including optional apps that the user has chosen to install.

## 0.5.8

- Present Console as the AJRM Marine Suite AppStore entry point.
- Declare mandatory suite apps with `signalk.requires` and optional apps with
  `signalk.recommends`.
- Select mandatory suite webapps by default.

## 0.5.7

- Update public install command to the current release tag.

## 0.5.6

- Rename Console status contracts and help CSS namespaces to AJRM Marine naming.

## 0.5.5

- Remove obsolete suite-name fallback matching from the Console audio tab detection.

## 0.5.4

- Shorten AJRM Marine suite app titles in the Console tab bar while leaving
  third-party webapp names unchanged.

## 0.5.3

- Remove obsolete profile-range rows from the shared help/settings summary.

## 0.5.2

- Prefer the authenticated Signal K audio route for Console-hosted browser playback.

## 0.5.1

- Prime Console-hosted browser audio with a silent clip during the Enable audio tap, so Piper playback is actually unlocked in browsers that require a user gesture.
- Refresh web asset cache keys for the public beta package version.

## 0.5.0

- Initial public beta release as AJRM Marine Console.
