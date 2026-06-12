import { describe, expect, it, vi } from "vitest";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BigBedSource from "./bigBedSource.js";

/** @type {string[]} */
const openedUrls = [];

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
            openedUrls.push(url);
        }
    },
}));

vi.mock("@gmod/bed", () => ({
    default: class Bed {
        parseLine() {
            return {};
        }
    },
}));

vi.mock("@gmod/bbi", () => ({
    BigBed: class BigBed {
        /** @param {{ filehandle: { url: string } }} options */
        constructor(options) {
            this.url = options.filehandle.url;
        }

        async getHeader() {
            return /** @type {{ autoSql: any }} */ ({ autoSql: undefined });
        }
    },
}));

function createViewStub() {
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
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

    /** @type {any} */
    const scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
        getDomain: () => [0, 100],
        getScale: () => scale,
    };

    return {
        paramRuntime,
        getBaseUrl: () => "https://example.org/spec/",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
            dataFlow: {
                loadingStatusRegistry: {
                    set: /** @returns {undefined} */ () => undefined,
                },
            },
        },
    };
}

describe("BigBedSource", () => {
    it("opens a single normalized URL descriptor", async () => {
        openedUrls.length = 0;
        const source = new BigBedSource(
            {
                type: "bigbed",
                url: { url: "features.bb" },
            },
            /** @type {any} */ (createViewStub())
        );

        await /** @type {any} */ (source).initializedPromise;

        expect(openedUrls).toEqual(["https://example.org/spec/features.bb"]);
    });

    it("rejects multiple resolved URLs explicitly", async () => {
        const source = new BigBedSource(
            {
                type: "bigbed",
                url: ["a.bb", "b.bb"],
            },
            /** @type {any} */ (createViewStub())
        );

        await expect(
            /** @type {any} */ (source).initializedPromise
        ).rejects.toThrow("BigBedSource supports exactly one resolved URL.");
    });
});
