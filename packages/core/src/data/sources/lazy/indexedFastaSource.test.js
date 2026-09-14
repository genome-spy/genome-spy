import { beforeEach, describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import IndexedFastaSource from "./indexedFastaSource.js";

/** @type {{ fasta: string, fai: string }[]} */
const openedFiles = [];

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@gmod/indexedfasta", () => ({
    IndexedFasta: class IndexedFasta {
        /** @param {{ fasta: { url: string }, fai: { url: string } }} options */
        constructor(options) {
            openedFiles.push({
                fasta: options.fasta.url,
                fai: options.fai.url,
            });
        }

        async getSequence() {
            return "ACGT";
        }
    },
}));

describe("IndexedFastaSource", () => {
    beforeEach(() => {
        openedFiles.length = 0;
    });

    test("replaces the handle once with grouped template and index changes", async () => {
        const view = createViewStub();
        const source = new IndexedFastaSource(
            {
                type: "indexedFasta",
                url: {
                    template: "references/{sample}.fa",
                    values: { expr: "samples" },
                    field: "sample",
                },
                indexUrl: { expr: "faiUrl" },
                debounce: 0,
            },
            /** @type {any} */ (view)
        );
        await /** @type {any} */ (source).initializedPromise;
        openedFiles.length = 0;

        view.paramRuntime.runInTransaction(() => {
            view.setSamples(["B"]);
            view.setIndexUrl("references/B.fa.fai");
        });
        await view.paramRuntime.whenPropagated();
        await /** @type {any} */ (source).initializedPromise;

        expect(openedFiles).toEqual([
            {
                fasta: "https://example.org/spec/references/B.fa",
                fai: "https://example.org/spec/references/B.fa.fai",
            },
        ]);
    });
});

function createViewStub() {
    /** @type {any} */
    let scaleResolution;
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setSamples = paramRuntime.allocateSetter("samples", ["A"]);
    const setIndexUrl = paramRuntime.allocateSetter(
        "faiUrl",
        "references/A.fa.fai"
    );
    const scale = /** @type {any} */ (
        /** @returns {undefined} */ () => undefined
    );
    scale.type = "locus";
    scale.genome = () => ({
        totalSize: 1000,
        continuousToDiscreteChromosomeIntervals:
            /** @returns {any[]} */ () => [],
    });
    scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
        removeEventListener: /** @returns {undefined} */ () => undefined,
        getDomain: () => [0, 10000],
        getScale: () => scale,
    };

    return {
        paramRuntime,
        setSamples,
        setIndexUrl,
        getBaseUrl: () => "https://example.org/spec/",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
            removeBroadcastListener: /** @returns {undefined} */ () =>
                undefined,
            dataFlow: { loadingStatusRegistry: { set: vi.fn() } },
        },
    };
}
