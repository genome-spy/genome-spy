import { describe, expect, test } from "vitest";

import GenomeStore from "./src/genome/genomeStore.js";
import { resolveRootGenomeConfig } from "./src/genome/rootGenomeConfig.js";
import { createHeadlessEngine } from "./src/genomeSpy/headlessBootstrap.js";
import UrlSource from "./src/data/sources/urlSource.js";
import UnitView from "./src/view/unitView.js";
import {
    collectSharedExamplePaths,
    loadSharedExampleSpec,
} from "./src/spec/exampleFiles.js";

const curatedBaseUrl = "examples/";

const examplePaths = collectSharedExamplePaths().filter((examplePath) => {
    const spec = loadSharedExampleSpec(examplePath);
    return !requiresExternalLoading(spec);
});

describe("shared examples", () => {
    test.each(examplePaths)("initializes %s", async (examplePath) => {
        const { view } = await initializeExample(examplePath);

        expect(
            view.getDescendants().some((child) => child instanceof UnitView)
        ).toBe(true);
    });

    test("expands repeated templates into named tracks", async () => {
        const { view } = await initializeExample(
            "examples/core/config/config-imported-track.json"
        );

        expect(view.children.map((child) => child.name)).toEqual([
            "track-a",
            "track-b",
        ]);
    });

    test("resolves relative data URLs from the curated base URL", async () => {
        const { context } = await initializeExample("examples/core/first.json");

        expect(
            context.dataFlow.dataSources.some(
                (source) =>
                    source instanceof UrlSource &&
                    source.params.url === "data/sincos.csv" &&
                    source.baseUrl === curatedBaseUrl
            )
        ).toBe(true);
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

    return createHeadlessEngine(spec, {
        contextOptions: {
            genomeStore,
            viewFactoryOptions: {
                wrapRoot: true,
                allowImport: false,
            },
        },
    });
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
 * Exclude examples that require network access or URL imports from the offline
 * initialization suite, which deliberately disables external view loading.
 *
 * @param {any} node
 */
function requiresExternalLoading(node) {
    let foundExternalLoading = false;

    visitSpec(node, (currentNode) => {
        if (
            foundExternalLoading ||
            !currentNode ||
            typeof currentNode !== "object"
        ) {
            return;
        }

        if (
            isAbsoluteHttpUrl(currentNode.url) ||
            typeof currentNode.import?.url === "string"
        ) {
            foundExternalLoading = true;
        } else if (
            currentNode.name === "url" &&
            (isAbsoluteHttpUrl(currentNode.value) ||
                currentNode.bind?.options?.some(isAbsoluteHttpUrl))
        ) {
            foundExternalLoading = true;
        }
    });

    return foundExternalLoading;
}

/**
 * @param {unknown} value
 */
function isAbsoluteHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//.test(value);
}
