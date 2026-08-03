# AJRM Marine Suite

AJRM Marine Suite is installed through the Console package. Console is the
sailing-focused application shell for the AJRM Marine suite: it gives the
operational webapps one consistent navigation surface and carries the suite-level
help without merging their backend responsibilities.

In the Signal K AppStore this package is presented as **AJRM Marine Suite**. The
installed webapp remains the suite Console.

## Suite Dependencies

Installing this package through a Signal K server that supports AppStore
dependencies installs the mandatory suite apps declared in `signalk.requires`:

- AJRM Marine Display
- AJRM Marine Traffic
- AJRM Marine Notifications
- AJRM Marine Audio
- AJRM Marine Capture
- AJRM Marine Navigation Reference

Optional suite apps are declared in `signalk.recommends`. Install them only when
you want those features:

- Optional standard-path navigation conversion for third-party displays:
  SK Derived Data (`signalk-derived-data`)
- Voyage diagnostics: AJRM Marine Snapshot, Logger, and Voyage Viewer
- Navigation integrity: AJRM Marine GPS Integrity and DR Plotter
- Instruments: AJRM Marine Instruments and Instrument Alerts
- AJRM Marine Vessel Database
- AJRM Marine Alert Panel
- AJRM Marine Simulator
- AJRM Marine Harbour Editor
- AJRM Marine Pi Controller

Console lists every suite app on the Overview screen. Missing apps are greyed
out, while installed apps appear normally. Every installed AJRM Marine suite
webapp is selected for the tab bar by default; untick apps in the Console plugin
settings if you want a shorter operational toolbar.

Capture is required because BITE and support diagnostics use it to create
evidence bundles. Vessel Database is optional: the suite works without it, but
known names and dimensions improve display popups and spoken traffic wording.
Instrument Alerts is also optional and standalone because it reads standard
Signal K instrument paths, so it can be used with other instrument displays. DR
Plotter depends on GPS Integrity because GPS Integrity publishes the operational
and independent dead-reckoning state that DR Plotter renders.

## Navigation data setup

AJRM Marine Navigation Reference is the suite's navigation authority. It keeps
COG separate from bow heading, calculates magnetic variation locally with WMM,
converts a sensor's magnetic heading to true, expires stale values, and records
source/freshness/provenance. Traffic and GPS Integrity consume its versioned
projection rather than trusting whichever source happens to win a raw Signal K
path.

The default ground-track selection suits the current test boat, but compass
sources are deliberately opt-in:

- a coherent physical source supplying position, true COG, and SOG is selected
  as ground track; when several exist, same-source fix quality, satellites,
  HDOP, integrity, and receiver type are considered before arrival time;
- while no compass is available and the boat is moving, COG is exposed only as
  a labelled `track-proxy`;
- after the TP32's exact source ID is added under **Preferred
  magnetic-heading sources**, its magnetic heading becomes true bow heading by
  adding the locally calculated WMM variation;
- the default TP32/magnetic-compass uncertainty is 5 degrees;
- after its provenance and calibration are confirmed, a future NMEA 2000
  true-heading compass must be listed under both **Preferred direct true-heading
  sources** and **Verified independent true-heading sources** so it is selected
  and correctly marked independent;
- plugin/calculated values, including `derived-data`, are not treated as
  physical sensor evidence.

Use the Navigation Reference
`/plugins/signalk-ajrm-marine-navigation-reference/status` route to see the
recorded source IDs. On installations with multiple GNSS or compass devices,
copy the desired IDs into the preferred-source lists rather than relying on
arrival order.

On the current boat, the live TP32 source observed in the 16 July voyage is
`YDEN.4`. The 14 July capture used the older CAN-name form
`YDEN.cf5096ffe83083e8`. Add both exact IDs under **Preferred magnetic-heading
sources** before replaying both historical voyages. Keep the separate
GNSS-associated magnetic-heading independence list empty for this TP32: its
source publishes compass/autopilot data rather than GNSS motion.

### SK Derived Data compatibility

[SK Derived Data](https://github.com/SignalK/signalk-derived-data) remains useful
when non-AJRM instruments need standard `navigation.headingTrue` or
`navigation.magneticVariation` paths. AJRM Marine does not rely on those
calculated values, but the suite installer includes the plugin so those standard
paths remain available to other clients.

Install it from **Signal K Admin → App Store**, search for
`signalk-derived-data` or **SK Derived Data**, install it, and restart Signal K.
The command-line equivalent is:

```bash
cd ~/.signalk
npm install signalk-derived-data
sudo systemctl restart signalk
```

After installation, open **Server → Plugin Config → Derived Data** and use these
settings for the current boat:

| Derived Data calculation | Setting | Reason |
| --- | --- | --- |
| Magnetic Variation | **Enabled** | Publishes a maintained WMM value on the standard path for non-AJRM clients; AJRM also calculates its own WMM value. |
| True Heading | **Enabled** | Publishes true heading on the standard path while the TP32 supplies magnetic heading; AJRM converts its selected compass itself. |
| Magnetic Course Over Ground | **Disabled** | AJRM does not require magnetic COG. |
| True Course Over Ground | **Disabled** | Garmin/AIS already publishes direct `navigation.courseOverGroundTrue`. |
| Set and Drift | **Disabled** | It is not a sufficiently independent or source-qualified DR input, and the current calculation has a set-direction defect. |
| Estimated steer error and direction | **Disabled** | This is a Direct-To waypoint display aid, not heading, Traffic, or DR data. |

If another installation supplies only magnetic COG, enable **True Course Over
Ground** for standard-path consumers and leave **Magnetic Course Over Ground**
disabled. Do not enable both reciprocal COG conversions together. If a
calibrated compass later supplies direct true heading, prefer that source in
Navigation Reference and disable the redundant derived True Heading calculation.

Multiple sources for the same path must be resolved explicitly. In
[**Data → Source Priority**](https://github.com/SignalK/signalk-server/blob/master/docs/setup/source-priority.md),
add a **path-level override** for
`navigation.magneticVariation` and rank the `derived-data` WMM source above the
old GPS or chartplotter source. Do not make `derived-data` first for the whole
source group:

- keep the physical GPS/AIS source first for
  `navigation.courseOverGroundTrue`;
- when a direct true-heading compass is fitted, rank it above `derived-data` for
  `navigation.headingTrue`;
- use **Data → Browser → All sources** to confirm the alternatives, then
  **Priority filtered** to confirm the selected source;
- verify `navigation.magneticVariation.source` reports `WMM 2025` and
  `navigation.headingTrue` reports source `derived-data` while magnetic heading
  is present.

The green thumbs-up symbols in Derived Data mean only that an input path exists
and is non-null. They do not prove that its source, freshness, or accuracy is
suitable. Navigation Reference therefore makes its own source decision and
publishes the evidence behind it.

Version `0.5.4` shortens AJRM Marine suite app titles in the Console tab bar
while leaving third-party webapp names unchanged.

Version `0.3.15` adds the main Signal K administration screen as a built-in
second tab. Overview remains first; selected webapps follow after Signal K.

Version `0.3.13` lets forced announcements, including Sound Check and Repeat
Last, play through Console's root browser audio even when normal audio is muted.

Version `0.3.12` adds a root-window **Enable audio** control and reuses
AJRM Marine Audio's stored browser access token when polling Audio status. This
keeps Console browser playback working when Signal K protects plugin routes and
when Safari requires a gesture in the parent Console frame.

Version `0.3.11` moves browser announcement playback into the Console root
window. Console now honours AJRM Marine Audio's per-browser output mode even
when the Audio webapp is not selected as a Console tab, and all inactive webapp
iframes can be unloaded normally.

Version `0.3.10` kept the AJRM Marine Audio iframe alive when switching Console
tabs so browser playback was not interrupted. `v0.5.0` replaces that with the
root Console audio host.

Version `0.3.9` hardens the Console shell on iPad/Safari by anchoring the tab
bar in a fixed-height dynamic viewport and containing embedded webapp iframes
inside the workspace.

Version `0.3.8` removes the duplicated Overview version tiles. The Overview now
has one selected-webapp card grid, with each card showing its description,
package name, and version.

Version `0.3.7` removes the old transition configuration adapters. Console now
uses the dynamic webapp checkbox selection and tab-order settings as its only
configuration model. Overview always remains first, and no AJRM Marine webapp is
required to be installed.

The **Overview** shows the selected webapps with versions and provides the
extracted AJRM Marine onboard help as a full-width standalone view, without
loading the chart behind it.

Select AJRM Marine Capture in the Console plugin configuration to make voyage
recording and replay available as a normal tab. Console has no separate
incident-record buttons.

Version `0.2.1` provided the first compact single-line sailing toolbar for the
initial AJRM Marine suite apps.

## Configuration

Console scans installed packages with the `signalk-webapp` keyword. In the
plugin configuration, select the webapps that should appear as tabs and choose
their tab order. No AJRM Marine webapp is required; unavailable packages are simply
not listed. Overview is always first, Signal K is always second, and selected
webapps follow. Lower tab-order numbers appear earlier within the selected
webapp group; blank or duplicate values fall back to the normal discovered
order.

## Architecture

Console uses same-origin iframes. This keeps selected Signal K webapps isolated
while giving them one navigation surface.

Future native Console modules can replace embedded views incrementally. They
will consume the same AJRM Marine Traffic, Notifications and Audio contracts; they must
not duplicate safety or delivery policy.

## Install

```bash
cd ~/.signalk
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-console.git#v0.6.15 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Open **Webapps → AJRM Marine Console**.

## License and commercial use

This software is licensed under the GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later). You may use, study, share, and modify it under that licence. If you modify it and make it available to users over a network, the corresponding source code must also be made available under the AGPL.

Commercial licensing is available by arrangement for organisations that want different terms.

## Safety

> This software is Alpha Release and has not been tested in live environments
> and must not be relied upon for navigation or safety. The Authors do not
> accept any responsibility for loss or damage as a result of using this
> software.


## Public Beta

Suite entry point, navigation shell, and shared help for AJRM Marine
applications.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
