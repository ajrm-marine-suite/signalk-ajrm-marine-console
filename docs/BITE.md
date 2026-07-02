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

Run all starts with test `00`, which verifies the required AJRM Marine Suite
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
- Traffic publishing a `warn`, `alarm`, or `emergency` for the BITE target.
- Display publishing its status projection, and the Display-facing visual alert
  projection containing the BITE target.
- Notifications publishing matching audio delivery.
- Audio accepting, queueing, rendering, skipping, or muting matching BITE audio.
- Any mute condition being explicit rather than silent.
- A final spoken BITE summary being requested so the skipper can confirm the
  selected physical/browser/player output was actually heard.

Current numbered BITE tests:

| No. | Test | Requirement covered |
| --- | --- | --- |
| 00 | Required plugins and safety isolation | Required suite plugins installed/enabled; no live feed or simulator contamination before synthetic data. |
| 01 | Core status projections | Traffic, Display, Notifications, and Audio publish the observable state BITE needs. |
| 02 | Projection contracts | Core projections retain expected contracts, versioning, sessions, sequence counters, and authority markers. |
| 03 | Audio policy consistency | Traffic owns mute/automute policy and Audio consumes that policy without disagreement. |
| 04 | Audio renderer readiness | Piper/FFmpeg/rendering dependencies and output availability are explicit. |
| 05 | Notifications broker health | Broker active/history/audio sequence state is visible and bounded. |
| 06 | Collision visual/audio chain | Synthetic collision reaches Traffic, Display-facing visual alerts, Notifications audio delivery, and Audio acceptance. |
| 07 | Quiet target no-alert | Stopped/far-away synthetic target does not create a fresh visual or audible alert. |
| 08 | GPS Integrity health | GPS Integrity publishes trust, fix, counters, and timestamp state coherently. |
| 09 | GPS lost age consistency | GPS-lost wording is checked against the freshest known GPS source timestamp. |
| 10 | Dead reckoning projection | Operational and independent DR projections expose positions, uncertainty, ages, and vector roles. |
| 11 | DR GPS-loss exercise | GPS and current are removed, and operational DR must continue using retained current. |
| 12 | GPS recovery realigns DR | GPS restoration must lock operational DR back to the fresh GPS fix. |
| 13 | GPS jump rejection | An impossible GPS jump must be rejected without moving the trusted baseline. |
| 14 | GPS intermittent outage count | A continuous GPS outage must count once rather than once per missing update. |
| 15 | Docked no-DR-drift | Healthy stationary GPS with tide running must not let independent DR drift away. |
| 16 | GPS recovery fresh fix | A restored GPS fix must refresh trusted and received timestamps. |
| 17 | Lost-GPS retained current source | Lost-GPS DR must report retained-current/last-trusted-current rather than live GPS-derived current. |
| 18 | Stationary automute policy shape | Traffic audio policy exposes whether stationary automute is armed, allowed, and active. |
| 19 | GPS explicit no-fix immediate | An explicit GNSS no-fix update must produce lost GPS without waiting for stale-position timeout. |
| 20 | Traffic overtaking wording | A synthetic overtaking encounter must include overtaking and CPA-direction wording through the alert chain. |
| 21 | Traffic close-quarters wording | A synthetic close-quarters encounter must say close quarters through the visual/audio alert chain. |
| 22 | Traffic unnamed spoken name | An MMSI-only target must not have its MMSI read aloud as the vessel name. |
| 23 | Traffic head-on prompt | A synthetic head-on collision must say alter starboard and pass port-to-port. |
| 24 | Traffic give-way prompt | A synthetic starboard-bow collision must say Give Way. |
| 25 | Traffic stand-on prompt | A synthetic port-side collision must say Stand On. |
| 90 | Harbour Editor availability | Optional Harbour Editor presence/status check when the plugin is installed. |
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
