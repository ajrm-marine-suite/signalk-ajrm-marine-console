# Changelog

## 0.7.11

- Rewrite Onboard Help setup as a novice-friendly, ordered commissioning guide
  explaining what each step enables and how misconfiguration appears.
- Add corrective guidance for missing/stale input data, vessel identity,
  navigation-source selection, Derived Data loops and source priority, charts,
  Audio dependencies and outputs, and common BITE failures.
- Explain BITE's live/simulator isolation requirement, long-running safety
  checks, evidence voyage, physical audio confirmation, and essential manual
  checks that software cannot perform.

## 0.7.10

- Add a first-page Onboard Help setup guide covering the current core and
  optional suite packages, generic Signal K input sources, Navigation
  Integrity, recommended Derived Data settings, and Charts Provider Simple.
- Document Audio Player installation and the iPhone/iPad browser-audio,
  background, and lock-screen limitations.
- Point the Suite Overview to the setup guide and remove obsolete standalone
  package wording from current help and installation documentation.

## 0.7.9

- Replace boat-specific gateway source and Signal K hostname examples with
  vendor-neutral examples in the suite guide and onboard help.

## 0.7.8

- Fix the individual Notifications availability BITE check by reading the
  backend-only plugin's explicit `plugins.ajrmMarineNotifications` status
  projection instead of looking for a removed webapp route.
- Add direct regression coverage for the backend-only Notifications
  availability result.

## 0.7.7

- Fix BITE group 0 discovery of the backend-only Notifications plugin. BITE now
  verifies Notifications through its live Signal K status projection instead
  of incorrectly requiring a webapp menu entry and route.

## 0.7.6

- Include Navigation Integrity in the Voyaging top-menu workspace so GNSS
  health, dead reckoning, and DR Plotter remain one tap away underway.

## 0.7.5

- Treat Capture review, GPS Integrity's DR Plotter, and Instruments alerts as
  capabilities of their combined packages throughout Console and BITE.
- Remove the retired standalone Voyage Viewer, DR Plotter, Instrument Alerts,
  Navigation Reference, Logger, and Alerts packages from Console discovery,
  recommendations, workspace profiles, and availability checks.

## 0.7.1

- Stop presenting Notifications as a separate Console webapp. Notifications
  0.7.0 is a backend authority; Console Alerts and BITE provide its operator and
  diagnostic views.

## 0.7.0

- Absorb the former AJRM Marine Alert Panel as Console's built-in read-only
  Alerts view and remove the separate package from suite recommendations.
- Keep Notifications as the independent alert authority and Audio as the only
  speech/delivery component.
- Add Console settings for Alerts refresh and recent-activity retention.
- Hide an installed legacy Alert Panel package to prevent duplicate tabs.

## 0.6.23

- Remove three unreachable standalone Logger BITE implementations and their
  obsolete in-process API registry.
- Update Capture contract BITE to validate canonical input and replay directly,
  without requiring the removed `captureFileMode` compatibility field.
- Remove Logger from current Pi Controller telemetry wording while continuing
  to hide an accidentally installed retirement marker from Console tabs.

## 0.6.22

- Refresh onboard Help and BITE documentation for Capture-led recording and
  replay, shared chart-folder controls, chart cycling, and map-icon tooltips.

## 0.6.21

- Add two deterministic timestamped comments to every BITE voyage: one after
  Capture starts and one immediately before finalisation.
- Make a missing or failed BITE comment fail the run rather than silently
  producing incomplete voyage-review evidence.
- Extend the completed-bundle round-trip check to require Voyage Viewer to
  expose both comments from the final ZIP.

## 0.6.20

- Keep each BITE heading expanded until all of its enabled child tests have
  completed, including the setup transition between the two safety checks.
- Run BITE children in their visible group order so heading 0 completes before
  Required Plugins begins.
- Expand Capture BITE coverage for canonical replay, route recording, and
  durable portable downloads; add Display route/Capture continuity checks.
- Add derived pilot-helm/XTE and Instrument Alerts XTE contract checks, richer
  Vessel Database maintenance evidence, and a post-finalisation Voyage Viewer
  round-trip of the completed BITE ZIP.
- Retire obsolete Logger tests and documentation now that recording and replay
  are owned by Capture.

## 0.6.19

- Update BITE 7.2 for Voyage Viewer 0.6.9's explicit voyage-only review
  contract.
- Stop requiring the retired raw-log and clip directories while still checking
  that legacy multi-source Viewer releases describe those sources coherently.

## 0.6.18

- Add a persistent Overview selector for Setup, Voyaging, Reviewing,
  Debugging, and Show All Plugins views.
- Filter only the top Console menu; plugin installation, enablement, and
  background operation are unchanged.
- Keep Overview available in every view and expand to Show All when a hidden
  plugin is deliberately opened from its Overview card.

## 0.6.17

- Add a synthetic SAR helicopter BITE encounter using reserved test MMSI
  `111000599`.
- Require Traffic to classify it as an ITU SAR helicopter, keep it visible,
  and publish no collision candidate, CPA/TCPA, visual alert, or audio alert.
- Publish the test target without fictional vessel dimensions or AIS A/B class.

## 0.6.16

- Give the same-course Traffic BITE scenario a longer, wider passing geometry
  so it remains in the intended side-CPA wording branch instead of collapsing
  into close quarters before Traffic's alert chain settles.
- Add regression coverage for the scenario's separation, speed, and course
  relationship.

## 0.6.15

- Require the dead-reckoning loss and GPS-recovery BITE exercises to observe
  their newly injected trusted GPS/current baseline before withdrawing GPS.
- Keep the DR exercise Navigation Reference override alive for the complete
  exercise so replay data cannot resume midway through a slow assertion.
- Add regression coverage for stale accepted GPS and retained YDEN current
  state captured during a live Run All sequence.

## 0.6.14

- Add a prominent onboard Help warning that avoidance prompts are limited
  indications rather than COLREG advice, identify missing situational inputs
  such as sailing versus motoring, and retain skipper responsibility.

## 0.6.13

- Correlate Traffic safety-message retention evidence with Audio's explicit
  subject/MMSI identity rather than requiring the spoken message to contain a
  vessel name or MMSI.
- Inspect queued, active, preparing, prepared, and rendered Audio evidence so
  slow Piper output cannot create a false BITE failure.
- Clear synthetic BITE target contexts with a single root null update, avoiding
  Signal K metadata errors from nulling scalar identity fields individually.

## 0.6.12

- Remove the retired Logger from the default app catalogue, package
  recommendations, and BITE catalogue.
- Keep Capture as the single voyage recording and replay application.

## 0.6.11

- Allow the Traffic all-clear lifecycle BITE to wait through Traffic's new
  one-minute advisory/clear stability hold before deciding that clearance
  failed.

## 0.6.10

- Clear every reserved synthetic Traffic vessel after each Traffic BITE and
  again before finalising a Run All capture.
- Clear BITE own-vessel navigation and DR sources, the temporary heading
  reference override, and active synthetic Traffic notifications.
- Use an ordinary reserved vessel MMSI for the stationary-target test so it
  cannot be classified as an AIS emergency identity.

## 0.6.9

- Exercise Traffic all-clear with an ordinary vessel MMSI rather than an AIS
  special-safety identity that remains permanently emergency.
- Keep the cleared target safely normal but still visible during the 15-second
  clearance grace, so target loss cannot be mistaken for confirmed clearance.
- Require the initial encounter to reach alarm or emergency, matching Traffic's
  qualified all-clear policy.

## 0.6.8

- Recognise Signal K's standard `warn` state when the Traffic all-clear BITE
  waits for its initial collision risk, so advisory-level profile settings
  proceed into the clearance phase.

## 0.6.7

- Treat GPS-loss age and operational dead reckoning as inapplicable when the
  receiver has never supplied a trusted position, rather than requiring BITE
  to invent a timestamp or DR origin.

## 0.6.6

- Include explicit GNSS fix status and source-quality evidence in synthetic
  Navigation Reference exercises, so no-fix, weak-signal, satellite-count, and
  HDOP checks survive the provider boundary.

## 0.6.5

- Use Navigation Reference's bounded in-process BITE override for synthetic
  heading, coherent GNSS, and independent-current contracts, preventing the
  normal 50 ms source recalculation from replacing test evidence before
  Traffic or GPS Integrity evaluates it.
- Clear the override after every Traffic or GPS exercise so live source
  selection resumes immediately and no synthetic reference is persisted.

## 0.6.4

- Give Traffic wording scenarios an explicit temporary Navigation Reference
  heading contract, so heading-dependent overtaking, passing-side, and COLREG
  wording is exercised even when the synthetic BITE source is not configured
  as a real compass.
- Give dead-reckoning exercises a coherent Navigation Reference GNSS triplet
  and qualified independent-current evidence, so GPS-loss and recovery tests
  exercise the current source-aware GPS Integrity contract.

## 0.6.3

- Recognise Navigation Reference as a backend-only required plugin through its
  live runtime projection instead of incorrectly requiring a webapp entry.
- Report a missing Navigation Reference projection as disabled/not publishing,
  rather than claiming the installed package is absent.

## 0.6.2

- Extend live BITE coverage for stationary-vessel wording and the qualified
  collision all-clear lifecycle, including removal from Display Active Alerts.
- Verify Display's active-only alert-panel projection, Capture voyage
  observations, Logger replay-cache limits, Traffic AIS class/nullable ROT
  fields, and depth-callout expiry diagnostics.
- Document the browser-local appearance and focus/speech checks that remain
  manual after installation.
- Preserve Console's fuller onboard help when Display supplies only its compact
  local help reference during packaging.

## 0.6.1

- Make AJRM Marine Navigation Reference a required suite component and document
  its source-priority, heading, magnetic-model, current, and leeway contract.
- Recommend SK Derived Data as a maintained compatibility layer while keeping
  Navigation Reference authoritative for AJRM apps.
- Document the Derived Data settings that should be enabled and the COG,
  set/drift, and steer-error derivations that should remain disabled to avoid
  circular or duplicated navigation calculations.

## 0.5.124

- Move all BITE scenario targets to the same far-away cleared position as the
  generic and quiet targets, so Display's target list is not left cluttered by
  neutralised scenario vessels after BITE completes.

## 0.5.123

- Make BITE's Snapshot contract verify browser support-snapshot readiness, so
  runs fail clearly when Snapshot's remote/browser access option is disabled.

## 0.5.122

- Move BITE synthetic collision and quiet targets well out of operational range
  during cleanup, instead of leaving them at the old fixed quiet-test position
  where a later simulator run could turn them into real Traffic advisories.
- Use a short dedicated cleanup repeat interval so proper target cleanup does
  not slow down BITE runs.

## 0.5.121

- Use stable Signal K `$source` names for BITE synthetic navigation and
  dead-reckoning samples, so repeated BITE runs do not accumulate per-run
  sources in Signal K Source Priority groups.

## 0.5.120

- Keep BITE run-all Traffic/audio settings active through the final audio
  summary instead of restoring per-scenario Harbour/auto-profile settings
  between deterministic traffic wording scenarios.
- Add regression coverage so traffic scenarios do not re-enable Harbour
  stationary automute while a BITE settings snapshot is active.

## 0.5.119

- Correct the BITE Traffic close-quarters and advisory no-action scenario
  geometry after the near/far targets were accidentally swapped.
- Add regression coverage for the published synthetic target offsets so canned
  test messages cannot hide a future geometry swap.

## 0.5.118

- Make the final BITE audio summary wait for rendered/playable Audio evidence
  again, so queued-only progress cannot pass before the desktop player has a
  chance to receive the completion message.

## 0.5.117

- Restore the BITE advisory no-action-prompt target to coastal advisory range
  so it remains a warning-level advisory rather than a collision alarm.

## 0.5.116

- Make BITE synthetic traffic wording scenarios force the deterministic coastal
  Traffic profile and restore the previous profile/auto-profile settings after
  each scenario, so reruns are not affected by harbour state from earlier tests.
- Let the final BITE audio summary accept fresh queued/accepted Audio progress
  events while the renderer is still catching up.

## 0.5.115

- Rename Console BITE Audio policy checks from legacy Engine wording to Traffic
  wording.
- Make GPS weak-signal BITE checks use explicit diagnostics instead of parsing
  reason text.

## 0.5.114

- Tighten stationary automute BITE checks to rely on explicit Traffic audio
  policy booleans instead of interpreting policy status text.

## 0.5.113

- Fix Console Help's CPA table to treat profile CPA thresholds as metres,
  matching Traffic and Display's explicit profile-threshold contract.

## 0.5.112

- Extend BITE Instrument Alerts checks to require the Anchor dropped to Traffic
  Anchor-profile bridge.
- Extend the stationary automute BITE check to verify Anchor and Harbour
  automute are enabled while Coastal and Offshore remain disabled.

## 0.5.111

- Treat cleared/null current and tide values as unavailable in BITE current
  drift checks instead of throwing during the background run.

## 0.5.110

- Make the GPS recovery BITE exercise wait for a non-zero trusted current before
  removing GPS, so the retained-current DR drift check is not satisfied by a
  zero-current baseline race.

## 0.5.109

- Update BITE head-on prompt expectations for Traffic's spoken full-stop pause:
  `Head-on. Alter starboard, pass port-to-port`.

## 0.5.108

- Add a BITE Audio output-routing check that explicitly exercises Desktop
  Player, server speaker, radio stream, public stream, and all-routes-off
  states.
- Include Desktop Player output in the Audio status-detail contract check.

## 0.5.107

- Prefer Audio's explicit `desktopPlayerOutput` status field in BITE renderer
  readiness checks, while retaining compatibility with older Audio versions.

## 0.5.105

- Add BITE checks for Capture active-voyage metadata, bundled BITE report shape,
  and Audio diagnostic history so voyage downloads are easier to review offline.
- Add optional BITE contract checks for Logger capture-recording state and Voyage
  Viewer review capability.
- Add a GPS Integrity voyage-review readiness check covering diagnostics,
  counters, DR summaries, thresholds, and current-source evidence.

## 0.5.104

- Make the BITE live-progress poller self-healing: each status response schedules
  the next poll while the server still reports a run in progress, avoids
  overlapping status requests, and refreshes immediately when the browser window
  becomes visible again.
- Keep polling alive after transient status errors during a local BITE run, so
  LEDs do not freeze until a manual refresh.

## 0.5.103

- Start BITE Run all/group checks as server-side background jobs and drive the
  page from `/bite/status`, so browser sleep, refresh, or a long-lived POST
  cannot freeze the LED progress display mid-run.
- Mark live BITE progress explicitly as running in the status payload and make
  the frontend treat server running state as authoritative.

## 0.5.102

- Keep the completed BITE Run all/group results visible across browser refresh
  and screen lock/unlock while Signal K remains running.
- Leave BITE lights reset to amber after a Signal K/server restart.
- Retain more in-memory BITE report history so the status API matches the
  fuller voyage bundle evidence.

## 0.5.101

- Keep each BITE test's own timeout during Run all and group runs, so long
  checks such as the final audible summary are not shortened by the run-level
  timeout.
- Raise the BITE harness timeout ceiling to allow slower Pi audio rendering to
  complete before the final audible-summary check is failed.

## 0.5.100

- Extend the final BITE audible summary freshness window so it does not expire
  while waiting behind generated safety announcements.
- Raise the BITE summary to a mid-level priority that remains below collision
  alarms but no longer sits behind ordinary housekeeping speech.

## 0.5.62

- Correct the Docked no-DR-drift BITE assertion to compare independent DR
  movement during the docked interval, not any pre-existing offset from GPS.

## 0.5.61

- Expand BITE GPS/DR coverage with active tests for GPS recovery realigning DR,
  impossible GPS jump rejection, continuous outage counting, and stationary
  healthy GPS suppressing tide-only independent DR drift.

## 0.5.60

- Add an active BITE dead-reckoning GPS-loss exercise that injects a trusted
  GPS/current baseline, removes GPS and live current, and checks operational DR
  moves using the retained current vector.

## 0.5.53

- During BITE Run all, pause Capture automatic recording, manually start the
  BITE capture, wait briefly before injecting test traffic, then stop Capture
  and restore the previous automatic-recording setting.
- Temporarily unmute AJRM Marine Traffic audio during BITE Run all and restore
  the skipper's previous mute state after the test.

## 0.5.52

- Raise the final BITE audible summary priority so it is spoken promptly after
  the current announcement, without interrupting speech already in progress.

## 0.5.51

- Give the final BITE audible summary longer to render before marking the
  output test red.
- Include Audio's current timeline state and queue length in the BITE report
  when the audible summary has not yet completed.

## 0.5.50

- Keep the BITE report textarea scrolled to the latest message while tests are
  running and when final reports/errors are written.

## 0.5.49

- Make optional BITE plugin wording conservative: missing optional status now
  says the plugin may be absent, disabled, still starting, or too old, rather
  than implying Console can always distinguish those cases.

## 0.5.48

- Read the optional Harbour Editor BITE status from the Signal K path
  `plugins.ajrmMarineHarbourEditor`, rather than a plugin-local app property
  that Console cannot see.

## 0.5.47

- Update the BITE report box while Run all is in progress so it shows the
  current test, capture state, and completed child test results instead of
  leaving the initial pre-test message on screen.

## 0.5.46

- Move BITE `Audible summary output` to test `99` and always run it last,
  after optional plugin checks.
- Tighten the audible summary check so it waits for rendered/completed Audio
  evidence instead of passing as soon as speaker playback starts.

## 0.5.45

- Reset BITE traffic lights to amber on a fresh page load or server restart
  instead of restoring old pass/fail lamps from stored reports.
- Keep previous BITE reports available as text/evidence without using them as
  current test results.

## 0.5.44

- Enhance the optional Harbour Editor BITE check to verify the Harbour Editor
  status contract when the optional plugin is installed.

## 0.5.43

- Add optional BITE test support: optional checks remain visible in the
  dashboard but are disabled and skipped by Run all when the matching plugin is
  not installed.
- Add an optional Harbour Editor availability check that verifies the plugin is
  visible to Console and has a webapp route.

## 0.5.42

- Send the final BITE audible summary as a forced test announcement so it
  bypasses Traffic stationary automute, matching Sound Check behaviour.
- Treat Traffic mute as expected during the final BITE audio test when the
  forced summary path is being exercised.

## 0.5.41

- Track the active individual BITE test in the Console frontend so pressing a
  single `Run` button only turns that test blue.

## 0.5.40

- Poll BITE run progress while `Run all tests` is active so each traffic light
  updates as its test completes instead of waiting for the final response.
- Keep the final BITE audio test running until Audio reports the spoken summary
  has rendered/completed, so its light does not go green merely because the
  request was queued.
- Raise the final BITE spoken summary above routine system announcements while
  keeping it non-preempting, so it plays promptly after any active safety alarm
  finishes.

## 0.5.39

- Make the Console workspace and BITE dashboard use bounded internal scrolling
  so the expanded BITE test list remains reachable on smaller screens.
- Update Console frontend cache-busting query strings for the release.

## 0.5.38

- Change the spoken BITE summary wording to say "Marine built in tests" so
  Piper does not try to pronounce AJRM as a word.

## 0.5.37

- Add final BITE test `08 Audible summary output`, which publishes a spoken
  pass/fail summary so the skipper can confirm the selected physical audio
  output was actually heard.
- Mark the audible summary check as software-published plus human-hearing
  verification, and fail it if Audio is muted.

## 0.5.36

- Expand Console BITE Run all from four to eight visible tests, adding
  projection-contract, audio-policy, renderer-readiness, and Notifications
  broker-health checks before the synthetic collision tests.
- Add CI regression checks for stale audio evidence, broker-only delivery,
  missing Display-facing visual evidence, and quiet-target false alert leakage.
- Document the BITE requirements coverage matrix so future tests can be mapped
  back to safety requirements.

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
