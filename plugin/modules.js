"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OVERVIEW_MODULE = {
  id: "overview",
  title: "Overview",
  icon: "⌂",
  kind: "native",
  description: "Selected webapp versions and onboard help.",
  defaultEnabled: true,
};

const SIGNALK_ADMIN_MODULE = {
  id: "signalk-admin",
  title: "Signal K",
  icon: "⚙",
  kind: "system",
  url: "/admin/",
  description: "Main Signal K server administration screen.",
  packageName: "signalk-server",
  version: "",
};

const DEFAULT_WEBAPPS = [
  "signalk-ajrm-marine-display",
  "signalk-ajrm-marine-instruments",
  "signalk-ajrm-marine-audio",
];

function discoverWebapps(options = {}) {
  const nodeModulesDir =
    options.nodeModulesDir || path.dirname(path.resolve(__dirname, ".."));
  const currentPackage = packageNameAt(path.resolve(__dirname, ".."));
  const packages = [];
  for (const packageDir of packageDirs(nodeModulesDir)) {
    const packageJsonPath = path.join(packageDir, "package.json");
    const pkg = readJson(packageJsonPath);
    if (!isSignalKWebapp(pkg) || pkg.name === currentPackage) continue;
    packages.push(webappModule(pkg));
  }
  return packages.sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
  );
}

function configuredModules(options = {}, availableWebapps = discoverWebapps()) {
  const selected = selectedWebappIds(options, availableWebapps);
  const order = webappOrder(options, availableWebapps);
  const modules = availableWebapps
    .filter((module) => selected.has(module.id))
    .sort((left, right) => {
      const leftOrder = order.get(left.id);
      const rightOrder = order.get(right.id);
      if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) {
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      } else if (Number.isFinite(leftOrder)) {
        return -1;
      } else if (Number.isFinite(rightOrder)) {
        return 1;
      }
      return 0;
    });
  return [OVERVIEW_MODULE, SIGNALK_ADMIN_MODULE, ...modules];
}

function defaultModule(options = {}, modules = configuredModules(options)) {
  const requested = String(options.defaultModule || "overview");
  return modules.some((module) => module.id === requested)
    ? requested
    : "overview";
}

function selectedWebappIds(options = {}, availableWebapps = discoverWebapps()) {
  const available = new Set(availableWebapps.map((module) => module.id));
  if (isObject(options.webapps)) {
    return new Set(
      Object.entries(options.webapps)
        .filter(([, selected]) => selected === true)
        .map(([id]) => cleanId(id))
        .filter((id) => available.has(id)),
    );
  }
  return new Set(DEFAULT_WEBAPPS.filter((id) => available.has(id)));
}

function webappOrder(options = {}, availableWebapps = discoverWebapps()) {
  const available = new Set(availableWebapps.map((module) => module.id));
  const output = new Map();
  if (isObject(options.tabOrder)) {
    Object.entries(options.tabOrder).forEach(([id, value]) => {
      const clean = cleanId(id);
      const order = Number(value);
      if (available.has(clean) && Number.isFinite(order)) output.set(clean, order);
    });
    return output;
  }
  return output;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function webappModule(pkg) {
  return {
    id: cleanId(pkg.name),
    packageName: String(pkg.name || ""),
    title: consoleTitleForPackage(pkg),
    icon: iconForPackage(pkg.name),
    kind: "webapp",
    url: `/${webappUrlPath(pkg.name)}/`,
    description: String(pkg.description || "Signal K webapp."),
    version: String(pkg.version || ""),
  };
}

function consoleTitleForPackage(pkg) {
  const displayName = String(pkg.signalk?.displayName || pkg.displayName || "").trim();
  const title = displayName || titleFromPackageName(pkg.name);
  if (!isAjrmMarinePackage(pkg.name)) return title;
  const shortened = title.replace(/^AJRM Marine\s+/i, "").trim();
  return shortened || title;
}

function isAjrmMarinePackage(name) {
  return String(name || "").startsWith("signalk-ajrm-marine-");
}

function packageDirs(nodeModulesDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      let scoped = [];
      try {
        scoped = fs.readdirSync(scopeDir, { withFileTypes: true });
      } catch (_error) {
        scoped = [];
      }
      for (const scopedEntry of scoped) {
        if (scopedEntry.isDirectory()) {
          dirs.push(path.join(scopeDir, scopedEntry.name));
        }
      }
      continue;
    }
    dirs.push(path.join(nodeModulesDir, entry.name));
  }
  return dirs;
}

function isSignalKWebapp(pkg) {
  return Boolean(
    pkg &&
      typeof pkg === "object" &&
      Array.isArray(pkg.keywords) &&
      pkg.keywords.includes("signalk-webapp") &&
      pkg.name,
  );
}

function packageNameAt(packageRoot) {
  return String(readJson(path.join(packageRoot, "package.json"))?.name || "");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function cleanId(value) {
  return String(value || "").trim();
}

function titleFromPackageName(name) {
  return String(name || "")
    .replace(/^@[^/]+\//, "")
    .replace(/^signalk-/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function webappUrlPath(name) {
  return encodeURI(String(name || "").trim()).replace(/^\/+|\/+$/g, "");
}

function iconForPackage(name) {
  const value = String(name || "");
  if (/chart|display|map/i.test(value)) return "⌖";
  if (/alert|companion|notification/i.test(value)) return "!";
  if (/instrument/i.test(value)) return "◉";
  if (/audio|sound|voice/i.test(value)) return "♪";
  if (/capture|record/i.test(value)) return "●";
  if (/voyage|debug/i.test(value)) return "◆";
  return "□";
}

module.exports = {
  DEFAULT_WEBAPPS,
  OVERVIEW_MODULE,
  SIGNALK_ADMIN_MODULE,
  configuredModules,
  defaultModule,
  discoverWebapps,
  selectedWebappIds,
  webappOrder,
};
