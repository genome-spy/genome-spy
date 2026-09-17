import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RELEASE_TAG = "v0.1.0";
const RELEASE_BASE =
    `https://github.com/genome-spy/msdfgen-oracle/releases/download/` +
    RELEASE_TAG;
const RUNTIME_DIRECTORY = fileURLToPath(
    new URL("../tests/oracles/msdfgen/runtime/", import.meta.url)
);

const ASSETS = Object.freeze([
    {
        name: "msdfgen-oracle.mjs",
        sha256: "b536139814554e8ef9a76ffbc1ae1303f535c9ac6db8a0f346a29470f5ed120b",
    },
    {
        name: "manifest.json",
        sha256: "8ecd1e542c507bc99f4d89e6269fa591699dc315736bb9aabff57255fb4d6066",
    },
    {
        name: "LICENSE-msdfgen.txt",
        sha256: "32a94b25ad7072a78457d35019b32d73d2c265c806b0b76e9638fe800330bbe4",
    },
]);

/** @param {Uint8Array} bytes */
function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

/** @param {{ name: string, sha256: string }} asset */
async function readVerifiedAsset(asset) {
    try {
        const bytes = await readFile(RUNTIME_DIRECTORY + asset.name);
        return sha256(bytes) === asset.sha256 ? bytes : null;
    } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

/** @param {{ name: string, sha256: string }} asset */
async function downloadAsset(asset) {
    const response = await fetch(RELEASE_BASE + "/" + asset.name);
    if (!response.ok) {
        throw new Error(
            `Could not download ${asset.name}: ${response.status} ${response.statusText}.`
        );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== asset.sha256) {
        throw new Error(
            `${asset.name} SHA-256 mismatch: expected ${asset.sha256}, got ${actualSha256}.`
        );
    }
    return bytes;
}

await mkdir(RUNTIME_DIRECTORY, { recursive: true });

for (const asset of ASSETS) {
    const existing = await readVerifiedAsset(asset);
    if (existing) {
        continue;
    }
    const bytes = await downloadAsset(asset);
    const destination = RUNTIME_DIRECTORY + asset.name;
    const temporary = destination + ".tmp";
    try {
        await writeFile(temporary, bytes);
        await rm(destination, { force: true });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}

const manifest = JSON.parse(
    await readFile(RUNTIME_DIRECTORY + "manifest.json", "utf8")
);
if (
    manifest.version !== "0.1.0" ||
    manifest.abiVersion !== 1 ||
    manifest.artifact?.sha256 !== ASSETS[0].sha256
) {
    throw new Error("Downloaded msdfgen oracle manifest is incompatible.");
}

console.log(`Verified msdfgen oracle ${RELEASE_TAG} in ${RUNTIME_DIRECTORY}.`);
