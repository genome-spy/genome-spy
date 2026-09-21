import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
    advancesMajorAlias,
    publishSchema,
    validatePreviousExamples,
} from "../../scripts/schema-publication.mjs";

/** @type {string[]} */
const temporaryDirectories = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true }))
    );
});

describe("schema release publication", () => {
    test("retains exact releases and advances aliases monotonically", async () => {
        const workspace = await createTemporaryDirectory();
        const siteDir = path.join(workspace, "site");
        const schemaPath = path.join(workspace, "schema.json");

        for (const [version, title] of [
            ["0.88.1", "first v0"],
            ["0.88.2", "latest v0"],
            ["1.0.0", "first v1"],
            ["1.1.0", "latest v1"],
            ["2.0.0", "first v2"],
        ]) {
            await writeFile(schemaPath, JSON.stringify({ title }));
            await publishSchema({
                siteDir,
                library: "core",
                version,
                schemaPath,
            });
        }

        await writeFile(schemaPath, JSON.stringify({ title: "first v1" }));
        await publishSchema({
            siteDir,
            library: "core",
            version: "1.0.0",
            schemaPath,
        });

        const schemaDir = path.join(siteDir, "schema", "core");
        await expect(readTitle(schemaDir, "v0.json")).resolves.toBe(
            "latest v0"
        );
        await expect(readTitle(schemaDir, "v0.88.json")).resolves.toBe(
            "latest v0"
        );
        await expect(readTitle(schemaDir, "v1.json")).resolves.toBe(
            "latest v1"
        );
        await expect(readTitle(schemaDir, "v1.0.json")).resolves.toBe(
            "first v1"
        );
        await expect(readTitle(schemaDir, "v1.1.json")).resolves.toBe(
            "latest v1"
        );
        await expect(readTitle(schemaDir, "v2.json")).resolves.toBe("first v2");

        const manifest = JSON.parse(
            await readFile(path.join(schemaDir, "manifest.json"), "utf8")
        );
        expect(manifest.aliases).toEqual({
            v0: "0.88.2",
            "v0.88": "0.88.2",
            v1: "1.1.0",
            "v1.0": "1.0.0",
            "v1.1": "1.1.0",
            v2: "2.0.0",
            "v2.0": "2.0.0",
        });
        expect(manifest.versions).toEqual([
            "0.88.1",
            "0.88.2",
            "1.0.0",
            "1.1.0",
            "2.0.0",
        ]);
    });

    test("publishes Core and App versions independently", async () => {
        const workspace = await createTemporaryDirectory();
        const siteDir = path.join(workspace, "site");
        const coreSchema = path.join(workspace, "core.json");
        const appSchema = path.join(workspace, "app.json");
        await writeFile(coreSchema, '{"title":"Core"}');
        await writeFile(appSchema, '{"title":"App"}');

        await publishSchema({
            siteDir,
            library: "core",
            version: "1.3.0",
            schemaPath: coreSchema,
        });
        await publishSchema({
            siteDir,
            library: "app",
            version: "2.1.4",
            schemaPath: appSchema,
        });

        await expect(
            readTitle(path.join(siteDir, "schema", "core"), "v1.json")
        ).resolves.toBe("Core");
        await expect(
            readTitle(path.join(siteDir, "schema", "app"), "v2.json")
        ).resolves.toBe("App");
    });

    test("never overwrites an exact release with different content", async () => {
        const workspace = await createTemporaryDirectory();
        const siteDir = path.join(workspace, "site");
        const schemaPath = path.join(workspace, "schema.json");
        await writeFile(schemaPath, '{"title":"Original"}');
        await publishSchema({
            siteDir,
            library: "core",
            version: "1.0.0",
            schemaPath,
        });
        await writeFile(schemaPath, '{"title":"Changed"}');

        await expect(
            publishSchema({
                siteDir,
                library: "core",
                version: "1.0.0",
                schemaPath,
            })
        ).rejects.toThrow("Refusing to overwrite immutable schema");
    });

    test("recognizes out-of-order releases that cannot advance an alias", async () => {
        const workspace = await createTemporaryDirectory();
        const siteDir = path.join(workspace, "site");
        const schemaPath = path.join(workspace, "schema.json");
        await writeFile(schemaPath, '{"title":"Latest"}');
        await publishSchema({
            siteDir,
            library: "core",
            version: "1.2.0",
            schemaPath,
        });

        await expect(
            advancesMajorAlias({
                siteDir,
                library: "core",
                version: "1.1.0",
            })
        ).resolves.toBe(false);
        await expect(
            advancesMajorAlias({
                siteDir,
                library: "core",
                version: "1.3.0",
            })
        ).resolves.toBe(true);
        await expect(
            advancesMajorAlias({
                siteDir,
                library: "core",
                version: "2.0.0",
            })
        ).resolves.toBe(true);
    });

    test("checks compatible previous examples before aliases advance", async () => {
        const workspace = await createTemporaryDirectory();
        const examplesDir = path.join(workspace, "examples");
        const coreDir = path.join(examplesDir, "core");
        const schemaPath = path.join(workspace, "schema.json");
        await mkdir(coreDir, { recursive: true });
        await writeFile(
            path.join(coreDir, "valid.json"),
            JSON.stringify({
                $schema: "https://genomespy.app/schema/core/v0.json",
                mark: "point",
            })
        );
        await writeFile(
            path.join(coreDir, "vega-lite.json"),
            JSON.stringify({
                $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            })
        );
        await writeFile(
            schemaPath,
            JSON.stringify({
                type: "object",
                required: ["mark"],
                properties: {
                    $schema: { type: "string" },
                    mark: { const: "point" },
                },
                additionalProperties: false,
            })
        );

        await expect(
            validatePreviousExamples({
                examplesDir,
                library: "core",
                version: "1.0.0",
                schemaPath,
            })
        ).resolves.toEqual({ checked: 1, skipped: 1 });

        await writeFile(
            schemaPath,
            JSON.stringify({
                type: "object",
                required: ["encoding"],
            })
        );
        await expect(
            validatePreviousExamples({
                examplesDir,
                library: "core",
                version: "1.0.0",
                schemaPath,
            })
        ).rejects.toThrow("is incompatible");
    });
});

async function createTemporaryDirectory() {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), "genome-spy-schema-publication-")
    );
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * @param {string} schemaDir
 * @param {string} filename
 */
async function readTitle(schemaDir, filename) {
    return JSON.parse(await readFile(path.join(schemaDir, filename), "utf8"))
        .title;
}
