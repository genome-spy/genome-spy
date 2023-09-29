// Based on Trevor Manz's idea: https://twitter.com/trevmanz/status/1707483926175088766
// https://gist.github.com/manzt/621fe167e0c7f3764b94e7135951653d

/* eslint-disable no-sync */

import * as fs from "node:fs";

const BACKUP_JSON = "./package.prepack-backup.json";

if (fs.existsSync(BACKUP_JSON)) {
    throw new Error(`${BACKUP_JSON} already exists. Cannot continue.`);
}

fs.writeFileSync(BACKUP_JSON, fs.readFileSync("./package.json"));

const manifest = JSON.parse(
    fs.readFileSync("./package.json", { encoding: "utf8" })
);

for (const [k, v] of Object.entries(manifest.exports)) {
    if (typeof v === "string") {
        manifest.exports[k] = v.replace(/^\.\/src\//, "./dist/src/");
    }
}

fs.writeFileSync("./package.json", JSON.stringify(manifest, null, 2));
