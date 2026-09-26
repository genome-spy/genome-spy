import { build } from "vite";
import path from "node:path";

// Core's ESM and UMD builds remain unchanged. These independent add-ons contain
// no Core runtime and are fetched only when a page explicitly includes them.
for (const [entry, name] of [
    ["controls", "genomeSpyControls"],
    ["recording", "genomeSpyRecording"],
]) {
    await build({
        configFile: false,
        root: "src",
        build: {
            outDir: "../dist/bundle",
            emptyOutDir: false,
            lib: {
                entry:
                    entry === "controls"
                        ? path.resolve("scripts/browserControls.js")
                        : "recording.js",
                name,
                formats: ["es", "umd"],
                fileName: (format) =>
                    entry + (format === "es" ? ".es.js" : ".js"),
            },
        },
    });
}
