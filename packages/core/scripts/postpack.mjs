/* eslint-disable no-sync */

import * as fs from "node:fs";

const BACKUP_JSON = "./package.prepack-backup.json";

const backup = fs.readFileSync(BACKUP_JSON);
fs.writeFileSync("./package.json", backup);
fs.unlinkSync(BACKUP_JSON); // delete backup file
