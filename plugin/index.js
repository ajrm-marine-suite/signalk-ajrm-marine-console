"use strict";

const { randomUUID } = require("node:crypto");
const packageInfo = require("../package.json");
const openApi = require("./openApi.json");
const {
  configuredModules,
  defaultModule,
  discoverWebapps,
  selectedWebappIds,
  suiteAppCatalog,
} = require("./modules");
const { createBiteController } = require("./bite");

const PLUGIN_ID = "signalk-ajrm-marine-console";
const STATUS_PATH = "plugins.ajrmMarineConsole";

module.exports = function ajrmMarineConsole(app) {
  const plugin = {};
  let options = normalizeOptions({});
  let availableWebapps = discoverWebapps();
  let status = null;
  const bite = createBiteController(app, {
    pluginId: PLUGIN_ID,
    version: packageInfo.version,
  });

  plugin.id = PLUGIN_ID;
  plugin.name = "AJRM Marine Console";
  plugin.description =
    "Configurable AJRM Marine webapp console with selected Signal K webapps in one navigation surface.";
  plugin.schema = schemaFor(availableWebapps);

  plugin.start = (pluginOptions = {}) => {
    availableWebapps = discoverWebapps();
    plugin.schema = schemaFor(availableWebapps);
    options = normalizeOptions(pluginOptions);
    status = buildStatus();
    publish(status);
    app.setPluginStatus(
      `Started v${packageInfo.version}; ${status.selectedWebapps.length} selected webapps`,
    );
  };

  plugin.stop = () => {
    status = null;
  };

  plugin.registerWithRouter = (router) => registerRoutes(router);
  plugin.signalKApiRoutes = (router) => {
    registerRoutes(router, "/ajrmMarineConsole");
    return router;
  };
  plugin.getOpenApi = () => openApi;

  return plugin;

  function registerRoutes(router, prefix = "") {
    router.get(`${prefix}/status`, (_req, res) => {
      status = buildStatus(status?.sessionId);
      res.set?.("Cache-Control", "no-store");
      res.json({ ok: true, ...status });
    });
    router.get(`${prefix}/bite/status`, (_req, res) => {
      res.set?.("Cache-Control", "no-store");
      res.json(bite.status());
    });
    if (typeof router.post === "function") {
      router.post(`${prefix}/bite/run`, async (req, res) => {
        try {
          const report = await bite.run(req.body || {});
          res.set?.("Cache-Control", "no-store");
          res.status?.(report.ok ? 200 : 500);
          res.json(report);
        } catch (error) {
          res.status?.(error.statusCode || 500);
          res.json({
            ok: false,
            error: error.message || String(error),
          });
        }
      });
    }
  }

  function buildStatus(sessionId = randomUUID()) {
    availableWebapps = discoverWebapps();
    const modules = configuredModules(options, availableWebapps);
    return {
      contract: "ajrm-marine-console-status",
      contractVersion: 1,
      sessionId,
      version: packageInfo.version,
      availableWebapps,
      suiteApps: suiteAppCatalog(options, availableWebapps, modules),
      selectedWebapps: modules
        .filter((module) => module.kind === "webapp")
        .map((module) => module.id),
      modules,
      defaultModule: defaultModule(options, modules),
      services: serviceSummary(),
      generatedAt: new Date().toISOString(),
    };
  }

  function serviceSummary() {
    return configuredModules(options, availableWebapps)
      .filter((module) => module.kind === "webapp")
      .map((module) => ({
        name: module.title,
        packageName: module.packageName,
        available: true,
        version: String(module.version || ""),
        url: module.url,
        mode: "",
      }));
  }

  function publish(value) {
    app.handleMessage(PLUGIN_ID, {
      context: "vessels.self",
      updates: [{ values: [{ path: STATUS_PATH, value }] }],
    });
  }
};

function normalizeOptions(value) {
  const selected = selectedWebappIds(value, discoverWebapps());
  return {
    defaultModule: String(value.defaultModule || "overview"),
    webapps: Object.fromEntries(Array.from(selected).map((id) => [id, true])),
    tabOrder: isObject(value.tabOrder) ? value.tabOrder : {},
  };
}

function schemaFor(availableWebapps = discoverWebapps()) {
  const enumValues = availableWebapps.map((module) => module.id);
  const enumNames = availableWebapps.map(
    (module) => webappLabel(module),
  );
  const selectedDefaults = selectedWebappIds({}, availableWebapps);
  const webappProperties = Object.fromEntries(
    availableWebapps.map((module) => [
      module.id,
      {
        type: "boolean",
        title: webappLabel(module),
        description: module.description || module.packageName,
        default: selectedDefaults.has(module.id),
      },
    ]),
  );
  const tabOrderProperties = Object.fromEntries(
    availableWebapps.map((module, index) => [
      module.id,
      {
        type: "integer",
        title: webappLabel(module),
        description: "Lower numbers appear earlier in the Console tabs. Leave blank or duplicate to keep the normal discovered order.",
        default: index + 1,
        minimum: 1,
      },
    ]),
  );
  return {
    type: "object",
    properties: {
      webapps: {
        type: "object",
        title: "Webapps to show as Console tabs",
        description:
          "Console discovers installed Signal K webapps dynamically. Core AJRM Marine Suite apps are selected by default. Optional apps remain available here and can be ticked when installed.",
        properties: webappProperties,
        additionalProperties: false,
        default: Object.fromEntries(
          availableWebapps.map((module) => [
            module.id,
            selectedDefaults.has(module.id),
          ]),
        ),
      },
      tabOrder: {
        type: "object",
        title: "Tab order",
        description:
          "Optional ordering for selected webapp tabs. Overview is always first, Signal K is always second, and selected webapps are sorted by these numbers.",
        properties: tabOrderProperties,
        additionalProperties: false,
        default: Object.fromEntries(
          availableWebapps.map((module, index) => [module.id, index + 1]),
        ),
      },
      defaultModule: {
        type: "string",
        title: "Default tab",
        enum: ["overview", "signalk-admin", ...enumValues],
        enumNames: ["Overview", "Signal K", ...enumNames],
        default: "overview",
      },
    },
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function webappLabel(module) {
  return `${module.title} (${module.packageName}${module.version ? ` v${module.version}` : ""})`;
}

module.exports.schemaFor = schemaFor;
