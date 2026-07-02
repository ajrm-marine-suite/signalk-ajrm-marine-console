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
