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

The Pi BITE runner should be a guarded command exposed from Console or a
dedicated internal script. It should:

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

