"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  configuredModules,
  defaultModule,
  discoverWebapps,
  selectedWebappIds,
  webappOrder,
} = require("../plugin/modules");

function writePackage(nodeModulesDir, name, value = {}) {
  const dir = path.join(nodeModulesDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.2.3",
        description: `${name} description`,
        keywords: ["signalk-webapp"],
        signalk: { displayName: name.replace(/^signalk-/, "") },
        ...value,
      },
      null,
      2,
    ),
  );
}

test("Console discovers installed Signal K webapps dynamically", () => {
  const nodeModulesDir = fs.mkdtempSync(path.join(os.tmpdir(), "console-webapps-"));
  writePackage(nodeModulesDir, "signalk-ajrm-marine-logger", {
    version: "1.0.12",
    signalk: { displayName: "Capture Plus" },
  });
  writePackage(nodeModulesDir, "signalk-freeboard-sk", {
    version: "2.0.0",
    signalk: { displayName: "Freeboard SK" },
  });
  writePackage(nodeModulesDir, "@signalk/freeboard-sk", {
    version: "2.23.0",
    signalk: { displayName: "Freeboard-SK" },
  });
  writePackage(nodeModulesDir, "not-a-webapp", { keywords: ["utility"] });

  const webapps = discoverWebapps({ nodeModulesDir });
  assert.deepEqual(
    webapps.map((module) => module.id).sort(),
    ["@signalk/freeboard-sk", "signalk-ajrm-marine-logger", "signalk-freeboard-sk"],
  );
  assert.equal(webapps.find((module) => module.id === "signalk-ajrm-marine-logger").url, "/signalk-ajrm-marine-logger/");
  assert.equal(webapps.find((module) => module.id === "@signalk/freeboard-sk").url, "/@signalk/freeboard-sk/");
  assert.equal(webapps.find((module) => module.id === "signalk-ajrm-marine-logger").version, "1.0.12");
});

test("Console shortens AJRM Marine suite tab titles only", () => {
  const nodeModulesDir = fs.mkdtempSync(path.join(os.tmpdir(), "console-webapps-"));
  writePackage(nodeModulesDir, "signalk-ajrm-marine-display", {
    signalk: { displayName: "AJRM Marine Display" },
  });
  writePackage(nodeModulesDir, "signalk-ajrm-marine-gps-integrity", {
    signalk: { displayName: "AJRM Marine GPS Integrity" },
  });
  writePackage(nodeModulesDir, "signalk-third-party-demo", {
    signalk: { displayName: "AJRM Marine Demo" },
  });

  const webapps = discoverWebapps({ nodeModulesDir });
  assert.equal(webapps.find((module) => module.id === "signalk-ajrm-marine-display").title, "Display");
  assert.equal(webapps.find((module) => module.id === "signalk-ajrm-marine-gps-integrity").title, "GPS Integrity");
  assert.equal(webapps.find((module) => module.id === "signalk-third-party-demo").title, "AJRM Marine Demo");
});

test("Console module visibility and default selection are configurable with webapp checkboxes", () => {
  const available = [
    {
      id: "signalk-ajrm-marine-logger",
      title: "Capture Plus",
      kind: "webapp",
      url: "/signalk-ajrm-marine-logger/",
    },
    {
      id: "signalk-freeboard-sk",
      title: "Freeboard SK",
      kind: "webapp",
      url: "/signalk-freeboard-sk/",
    },
  ];
  const modules = configuredModules(
    { webapps: { "signalk-freeboard-sk": true } },
    available,
  );
  assert.deepEqual(
    modules.map((module) => module.id),
    ["overview", "signalk-admin", "signalk-freeboard-sk"],
  );
  assert.equal(
    defaultModule({ defaultModule: "signalk-ajrm-marine-logger" }, modules),
    "overview",
  );
  assert.equal(
    defaultModule({ defaultModule: "signalk-freeboard-sk" }, modules),
    "signalk-freeboard-sk",
  );
});

test("Console supports checkbox-style webapp selection settings", () => {
  const available = [
    { id: "signalk-ajrm-marine-logger", title: "Capture Plus", kind: "webapp" },
    { id: "signalk-ajrm-marine-capture", title: "Voyage Capture", kind: "webapp" },
    { id: "signalk-freeboard-sk", title: "Freeboard SK", kind: "webapp" },
  ];
  assert.deepEqual(
    Array.from(
      selectedWebappIds(
        {
          webapps: {
            "signalk-ajrm-marine-logger": true,
            "signalk-ajrm-marine-capture": false,
            "signalk-freeboard-sk": true,
          },
        },
        available,
      ),
    ).sort(),
    ["signalk-ajrm-marine-logger", "signalk-freeboard-sk"],
  );
  assert.deepEqual(
    configuredModules(
      {
        webapps: {
          "signalk-ajrm-marine-capture": true,
        },
      },
      available,
    ).map((module) => module.id),
    ["overview", "signalk-admin", "signalk-ajrm-marine-capture"],
  );
});

test("Console orders selected webapp tabs from config", () => {
  const available = [
    { id: "signalk-ajrm-marine-logger", title: "Capture Plus", kind: "webapp" },
    { id: "signalk-ajrm-marine-capture", title: "Voyage Capture", kind: "webapp" },
    { id: "signalk-freeboard-sk", title: "Freeboard SK", kind: "webapp" },
  ];
  const options = {
    webapps: {
      "signalk-ajrm-marine-logger": true,
      "signalk-ajrm-marine-capture": true,
      "signalk-freeboard-sk": true,
    },
    tabOrder: {
      "signalk-freeboard-sk": 1,
      "signalk-ajrm-marine-capture": 2,
      "signalk-ajrm-marine-logger": 3,
    },
  };
  assert.deepEqual(
    configuredModules(options, available).map((module) => module.id),
    [
      "overview",
      "signalk-admin",
      "signalk-freeboard-sk",
      "signalk-ajrm-marine-capture",
      "signalk-ajrm-marine-logger",
    ],
  );
  assert.deepEqual(
    Array.from(webappOrder(options, available).entries()),
    [
      ["signalk-freeboard-sk", 1],
      ["signalk-ajrm-marine-capture", 2],
      ["signalk-ajrm-marine-logger", 3],
    ],
  );
});

test("Console uses discovered order when tab order is absent", () => {
  const available = [
    { id: "signalk-ajrm-marine-logger", title: "Capture Plus", kind: "webapp" },
    { id: "signalk-ajrm-marine-capture", title: "Voyage Capture", kind: "webapp" },
    { id: "signalk-freeboard-sk", title: "Freeboard SK", kind: "webapp" },
  ];
  assert.deepEqual(
    configuredModules(
      {
        webapps: {
          "signalk-freeboard-sk": true,
          "signalk-ajrm-marine-logger": true,
        },
      },
      available,
    ).map((module) => module.id),
    ["overview", "signalk-admin", "signalk-ajrm-marine-logger", "signalk-freeboard-sk"],
  );
});

test("Console always places Signal K admin second", () => {
  const modules = configuredModules(
    {
      webapps: {
        "signalk-freeboard-sk": true,
      },
      tabOrder: {
        "signalk-freeboard-sk": 1,
      },
    },
    [{ id: "signalk-freeboard-sk", title: "Freeboard SK", kind: "webapp" }],
  );
  assert.deepEqual(
    modules.map((module) => module.id),
    ["overview", "signalk-admin", "signalk-freeboard-sk"],
  );
  assert.equal(modules[1].url, "/admin/");
});
