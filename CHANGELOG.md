# Changelog

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
