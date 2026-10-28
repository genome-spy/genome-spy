/**
 * Verify module boundaries in the actual ESM output. UMD intentionally inlines
 * optional dependencies because it cannot split dynamic imports into chunks.
 *
 * @returns {import("vite").Plugin}
 */
export default function verifyLazyFigwig() {
    return {
        name: "verify-lazy-figwig",
        generateBundle(options, bundle) {
            if (options.format !== "es") return;

            const chunks = Object.values(bundle).filter(
                (item) => item.type === "chunk"
            );
            const byName = new Map(
                chunks.map((chunk) => [chunk.fileName, chunk])
            );
            const pending = chunks.filter((chunk) => chunk.isEntry);
            const visited = new Set();
            const staticSources = new Set();
            while (pending.length) {
                const chunk = pending.pop();
                if (visited.has(chunk.fileName)) continue;
                visited.add(chunk.fileName);

                for (const id of Object.keys(chunk.modules)) {
                    staticSources.add(id.replaceAll("\\", "/"));
                }
                for (const file of chunk.imports) {
                    const imported = byName.get(file);
                    if (imported) pending.push(imported);
                }
            }

            const adapter = /\/adapters\/figWigMetadataSourceAdapter\.js$/;
            const dependencies = /\/(?:@genome-spy\/figwig|pako)\//;
            const eager = Array.from(staticSources).find(
                (id) => adapter.test(id) || dependencies.test(id)
            );
            if (eager) {
                this.error(
                    "Figwig must load asynchronously in App ESM: " + eager
                );
            }

            const allSources = chunks.flatMap((chunk) =>
                Object.keys(chunk.modules).map((id) => id.replaceAll("\\", "/"))
            );
            if (
                !allSources.some((id) => adapter.test(id)) ||
                !allSources.some((id) => dependencies.test(id))
            ) {
                this.error(
                    "App ESM did not emit its optional Figwig implementation."
                );
            }
        },
    };
}
