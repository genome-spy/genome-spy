import { describe, expect, test } from "vitest";

import GenomeStore from "./src/genome/genomeStore.js";
import { resolveRootGenomeConfig } from "./src/genome/rootGenomeConfig.js";
import { createHeadlessEngine } from "./src/genomeSpy/headlessBootstrap.js";
import {
    collectSharedExamplePaths,
    loadSharedExampleSpec,
} from "./src/spec/exampleFiles.js";

const curatedBaseUrl = "examples/";

const examplePaths = collectSharedExamplePaths().filter((examplePath) => {
    const spec = loadSharedExampleSpec(examplePath);
    return !hasExternalDataUrl(spec);
});

describe("shared examples", () => {
    test.each(examplePaths)("initializes %s", async (examplePath) => {
        expect(await initializeExample(examplePath)).toMatchSnapshot();
    });
});

/**
 * @param {string} examplePath
 */
async function initializeExample(examplePath) {
    const spec = loadSharedExampleSpec(examplePath);
    spec.baseUrl ??= curatedBaseUrl;

    const genomeStore = new GenomeStore(".");
    const { genomesByName, defaultAssembly } = resolveRootGenomeConfig(spec);
    genomeStore.configureGenomes(genomesByName, defaultAssembly);
    await ensureAssembliesForSpec(spec, genomeStore);

    const { view, context } = await createHeadlessEngine(spec, {
        contextOptions: {
            genomeStore,
            viewFactoryOptions: {
                wrapRoot: true,
                allowImport: false,
            },
        },
    });

    return {
        assemblies: Array.from(context.genomeStore.genomes.keys()).sort(),
        hierarchy: summarizeView(view),
        dataSources: Array.from(
            context.dataFlow.dataSources,
            summarizeDataSource
        ).sort(compareDataSources),
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
 * @param {GenomeStore} genomeStore
 */
async function ensureAssembliesForSpec(spec, genomeStore) {
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

    await genomeStore.ensureAssemblies(Array.from(assemblies.values()));
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
