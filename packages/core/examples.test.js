import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

import { createTestViewContext } from "./src/view/testUtils.js";
import { VIEW_ROOT_NAME } from "./src/view/viewFactory.js";
import { checkForDuplicateScaleNames } from "./src/view/viewUtils.js";
import { initializeViewSubtree } from "./src/data/flowInit.js";
import { ensureAssembliesForView } from "./src/genome/assemblyPreflight.js";
import { resolveRootGenomeConfig } from "./src/genome/rootGenomeConfig.js";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, "..", "..");
const curatedBaseUrl = "examples/";

// App-only sample specs are not supported by the core test harness yet and
// should move under examples/app once that tree is introduced.
const excludedExamples = new Set(["examples/core/app/samples.json"]);

const examplePaths = collectExamplePaths();

describe("shared examples", () => {
    test.each(examplePaths)("initializes %s", async (examplePath) => {
        expect(await initializeExample(examplePath)).toMatchSnapshot();
    });
});

function collectExamplePaths() {
    /** @type {string[]} */
    const paths = [];

    for (const dir of ["examples/core", "examples/docs"]) {
        visit(path.join(repoRoot, dir), (absolutePath) => {
            const relativePath = path.relative(repoRoot, absolutePath);
            const normalizedPath = relativePath.split(path.sep).join("/");
            const spec = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

            if (
                !excludedExamples.has(normalizedPath) &&
                !hasExternalDataUrl(spec)
            ) {
                paths.push(normalizedPath);
            }
        });
    }

    return paths.sort();
}

/**
 * @param {string} dir
 * @param {(absolutePath: string) => void} visitor
 */
function visit(dir, visitor) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(absolutePath, visitor);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            visitor(absolutePath);
        }
    }
}

/**
 * @param {string} examplePath
 */
async function initializeExample(examplePath) {
    const spec = JSON.parse(
        fs.readFileSync(path.join(repoRoot, examplePath), "utf8")
    );
    spec.baseUrl ??= curatedBaseUrl;

    const context = createTestViewContext({
        wrapRoot: true,
        allowImport: false,
    });
    const { genomesByName, defaultAssembly } = resolveRootGenomeConfig(spec);
    context.genomeStore.configureGenomes(genomesByName, defaultAssembly);
    await ensureAssembliesForSpec(spec, context);

    const view = await context.createOrImportView(
        spec,
        null,
        null,
        VIEW_ROOT_NAME
    );

    checkForDuplicateScaleNames(view);
    await ensureAssembliesForView(view, context.genomeStore);

    const { dataSources } = initializeViewSubtree(view, context.dataFlow);

    return {
        assemblies: Array.from(context.genomeStore.genomes.keys()).sort(),
        hierarchy: summarizeView(view),
        dataSources: Array.from(dataSources, summarizeDataSource).sort(
            compareDataSources
        ),
    };
}

/**
 * @param {import("./src/view/view.js").default} view
 */
function summarizeView(view) {
    return {
        type: view.constructor.name,
        name: view.name,
        baseUrl: view.getBaseUrl() ?? null,
        children: view.children?.map(summarizeView) ?? [],
    };
}

/**
 * @param {import("./src/data/sources/dataSource.js").default} dataSource
 */
function summarizeDataSource(dataSource) {
    return {
        type: dataSource.constructor.name,
        identifier: dataSource.identifier ?? null,
    };
}

/**
 * @param {{ type: string, identifier: string | null }} a
 * @param {{ type: string, identifier: string | null }} b
 */
function compareDataSources(a, b) {
    return (
        a.type.localeCompare(b.type) ||
        (a.identifier ?? "").localeCompare(b.identifier ?? "")
    );
}

/**
 * @param {any} spec
 * @param {ReturnType<typeof createTestViewContext>} context
 */
async function ensureAssembliesForSpec(spec, context) {
    const assemblies = new Map();

    const addAssembly = (assembly) => {
        if (!assembly) {
            return;
        }

        const key =
            typeof assembly === "string" ? assembly : JSON.stringify(assembly);
        assemblies.set(key, assembly);
    };

    addAssembly(spec.assembly);
    addAssembly(spec.genome?.name);

    visitSpec(spec, (node) => {
        if (
            typeof node?.assembly === "string" ||
            typeof node?.assembly === "object"
        ) {
            addAssembly(node.assembly);
        }
    });

    await context.genomeStore.ensureAssemblies(Array.from(assemblies.values()));
}

/**
 * @param {any} node
 * @param {(node: any) => void} visitor
 */
function visitSpec(node, visitor) {
    if (!node || typeof node !== "object") {
        return;
    }

    visitor(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            visitSpec(item, visitor);
        }
    } else {
        for (const value of Object.values(node)) {
            visitSpec(value, visitor);
        }
    }
}

/**
 * Exclude examples that require network access from the offline snapshot suite.
 *
 * @param {any} node
 */
function hasExternalDataUrl(node) {
    let foundExternalUrl = false;

    visitSpec(node, (currentNode) => {
        if (
            foundExternalUrl ||
            !currentNode ||
            typeof currentNode !== "object"
        ) {
            return;
        }

        if (isAbsoluteHttpUrl(currentNode.url)) {
            foundExternalUrl = true;
        } else if (
            currentNode.name === "url" &&
            (isAbsoluteHttpUrl(currentNode.value) ||
                currentNode.bind?.options?.some(isAbsoluteHttpUrl))
        ) {
            foundExternalUrl = true;
        }
    });

    return foundExternalUrl;
}

/**
 * @param {unknown} value
 */
function isAbsoluteHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//.test(value);
}
