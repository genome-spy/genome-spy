/* global console */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollup } from "rollup";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const input = path.join(packageRoot, "scripts/fixtures/pointLinear.js");
const bundle = await rollup({
    input,
    external: (id) => !id.startsWith(".") && !path.isAbsolute(id),
});

try {
    const { output } = await bundle.generate({ format: "es" });
    const chunks = output.filter((item) => item.type == "chunk");
    const modules = new Set(
        chunks.flatMap((chunk) =>
            Object.keys(chunk.modules).map((id) =>
                path.relative(packageRoot, id).split(path.sep).join("/")
            )
        )
    );

    const required = [
        "src/renderer.js",
        "src/marks/point.js",
        "src/marks/programs/pointProgram.js",
        "src/scales/linear.js",
        "src/marks/scales/defs/linear.js",
    ];
    for (const id of required) {
        if (!modules.has(id)) {
            throw new Error(
                `Point/linear bundle is missing required module: ${id}`
            );
        }
    }

    const forbidden = [
        "src/compatibility.js",
        "src/marks/programs/rectProgram.js",
        "src/marks/programs/ruleProgram.js",
        "src/marks/programs/linkProgram.js",
        "src/marks/programs/textProgram.js",
        "src/marks/scales/scaleDefs.js",
        "src/marks/scales/defs/band.js",
        "src/marks/scales/defs/index.js",
        "src/marks/scales/defs/log.js",
        "src/marks/scales/defs/ordinal.js",
        "src/marks/scales/defs/pow.js",
        "src/marks/scales/defs/quantize.js",
        "src/marks/scales/defs/sqrt.js",
        "src/marks/scales/defs/symlog.js",
        "src/marks/scales/defs/threshold.js",
    ];
    for (const id of forbidden) {
        if (modules.has(id)) {
            throw new Error(
                `Point/linear bundle includes unrelated module: ${id}`
            );
        }
    }
    for (const id of modules) {
        if (id.startsWith("src/fonts/")) {
            throw new Error(`Point/linear bundle includes font support: ${id}`);
        }
    }

    const bytes = chunks.reduce((sum, chunk) => sum + chunk.code.length, 0);
    console.log(
        `Point/linear tree-shaking verification passed: ${modules.size} modules, ${bytes} bytes.`
    );
} finally {
    await bundle.close();
}
