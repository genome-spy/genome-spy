import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import BamSource, { createBamReadDatum, createTagFields } from "./bamSource.js";

/** @type {{ chrom: string, start: number, end: number }[]} */
const requestedIntervals = [];
/** @type {{ bam: string, bai: string }[]} */
const openedFiles = [];

vi.mock("generic-filehandle2", () => ({
    RemoteFile: class RemoteFile {
        /** @param {string} url */
        constructor(url) {
            this.url = url;
        }
    },
}));

vi.mock("@gmod/bam", () => ({
    BamFile: class BamFile {
        indexToChr = [{ refName: "chr1" }];

        /** @param {{ bamFilehandle: { url: string }, baiFilehandle: { url: string } }} options */
        constructor(options) {
            openedFiles.push({
                bam: options.bamFilehandle.url,
                bai: options.baiFilehandle.url,
            });
        }

        async getHeader() {
            return {};
        }

        /**
         * @param {string} chrom
         * @param {number} start
         * @param {number} end
         * @returns {Promise<import("@gmod/bam").BamRecord[]>}
         */
        async getRecordsForRange(chrom, start, end) {
            requestedIntervals.push({ chrom, start, end });
            return [];
        }
    },
}));

/**
 * @typedef {object} FakeBamRecord
 * @prop {number} start
 * @prop {number} end
 * @prop {string} name
 * @prop {string} CIGAR
 * @prop {number | undefined} mq
 * @prop {number} strand
 * @prop {string} seq
 * @prop {Uint8Array | undefined} qual
 * @prop {number} flags
 * @prop {(tag: string) => string | undefined} getTag
 * @prop {() => boolean} isPaired
 * @prop {() => boolean} isProperlyPaired
 * @prop {() => boolean} isDuplicate
 * @prop {() => boolean} isFailedQc
 * @prop {() => boolean} isSecondary
 * @prop {() => boolean} isSupplementary
 */

/**
 * @param {string} chrom
 * @param {FakeBamRecord} record
 * @param {[string, string][]} [tagFields]
 */
function createDatum(chrom, record, tagFields) {
    return createBamReadDatum(
        chrom,
        /** @type {import("@gmod/bam").BamRecord} */ (
            /** @type {unknown} */ (record)
        ),
        tagFields
    );
}

/**
 * @param {number} initialWindowSize
 */
function createViewStub(initialWindowSize = 300) {
    /** @type {any} */
    let scaleResolution;
    const paramRuntime = new ViewParamRuntime(
        () => undefined,
        () => scaleResolution
    );
    const setWindowSize = paramRuntime.allocateSetter(
        "windowSize",
        initialWindowSize
    );
    const setUrl = paramRuntime.allocateSetter("bamUrl", "reads.bam");
    const setIndexUrl = paramRuntime.allocateSetter("baiUrl", "reads.bai");

    const scale = /** @type {any} */ (
        /** @returns {undefined} */ () => undefined
    );
    scale.type = "locus";
    scale.genome = () => ({
        totalSize: 1000,
        hasChrPrefix: () => true,
        continuousToDiscreteChromosomeIntervals: (
            /** @type {number[]} */ interval
        ) => [
            {
                chrom: "chr1",
                startPos: interval[0],
                endPos: interval[1],
            },
        ],
    });

    scaleResolution = {
        addEventListener: /** @returns {undefined} */ () => undefined,
        removeEventListener: /** @returns {undefined} */ () => undefined,
        getDomain: () => [0, 200],
        getScale: () => scale,
    };

    return {
        paramRuntime,
        setWindowSize,
        setUrl,
        setIndexUrl,
        getBaseUrl: () => "https://example.org/spec/",
        getScaleResolution: () => scaleResolution,
        isVisible: () => true,
        context: {
            addBroadcastListener: /** @returns {undefined} */ () => undefined,
            removeBroadcastListener: /** @returns {undefined} */ () =>
                undefined,
            dataFlow: {
                loadingStatusRegistry: {
                    set: /** @returns {undefined} */ () => undefined,
                },
            },
        },
    };
}

describe("BamSource", () => {
    beforeEach(() => {
        requestedIntervals.length = 0;
        openedFiles.length = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test("reloads when expression-driven window size changes", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("window", {
            setTimeout,
            clearTimeout,
        });

        const view = createViewStub(100);
        const source = new BamSource(
            {
                type: "bam",
                url: "reads.bam",
                debounce: 0,
                windowSize: { expr: "windowSize" },
            },
            /** @type {any} */ (view)
        );

        const domainChange = source.onDomainChanged([0, 200]);
        await vi.runAllTimersAsync();
        await domainChange;
        await Promise.resolve();

        expect(requestedIntervals).toEqual([]);

        view.setWindowSize(300);
        await Promise.resolve();
        await Promise.resolve();
        await vi.runAllTimersAsync();
        await Promise.resolve();

        expect(requestedIntervals).toEqual([
            { chrom: "chr1", start: 0, end: 300 },
        ]);
    });

    test("replaces the handle once with a grouped URL pair", async () => {
        const view = createViewStub();
        const source = new BamSource(
            {
                type: "bam",
                url: { expr: "bamUrl" },
                indexUrl: { expr: "baiUrl" },
                debounce: 0,
                debounceMode: "window",
                windowSize: 100,
            },
            /** @type {any} */ (view)
        );
        openedFiles.length = 0;

        view.paramRuntime.runInTransaction(() => {
            view.setUrl("other.bam");
            view.setIndexUrl("other.bai");
        });
        await view.paramRuntime.whenPropagated();
        await source.requestInterval([0, 100]);

        expect(openedFiles).toEqual([
            {
                bam: "https://example.org/spec/other.bam",
                bai: "https://example.org/spec/other.bai",
            },
        ]);
    });

    test("maps a BAM record to a read-level datum", () => {
        /** @type {FakeBamRecord} */
        const record = {
            start: 100,
            end: 125,
            name: "read1",
            CIGAR: "10M2I13M",
            mq: 60,
            strand: 1,
            seq: "ACGT",
            qual: Uint8Array.from([30, 31, 32, 33]),
            flags: 99,
            getTag: (tag) => (tag == "MD" ? "10A13" : undefined),
            isPaired: () => true,
            isProperlyPaired: () => true,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createDatum("chr1", record)).toEqual({
            chrom: "chr1",
            start: 100,
            end: 125,
            name: "read1",
            cigar: "10M2I13M",
            mapq: 60,
            strand: "+",
            seq: "ACGT",
            qual: [30, 31, 32, 33],
            md: "10A13",
            flags: 99,
            isPaired: true,
            isProperPair: true,
            isDuplicate: false,
            isQcFail: false,
            isSecondary: false,
            isSupplementary: false,
        });
    });

    test("maps reverse strand and missing mapping quality", () => {
        /** @type {FakeBamRecord} */
        const record = {
            start: 50,
            end: 60,
            name: "read2",
            CIGAR: "10M",
            mq: undefined,
            strand: -1,
            seq: "ACGT",
            qual: undefined,
            flags: 16,
            getTag: () => undefined,
            isPaired: () => false,
            isProperlyPaired: () => false,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createDatum("chr2", record)).toMatchObject({
            chrom: "chr2",
            mapq: undefined,
            strand: "-",
            qual: undefined,
            md: undefined,
            flags: 16,
            isPaired: false,
        });
    });

    test("normalizes empty BAM CIGAR to SAM unavailable CIGAR", () => {
        /** @type {FakeBamRecord} */
        const record = {
            start: 50,
            end: 50,
            name: "read-without-cigar",
            CIGAR: "",
            mq: undefined,
            strand: 1,
            seq: "",
            qual: undefined,
            flags: 4,
            getTag: () => undefined,
            isPaired: () => false,
            isProperlyPaired: () => false,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        expect(createDatum("chr1", record)).toMatchObject({
            cigar: "*",
        });
    });

    test("copies requested SAM tags as tag_ fields", () => {
        /** @type {Record<string, string | number>} */
        const tags = { MD: "10", HP: 1, CB: "AACGT" };
        /** @type {FakeBamRecord} */
        const record = {
            start: 50,
            end: 60,
            name: "read3",
            CIGAR: "10M",
            mq: 60,
            strand: 1,
            seq: "ACGT",
            qual: undefined,
            flags: 0,
            getTag: (tag) => /** @type {any} */ (tags[tag]),
            isPaired: () => false,
            isProperlyPaired: () => false,
            isDuplicate: () => false,
            isFailedQc: () => false,
            isSecondary: () => false,
            isSupplementary: () => false,
        };

        const datum = createDatum(
            "chr1",
            record,
            createTagFields(["HP", "CB", "XX"])
        );

        expect(datum).toMatchObject({ tag_HP: 1, tag_CB: "AACGT" });
        // Missing tags still get a field so that all rows share a shape
        expect(datum).toHaveProperty("tag_XX", undefined);
        expect(createDatum("chr1", record)).not.toHaveProperty("tag_HP");
    });

    test("validates and deduplicates SAM tag names", () => {
        expect(createTagFields(undefined)).toEqual([]);
        expect(createTagFields(["HP", "HP"])).toEqual([["tag_HP", "HP"]]);
        expect(() => createTagFields(["H"])).toThrow(/Invalid SAM tag/);
        expect(() => createTagFields(["1A"])).toThrow(/Invalid SAM tag/);
        expect(() => createTagFields(/** @type {any} */ ("HP"))).toThrow(
            /must be an array/
        );
    });
});
