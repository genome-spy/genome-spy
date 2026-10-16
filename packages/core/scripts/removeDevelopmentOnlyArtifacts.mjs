import fs from "node:fs";
import { glob } from "glob";

fs.rmSync("dist/src/rendering/webgpu", { recursive: true, force: true });

// Declaration emit must not replace handwritten contracts beside JavaScript files.
for (const source of glob.sync("src/**/*.d.ts")) {
    if (!source.startsWith("src/rendering/webgpu/")) {
        fs.copyFileSync(source, "dist/" + source);
    }
}
