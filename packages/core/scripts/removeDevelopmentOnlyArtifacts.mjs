import fs from "node:fs";

fs.rmSync("dist/src/rendering/webgpu", { recursive: true, force: true });
