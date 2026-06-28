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
- AJRM Marine Vessel Database
- AJRM Marine Capture
- AJRM Marine Snapshot

Optional suite apps are declared in `signalk.recommends`. Install them only when
you want those features:

- AJRM Marine Logger
- AJRM Marine Voyage Viewer
- AJRM Marine Simulator
- AJRM Marine GPS Integrity
- AJRM Marine DR Plotter
- AJRM Marine Instruments
- AJRM Marine Instrument Alerts
- AJRM Marine Harbour Editor
- AJRM Marine Pi Controller

Console lists every suite app on the Overview screen. Missing apps are greyed
out, while installed apps appear normally. Every installed AJRM Marine suite
webapp is selected for the tab bar by default; untick apps in the Console plugin
settings if you want a shorter operational toolbar.

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

If AJRM Marine Logger is useful while sailing, select the AJRM Marine Logger webapp in the
Console plugin configuration and it will appear as a normal tab. Console no
longer has separate incident-record buttons.

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
npm install git+https://github.com/ajrm-marine-suite/signalk-ajrm-marine-console.git#v0.5.9 --omit=dev --no-package-lock
sudo systemctl restart signalk
```

Open **Webapps → AJRM Marine Console**.

## Safety

> This software is Alpha Release and has not been tested in live environments
> and must not be relied upon for navigation or safety. The Authors do not
> accept any responsibility for loss or damage as a result of using this
> software.


## Public Beta

Suite entry point, navigation shell, and shared help for AJRM Marine
applications.

Development assistance: OpenAI Codex helped with code generation, refactoring, and automated testing during the beta development cycle.
