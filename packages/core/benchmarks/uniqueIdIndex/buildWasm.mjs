import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use Emscripten's LLVM directly: this freestanding module needs no runtime or
// writable system cache, and no Emscripten-specific startup exports.
const compiler = spawnSync("emcc", ["-print-prog-name=clang"], {
    encoding: "utf8",
});
if (compiler.error) throw compiler.error;
if (compiler.status !== 0) throw new Error(compiler.stderr);
const result = spawnSync(
    compiler.stdout.trim(),
    [
        fileURLToPath(new URL("radix.c", import.meta.url)),
        "--target=wasm32",
        "-O3",
        "-nostdlib",
        "-ffreestanding",
        "-fno-strict-aliasing",
        "-Wl,--no-entry",
        "-Wl,--import-memory",
        "-Wl,--export=sort_ids",
        "-Wl,--export=noop",
        "-Wl,-z,stack-size=65536",
        "-Wl,--initial-memory=131072",
        "-Wl,--max-memory=2147483648",
        "-o",
        fileURLToPath(new URL("radix.wasm", import.meta.url)),
    ],
    { stdio: "inherit" }
);
if (result.error) throw result.error;
process.exitCode = result.status;
