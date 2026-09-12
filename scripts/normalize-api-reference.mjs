import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = resolve(
    fileURLToPath(new URL("../docs/api/reference", import.meta.url))
);

async function normalizeMarkdown(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
            await normalizeMarkdown(path);
        } else if (entry.name.endsWith(".md")) {
            const source = await readFile(path, "utf8");
            const normalized = source
                .replace(/^([ \t]*#{1,6}) ~~(.+?)~~$/gm, "$1 $2")
                .replace(/\[~~(.+?)~~\]/g, "[$1]")
                .replaceAll("\\<", "<");

            if (normalized !== source) {
                await writeFile(path, normalized);
            }
        }
    }
}

await normalizeMarkdown(outputDirectory);
