import FlatQueue from "flatqueue";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import { UNIQUE_ID_KEY } from "./identifier.js";
import Transform from "./transform.js";

/** @typedef {import("../../spec/channel.js").Scalar} Category */
/** @typedef {import("../../types/flowBatch.js").FlowBatch} FlowBatch */
/** @typedef {import("../flowNode.js").Datum} Datum */

const OUTPUT_FIELDS = ["chrom", "start", "end", "category", "count", "total"];

export default class CategoricalCoverageTransform extends Transform {
    /** @type {FlatQueue<Category>} */
    #ends = new FlatQueue();

    /** @type {Map<Category, number>} */
    #counts = new Map();

    /** @type {Map<Category, number>} */
    #changes = new Map();

    /** @type {string | undefined} */
    #chrom;

    /** @type {Set<string>} */
    #chromosomes = new Set();

    /** @type {import("../outputGrouping.js").OutputGrouping} */
    #outputGrouping;

    #position = -Infinity;
    #spanStart = 0;
    #total = 0;

    get behavior() {
        return BEHAVIOR_CLONES;
    }

    get createsNewIdentity() {
        return true;
    }

    get outputGrouping() {
        return this.#outputGrouping;
    }

    /**
     * @param {import("../../spec/transform.js").CategoricalCoverageParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} [view]
     */
    constructor(params, view) {
        super(params, view);
        this.chrom = params.chrom
            ? this.createFieldAccessor(params, "chrom")
            : undefined;
        this.start = this.createFieldAccessor(params, "start");
        this.end = this.createFieldAccessor(params, "end");
        this.category = this.createFieldAccessor(params, "category");

        const as = params.as ?? ["category", "count", "total"];
        if (!Array.isArray(as) || as.length !== 3) {
            throw new Error(
                "categoricalCoverage as requires three output names for the category, count, and total."
            );
        }

        const output = {
            ...(params.chrom ? { chrom: params.asChrom ?? params.chrom } : {}),
            start: params.asStart ?? params.start,
            end: params.asEnd ?? params.end,
            category: as[0],
            count: as[1],
            total: as[2],
        };
        const names = Object.values(output);
        if (
            new Set(names).size !== names.length ||
            names.some(
                (name) =>
                    typeof name !== "string" || !name || name === UNIQUE_ID_KEY
            )
        ) {
            throw new Error(
                `categoricalCoverage output field names must be distinct and nonempty, excluding ${UNIQUE_ID_KEY}.`
            );
        }

        const spanKey = output.chrom
            ? [output.chrom, output.start, output.end]
            : [output.start, output.end];
        this.#outputGrouping = {
            keys: [spanKey, [output.chrom ?? output.start]],
            fileFree: true,
        };

        // Compile the output names once so each span row has a fixed shape.
        const fields = Object.entries(output).map(
            ([field, name]) => `[${JSON.stringify(name)}]: ${field}`
        );
        this.createSegment =
            /** @type {(chrom: string | undefined, start: number, end: number, category: Category, count: number, total: number) => Datum} */ (
                new Function(...OUTPUT_FIELDS, `return {${fields.join(", ")}};`)
            );
    }

    reset() {
        super.reset();
        this.#ends.clear();
        this.#counts.clear();
        this.#changes.clear();
        this.#total = 0;
        this.#resetFacet();
    }

    /** @param {FlowBatch} batch */
    beginBatch(batch) {
        if (batch.type === "file") return;
        this.#advanceTo(Infinity);
        this.#resetFacet();
        super.beginBatch(batch);
    }

    complete() {
        this.#advanceTo(Infinity);
        super.complete();
    }

    /** @param {Datum} datum */
    handle(datum) {
        const category = this.category(datum);
        if (category == null) return;
        if (
            typeof category !== "string" &&
            typeof category !== "boolean" &&
            !Number.isFinite(category)
        ) {
            throw new Error(
                "categoricalCoverage category must be a string, boolean, finite number, or null."
            );
        }

        const chrom = this.chrom?.(datum);
        const start = this.start(datum);
        const end = this.end(datum);
        if (
            (this.chrom && typeof chrom !== "string") ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            start >= end
        ) {
            throw new Error(
                "categoricalCoverage requires valid half-open intervals."
            );
        }

        if (chrom !== this.#chrom) {
            if (this.#chromosomes.has(chrom)) {
                throw new Error(
                    "categoricalCoverage requires contiguous chromosomes."
                );
            }
            this.#advanceTo(Infinity);
            this.#chrom = chrom;
            this.#chromosomes.add(chrom);
            this.#position = -Infinity;
        }
        if (start < this.#position) {
            throw new Error(
                "categoricalCoverage requires start-sorted intervals."
            );
        }

        this.#advanceTo(start);
        addCount(this.#changes, category, 1);
        this.#ends.push(category, end);
    }

    #resetFacet() {
        this.#chrom = undefined;
        this.#chromosomes.clear();
        this.#position = -Infinity;
    }

    /**
     * Commit each earlier coordinate, then queue ends at the target together
     * with the starts that arrive there. Infinity drains the chromosome.
     * @param {number} position
     */
    #advanceTo(position) {
        while (this.#position < position) {
            this.#commitChanges();
            const nextEnd = this.#ends.peekValue() ?? Infinity;
            this.#position = Math.min(position, nextEnd);
            while (this.#ends.peekValue() === this.#position) {
                addCount(this.#changes, this.#ends.pop(), -1);
            }
        }
    }

    #commitChanges() {
        if (!this.#changes.size) return;

        const chrom = this.#chrom;
        const start = this.#spanStart;
        const end = this.#position;
        const total = this.#total;
        for (const [category, count] of this.#counts) {
            this._propagate(
                this.createSegment(chrom, start, end, category, count, total)
            );
        }

        for (const [category, change] of this.#changes) {
            addCount(this.#counts, category, change);
            this.#total += change;
        }
        this.#changes.clear();
        this.#spanStart = this.#position;
    }
}

/**
 * @param {Map<Category, number>} counts
 * @param {Category} category
 * @param {number} change
 */
function addCount(counts, category, change) {
    const count = (counts.get(category) ?? 0) + change;
    if (count) counts.set(category, count);
    else counts.delete(category);
}
