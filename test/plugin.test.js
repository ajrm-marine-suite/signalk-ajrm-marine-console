"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const createPlugin = require("../plugin");
const { schemaFor } = require("../plugin");
const packageInfo = require("../package.json");

test("Console package is the AJRM Marine Suite AppStore entry point", () => {
  assert.equal(packageInfo.signalk.displayName, "AJRM Marine Suite");
  assert.deepEqual(packageInfo.signalk.requires, [
    "signalk-ajrm-marine-display",
    "signalk-ajrm-marine-traffic",
    "signalk-ajrm-marine-notifications",
    "signalk-ajrm-marine-audio",
  ]);
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-vessel-database"));
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-capture"));
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-snapshot"));
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-alerts"));
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-gps-integrity"));
  assert.ok(packageInfo.signalk.recommends.includes("signalk-ajrm-marine-harbour-editor"));
  assert.ok(!packageInfo.signalk.requires.includes(packageInfo.name));
  assert.ok(!packageInfo.signalk.requires.includes("signalk-ajrm-marine-vessel-database"));
});

test("Console publishes an installable sailing module manifest", () => {
  const messages = [];
  const statuses = [];
  const app = {
    handleMessage(_id, message) {
      messages.push(message);
    },
    setPluginStatus(value) {
      statuses.push(value);
    },
  };
  const plugin = createPlugin(app);
  plugin.start({
    defaultModule: "overview",
    webapps: {
      "signalk-ajrm-marine-audio": false,
      "signalk-ajrm-marine-display": false,
      "signalk-ajrm-marine-instruments": false,
    },
  });
  const status = messages[0].updates[0].values[0].value;
  assert.equal(status.contract, "ajrm-marine-console-status");
  assert.equal(status.defaultModule, "overview");
  assert.deepEqual(
    status.modules.map((module) => module.id),
    ["overview", "bite", "signalk-admin"],
  );
  assert.deepEqual(status.selectedWebapps, []);
  assert.deepEqual(status.services, []);
  assert.match(statuses[0], new RegExp(`Started v${escapeRegExp(packageInfo.version)}`));
});

test("Console exposes status through plugin and Signal K API routes", () => {
  const app = {
    getSelfPath() {},
    handleMessage() {},
    setPluginStatus() {},
  };
  const plugin = createPlugin(app);
  plugin.start({});
  const routes = new Map();
  const router = {
    get(path, handler) {
      routes.set(path, handler);
    },
  };
  plugin.signalKApiRoutes(router);
  let body;
  routes.get("/ajrmMarineConsole/status")(
    {},
    {
      set() {},
      json(value) {
        body = value;
      },
    },
  );
  assert.equal(body.ok, true);
  assert.equal(body.version, packageInfo.version);
  assert.ok(Array.isArray(body.availableWebapps));
  assert.ok(Array.isArray(body.suiteApps));
  assert.equal(body.defaultModule, "overview");
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("Console config schema renders discovered webapps as checkbox booleans", () => {
  const schema = schemaFor([
    {
      id: "signalk-ajrm-marine-logger",
      packageName: "signalk-ajrm-marine-logger",
      title: "AJRM Marine Logger",
      description: "Capture diagnostics",
      version: "1.1.1",
    },
    {
      id: "signalk-ajrm-marine-capture",
      packageName: "signalk-ajrm-marine-capture",
      title: "Voyage Capture",
      description: "Voyage bundles",
      version: "0.1.1",
    },
  ]);
  assert.equal(schema.properties.webapps.type, "object");
  assert.equal(schema.properties.tabOrder.type, "object");
  assert.equal(
    schema.properties.webapps.properties["signalk-ajrm-marine-logger"].type,
    "boolean",
  );
  assert.equal(
    schema.properties.tabOrder.properties["signalk-ajrm-marine-logger"].type,
    "integer",
  );
  assert.match(
    schema.properties.webapps.properties["signalk-ajrm-marine-capture"].title,
    /Voyage Capture/,
  );
  assert.match(
    schema.properties.tabOrder.description,
    /BITE is always second, Signal K is always third/,
  );
  assert.deepEqual(schema.properties.defaultModule.enum.slice(0, 3), [
    "overview",
    "bite",
    "signalk-admin",
  ]);
  assert.equal(schema.properties.selectedWebapps, undefined);
});
