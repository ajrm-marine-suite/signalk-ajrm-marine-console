# AJRM Marine Built-In Test Equipment

AJRM Marine BITE is the planned suite-level safety test programme. Its purpose
is to catch end-to-end failures that individual plugin unit tests can miss,
especially failures where the visual alert path still works but the audible
skipper alert path has degraded.

## Core Safety Invariants

1. When Traffic publishes an active `warn`, `alarm`, or `emergency` collision
   notification and audio is not muted or target-silenced, Notifications must
   publish a fresh `plugins.ajrmMarineNotifications.audio` delivery event.
2. Audio must accept each fresh broker audio event for the same active collision
   subject when the provider event ID or broker request ID changes.
3. Ongoing active collision alarms must repeat audio according to the current
   Traffic profile's repeat sensitivity.
4. Visual alerts and audio alerts may diverge only for an explicit, recorded
   reason: manual mute, stationary automute, target silence, provider
   `delivery.audio: false`, expired audio, or unavailable audio output.
5. Any unavailable configured output, such as Piper, server speaker, browser
   playback, stream, or desktop player, must be visible in status/debug data.

## Stage 1: Portable Contract Tests

These tests run in GitHub CI and on development machines without a live Signal K
server:

- Traffic provider tests create deterministic collision projections and assert
  `method: ["visual", "sound"]`, `delivery.audio: true`, and repeat timing.
- Notifications broker tests ingest Traffic-shaped Signal K notifications and
  assert that first and repeated active collision alarms create audio delivery
  events.
- Audio tests ingest Notifications-shaped audio delivery projections and assert
  that repeated collision audio events for the same active subject are queued,
  while duplicate request IDs and duplicate provider event IDs are filtered.

## Stage 2: Pi Server BITE

The Pi BITE runner is exposed from Console:

```bash
curl -sk -X POST https://localhost:3443/plugins/signalk-ajrm-marine-console/bite/run \
  -H 'Content-Type: application/json' \
  -d '{"timeoutSeconds":45}'
```

The Console BITE tab groups tests by subsystem. Each group can be expanded or
collapsed, and its heading LED shows the worst state in that group: amber for
not run, blue for running, green when all enabled tests pass, red when any
enabled test fails, and grey when an optional plugin is not installed, not
enabled, or not visible to Console. The group run button uses the same safety
harness as Run all: it runs preflight first, disables Capture automatic
recording, starts a BITE Capture bundle, unmutes Traffic audio for the run,
runs only that group's enabled tests, finishes with the audible summary test,
stops Capture, and restores the prior Capture/Traffic audio settings.

Optional plugin tests live under their plugin heading, for example Harbour
Editor. This makes missing optional apps visible without turning the whole BITE
page into a flat list of disabled checks.

Every AJRM Marine plugin has at least one BITE entry. For some plugins that
entry is only an availability check: installed, enabled, visible to Console, and
with a webapp route. Required plugins also include their runtime/status evidence
where available. Deeper behaviour tests remain grouped by subsystem.

Run all starts with test `0`, which verifies the required AJRM Marine Suite
plugins are installed and operational before any synthetic data is injected. It
checks required package/webapp presence, core status projections, the Capture
API, simulator output state, and fresh live own-vessel data. If this preflight
fails, the run stops and Capture is not started.

The collision test publishes a short synthetic crossing encounter using the
temporary AIS target `BITE TEST TARGET` / MMSI `235912345`, then watches Traffic,
Display, Notifications, and Audio status/projection paths. At the end of the run
it publishes a quiet cleanup sample so the synthetic encounter clears from
Traffic.

The runner returns a machine-readable report with `pass`/`fail` assertions for:

- Required plugins being installed and publishing/available.
- Simulator output being stopped before the test.
- No fresh live own-vessel navigation or instrument feed being present.
- Core projection contract names, versions, sessions, sequence counters, and
  authority flags being recognisable.
- Traffic's authoritative mute/automute policy being visible to Audio without
  disagreement.
- Audio renderer dependencies and selected output paths being ready or
  explicitly reported unavailable.
- Notifications broker active/history/audio-sequence state being coherent.
- Capture and Traffic APIs exposing the control methods BITE needs for
  diagnostic recording and shared audio-policy restore.
- Audio status exposing queue/recent-event/output/dependency detail for delayed
  speech debugging.
- Notifications visual events carrying presentation, priority, delivery, and
  timestamp fields.
- Traffic publishing a `warn`, `alarm`, or `emergency` for the BITE target.
- Traffic target and audio-policy projections retaining identity, encounter,
  profile, mute/automute, and correlation fields.
- Display publishing its status projection, and the Display-facing visual alert
  projection containing the BITE target.
- Notifications publishing matching audio delivery.
- Audio accepting, queueing, rendering, skipping, or muting matching BITE audio.
- GPS Integrity retaining vector-role, counter, and current/last-trusted-current
  fields needed by DR Plotter and voyage review.
- Any mute condition being explicit rather than silent.
- A final spoken BITE summary being requested so the skipper can confirm the
  selected physical/browser/player output was actually heard.

Current numbered BITE tests:

| No. | Test | Requirement covered |
| --- | --- | --- |
| 0 | Required plugins and safety isolation | Required suite plugins installed/enabled; no live feed or simulator contamination before synthetic data. |
| 0.1 | Console availability | Console is present and exposing the BITE/webapp route. |
| 0.2 | Display availability | Required Display plugin is installed, enabled, visible to Console, and publishing runtime status. |
| 0.3 | Traffic availability | Required Traffic plugin is installed, enabled, visible to Console, and publishing runtime status. |
| 0.4 | Notifications availability | Required Notifications plugin is installed, enabled, visible to Console, and publishing runtime status. |
| 0.5 | Audio availability | Required Audio plugin is installed, enabled, visible to Console, and publishing runtime status. |
| 0.6 | Capture availability | Required Capture plugin is installed, enabled, visible to Console, and its Capture API is available. |
| 1.1 | Core status projections | Traffic, Display, Notifications, and Audio publish the observable state BITE needs. |
| 1.2 | Projection contracts | Core projections retain expected contracts, versioning, sessions, sequence counters, and authority markers. |
| 1.3 | Audio policy consistency | Traffic owns mute/automute policy and Audio consumes that policy without disagreement. |
| 1.4 | Audio renderer readiness | Piper/FFmpeg/rendering dependencies and output availability are explicit. |
| 1.5 | Notifications broker health | Broker active/history/audio sequence state is visible and bounded. |
| 1.6 | Stationary automute policy shape | Traffic audio policy exposes whether stationary automute is armed, allowed, and active. |
| 1.7 | Capture API contract | Capture exposes status, start, stop, and automatic-recording controls used to produce BITE diagnostic bundles. |
| 1.8 | Traffic API contract | Traffic exposes status and shared audio-policy control so BITE can unmute safely and restore the prior state. |
| 1.9 | Audio status detail contract | Audio exposes queue, recent-event, output, dependency, and mute-state detail for debugging delayed speech. |
| 1.10 | Notifications visual contract | Notifications active visual events carry presentation, delivery, priority, timestamp, and audio-sequence fields. |
| 2.1 | Collision visual/audio chain | Synthetic collision reaches Traffic, Display-facing visual alerts, Notifications audio delivery, and Audio acceptance. |
| 2.2 | Quiet target no-alert | Stopped/far-away synthetic target does not create a fresh visual or audible alert. |
| 2.3 | Traffic overtaking wording | A synthetic overtaking encounter must include overtaking and CPA-direction wording through the alert chain. |
| 2.4 | Traffic close-quarters wording | A synthetic close-quarters encounter must say close quarters through the visual/audio alert chain. |
| 2.5 | Traffic unnamed spoken name | An MMSI-only target must not have its MMSI read aloud as the vessel name. |
| 2.6 | Traffic head-on prompt | A synthetic head-on collision must say alter starboard and pass port-to-port. |
| 2.7 | Traffic give-way prompt | A synthetic starboard-bow collision must say Give Way. |
| 2.8 | Traffic stand-on prompt | A synthetic port-side collision must say Stand On. |
| 2.9 | Traffic target overtaking wording | A target overtaking own vessel from astern must say it is overtaking you. |
| 2.10 | Traffic same-course wording | A similar-course passing encounter must say same general course and give the CPA side. |
| 2.11 | Traffic target projection contract | Traffic target projections include identity, encounter state, profile, session, and sequence fields. |
| 2.12 | Traffic audio policy contract | Traffic's shared mute/automute policy carries voyage/profile/manual-override state explicitly. |
| 3.0 | GPS Integrity availability | Optional GPS Integrity plugin is installed, enabled, and visible to Console when present. |
| 3.0.1 | DR Plotter availability | Optional DR Plotter plugin is installed, enabled, and visible to Console when present. |
| 3.1 | GPS Integrity health | GPS Integrity publishes trust, fix, counters, and timestamp state coherently. |
| 3.2 | GPS lost age consistency | GPS-lost wording is checked against the freshest known GPS source timestamp. |
| 3.3 | GPS Integrity diagnostics contract | GPS Integrity publishes the diagnostic block Voyage Viewer uses for end-of-day review. |
| 3.4 | Dead reckoning projection | Operational and independent DR projections expose positions, uncertainty, ages, and vector roles. |
| 3.5 | DR GPS-loss exercise | GPS and current are removed, and operational DR must continue using retained current. |
| 3.6 | GPS recovery realigns DR | GPS restoration must lock operational DR back to the fresh GPS fix. |
| 3.7 | GPS jump rejection | An impossible GPS jump must be rejected without moving the trusted baseline. |
| 3.8 | GPS intermittent outage count | A continuous GPS outage must count once rather than once per missing update. |
| 3.9 | Docked no-DR-drift | Healthy stationary GPS with tide running must not let independent DR drift away. |
| 3.10 | GPS recovery fresh fix | A restored GPS fix must refresh trusted and received timestamps. |
| 3.11 | Lost-GPS retained current source | Lost-GPS DR must report retained-current/last-trusted-current rather than live GPS-derived current. |
| 3.12 | GPS explicit no-fix immediate | An explicit GNSS no-fix update must produce lost GPS without waiting for stale-position timeout. |
| 3.13 | GPS weak-signal detection | A weak GNSS sample must degrade GPS trust and increment the weak-signal counter. |
| 3.14 | GPS/DR vector arrow contract | GPS Integrity publishes recognisable single/double/triple vector-role metadata for DR Plotter. |
| 3.15 | GPS Integrity counter contract | GPS Integrity counters are present, non-negative, and internally plausible. |
| 3.16 | GPS/DR current contract | Live and retained current/set data are explicit enough for lost-GPS dead reckoning. |
| 9.1 | Vessel Database availability | Optional Vessel Database plugin is installed, enabled, and visible to Console when present. |
| 9.2 | Snapshot availability | Optional Snapshot plugin is installed, enabled, and visible to Console when present. |
| 9.3 | Logger availability | Optional Logger plugin is installed, enabled, and visible to Console when present. |
| 9.4 | Voyage Viewer availability | Optional Voyage Viewer plugin is installed, enabled, and visible to Console when present. |
| 9.5 | Simulator availability | Optional Simulator plugin is installed, enabled, and visible to Console when present. |
| 9.6 | Alert Panel availability | Optional Alert Panel plugin is installed, enabled, and visible to Console when present. |
| 9.7 | Instruments availability | Optional Instruments plugin is installed, enabled, and visible to Console when present. |
| 9.8 | Instrument Alerts availability | Optional Instrument Alerts plugin is installed, enabled, and visible to Console when present. |
| 9.9 | Harbour Editor availability | Optional Harbour Editor presence/status check when the plugin is installed. |
| 9.10 | Pi Controller availability | Optional Pi Controller plugin is installed, enabled, and visible to Console when present. |
| 99 | Audible summary output | Publishes a spoken BITE summary; the report confirms software request, while the skipper confirms sound was physically heard. |

Portable evaluator regression tests also cover stale audio evidence, broker-only
delivery before Audio catches up, missing Display-facing visual evidence, and
quiet-target false visual/audio leakage.

The next Pi BITE runner should use Simulator's GPX route-following mode for a
longer realistic voyage. It should:

1. Read and save current Traffic, Audio, Simulator, Capture, and Notifications
   settings.
2. Apply deterministic test settings:
   - Traffic profile `coastal`
   - audio unmuted
   - repeat sensitivity `100%`
   - simulator stopped, then deterministic own-vessel and target scenario
   - capture comment `BITE collision audio test`
3. Start Capture.
4. Start Simulator and create a near-collision target.
5. Watch Signal K paths:
   - `plugins.ajrmMarineTraffic.targets`
   - `notifications.collision.*`
   - `plugins.ajrmMarineNotifications`
   - `plugins.ajrmMarineNotifications.audio`
   - `plugins.ajrmMarineAudio`
   - `plugins.ajrmMarineTraffic.audioPolicy`
6. Assert within time limits:
   - a visual collision alarm appears
   - a first audio delivery event appears
   - Audio accepts/queues/renders it
   - a repeated collision audio event appears near the configured repeat
     interval
   - muted or degraded conditions are explicitly reported, not silent
7. Stop Simulator and Capture.
8. Restore saved settings.
9. Save the resulting voyage zip and a machine-readable BITE report.

## Stage 3: Soak BITE

The soak BITE should run longer scenarios to exercise:

- multiple simultaneous targets with advisory-to-alarm escalation
- target silence and unsilence
- stationary automute in harbour and anchor profiles
- manual mute and unmute
- GPS loss and recovery
- voyage capture file boundaries
- Logger replay at `1x`, `10x`, `20x`, and `Max`

The output should be compared as a semantic event stream, not by exact wall-clock
timestamps. CPA distances, TCPA wording, and event times may vary slightly; the
safety requirement is that required visual and audible events exist in the right
order with explicit reasons for any suppression.
