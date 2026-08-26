/* global console */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { transform } from "esbuild";
import { rollup } from "rollup";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const packageName = "@genome-spy/webgpu-renderer";

const publicEntries = new Map([
    ["", "src/index.js"],
    ["debug", "src/debug.js"],
    ["fonts/lato", "src/fonts/lato.js"],
    ["high-precision", "src/utils/highPrecision.js"],
    ["scale-authoring", "src/marks/scales/scale-authoring.js"],
    ["marks/arrow", "src/marks/arrow.js"],
    ["marks/link", "src/marks/link.js"],
    ["marks/point", "src/marks/point.js"],
    ["marks/rect", "src/marks/rect.js"],
    ["marks/rule", "src/marks/rule.js"],
    ["marks/text", "src/marks/text.js"],
    ["scales/band", "src/scales/band.js"],
    ["scales/index", "src/scales/index.js"],
    ["scales/identity", "src/scales/identity.js"],
    ["scales/linear", "src/scales/linear.js"],
    ["scales/log", "src/scales/log.js"],
    ["scales/ordinal", "src/scales/ordinal.js"],
    ["scales/pow", "src/scales/pow.js"],
    ["scales/quantize", "src/scales/quantize.js"],
    ["scales/sqrt", "src/scales/sqrt.js"],
    ["scales/symlog", "src/scales/symlog.js"],
    ["scales/threshold", "src/scales/threshold.js"],
]);

const fixtures = [
    "rendererOnly",
    "pointLinear",
    "pointOrdinal",
    "customIdentityMark",
    "textCustomFont",
    "textLato",
];

function resolveSelfImport(source) {
    if (source === packageName) {
        return path.join(packageRoot, publicEntries.get(""));
    }
    if (source.startsWith(`${packageName}/`)) {
        const subpath = source.slice(packageName.length + 1);
        const entry = publicEntries.get(subpath);
        if (entry) {
            return path.join(packageRoot, entry);
        }
    }
    return null;
}

function resolveAssetImport(source, importer) {
    if (!importer || !source.startsWith(".")) {
        return null;
    }
    const resolved = path.resolve(path.dirname(importer), source);
    return fs.existsSync(resolved) ? resolved : null;
}

const resolver = {
    name: "webgpu-renderer-package-resolver",
    resolveId(source, importer) {
        const selfImport = resolveSelfImport(source);
        if (selfImport) {
            return selfImport;
        }

        const assetImport = resolveAssetImport(source, importer);
        if (assetImport) {
            return assetImport;
        }

        if (!importer || source.startsWith(".") || path.isAbsolute(source)) {
            return null;
        }

        try {
            return createRequire(importer).resolve(source);
        } catch {
            return { id: source, external: true };
        }
    },
    load(id) {
        if (id.endsWith(".json")) {
            return `export default ${JSON.stringify(JSON.parse(fs.readFileSync(id, "utf8")))};`;
        }
        if (id.endsWith(".png")) {
            const data = fs.readFileSync(id).toString("base64");
            return `export default ${JSON.stringify(`data:image/png;base64,${data}`)};`;
        }
        return null;
    },
};

const rollupOptions = {
    plugins: [resolver],
    onwarn(warning, warn) {
        if (warning.code !== "CIRCULAR_DEPENDENCY") {
            warn(warning);
        }
    },
};

async function bundleFixture(name) {
    const input = path.join(packageRoot, "scripts/fixtures", `${name}.js`);
    const bundle = await rollup({ input, ...rollupOptions });
    try {
        const { output } = await bundle.generate({ format: "es" });
        const chunks = output.filter((item) => item.type === "chunk");
        const modules = new Set(
            chunks.flatMap((chunk) =>
                Object.keys(chunk.modules).map((id) =>
                    path.relative(packageRoot, id).split(path.sep).join("/")
                )
            )
        );
        const code = chunks.map((chunk) => chunk.code).join("\n");
        const minified = await transform(code, {
            format: "esm",
            target: "es2022",
            minify: true,
        });
        const minifiedBytes = Buffer.byteLength(minified.code);
        const gzipBytes = gzipSync(minified.code, { level: 9 }).byteLength;
        return {
            name,
            modules,
            minifiedCode: minified.code,
            minifiedBytes,
            gzipBytes,
        };
    } finally {
        await bundle.close();
    }
}

function assertTreeShaking(result) {
    if (result.name === "textLato") {
        for (const id of [
            "src/marks/programs/textProgram.js",
            "src/fonts/lato.js",
            "src/fonts/Lato-Regular.json",
            "src/fonts/Lato-Regular.png",
        ]) {
            if (!result.modules.has(id)) {
                throw new Error(`Lato bundle is missing required module: ${id}`);
            }
        }
        return;
    }

    if (result.name === "textCustomFont") {
        for (const id of [
            "src/marks/text.js",
            "src/marks/programs/textProgram.js",
        ]) {
            if (!result.modules.has(id)) {
                throw new Error(
                    `Custom-font bundle is missing required module: ${id}`
                );
            }
        }
        if (result.modules.has("src/fonts/lato.js")) {
            throw new Error(
                "Custom-font bundle unexpectedly includes the Lato preset."
            );
        }
        if (!result.minifiedCode.includes("Custom Sans")) {
            throw new Error(
                "Custom-font bundle does not retain the configured font family."
            );
        }
        return;
    }

    if (result.name !== "pointLinear") {
        return;
    }

    const required = [
        "src/renderer.js",
        "src/marks/point.js",
        "src/marks/programs/pointProgram.js",
        "src/scales/linear.js",
        "src/marks/scales/defs/linear.js",
    ];
    for (const id of required) {
        if (!result.modules.has(id)) {
            throw new Error(
                `Point/linear bundle is missing required module: ${id}`
            );
        }
    }

    const forbidden = [
        "src/marks/programs/rectProgram.js",
        "src/marks/programs/ruleProgram.js",
        "src/marks/programs/linkProgram.js",
        "src/marks/programs/textProgram.js",
        "src/marks/programs/arrowProgram.js",
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
        if (result.modules.has(id)) {
            throw new Error(
                `Point/linear bundle includes unrelated module: ${id}`
            );
        }
    }
    for (const id of result.modules) {
        if (id.startsWith("src/fonts/")) {
            throw new Error(`Point/linear bundle includes font support: ${id}`);
        }
    }
}

for (const name of fixtures) {
    const result = await bundleFixture(name);
    assertTreeShaking(result);
    console.log(
        `${name}: ${result.minifiedBytes} bytes minified, ${result.gzipBytes} bytes gzip, ${result.modules.size} modules`
    );
}

try {
    await import(`${packageName}/src/renderer.js`);
    throw new Error(
        "Internal renderer source unexpectedly passed export checks."
    );
} catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
        throw error;
    }
}

console.log("Tree-shaking and package export verification passed.");
