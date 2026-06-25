"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const donor =
  process.env.AIS_PLUS_HELP_SOURCE ||
  path.join(root, "..", "signalk-ajrm-marine-display", "src", "web", "index.html");
const output = path.join(root, "public", "help.html");
const source = fs.readFileSync(donor, "utf8");
const modalStart = source.indexOf('id="modalHelp"');
const bodyStart = source.indexOf('<div class="modal-body">', modalStart);
const contentStart = bodyStart + '<div class="modal-body">'.length;
const contentEnd = source.indexOf('<div class="modal-footer">', contentStart);

if (modalStart < 0 || bodyStart < 0 || contentEnd < 0) {
  throw new Error(`Unable to extract AJRM Marine help from ${donor}`);
}

let content = source.slice(contentStart, contentEnd);
content = content.replace(/\s*<\/div>\s*<\/div>\s*$/s, "\n");
content = content
  .replace(/AJRM Marine Display Help|AJRM Marine Display Help/g, "AJRM Marine Help")
  .replace(
    /This help area will grow into the onboard reference for the\s+main workflows and safety logic\./g,
    "This is the onboard reference for the main sailing workflows and safety logic.",
  );

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>AJRM Marine Help</title>
    <link rel="stylesheet" href="./help.css?v=0.2.0" />
    <script defer src="./help.js?v=0.2.0"></script>
  </head>
  <body>
    <main class="help-page">
      <header class="help-header">
        <h1>AJRM Marine Help</h1>
        <p>Onboard reference for the AJRM Marine sailing workflows and safety logic.</p>
      </header>
${content}
    </main>
  </body>
</html>
`;

fs.writeFileSync(output, page);
console.log(`Extracted AJRM Marine help to ${output}`);
