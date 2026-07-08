import { field } from "../../utils/field.js";
import { createCachedCloner } from "../../utils/cloner.js";
import { BEHAVIOR_CLONES } from "../flowNode.js";
import { walkCigar } from "./cigarUtils.js";
import { parseMdTag } from "./mdUtils.js";
import Transform from "./transform.js";

export default class AlignmentMismatchesTransform extends Transform {
    get behavior() {
        return BEHAVIOR_CLONES;
    }

    /**
     * @param {import("../../spec/transform.js").AlignmentMismatchesParams} params
     */
    constructor(params) {
        super(params);

        const startAccessor = field(params.start ?? "start");
        const cigarAccessor = field(params.cigar ?? "cigar");
        const sequenceAccessor = field(params.sequence ?? "seq");
        const qualityAccessor = field(params.quality ?? "qual");
        const mdAccessor = field(params.md ?? "md");
        const clone = createCachedCloner({ copyFields: params.copyFields });

        /** @param {Record<string, any>} datum */
        this.handle = (datum) => {
            const cigar = cigarAccessor(datum);
            if (typeof cigar !== "string" || cigar.length == 0) {
                throw new Error(
                    `Malformed CIGAR string: ${JSON.stringify(cigar)}`
                );
            } else if (cigar == "*") {
                return;
            }

            const start = startAccessor(datum);
            if (!Number.isFinite(start)) {
                throw new Error(`Invalid CIGAR start coordinate: ${start}`);
            }

            const md = accessOptional(mdAccessor, datum);
            if (typeof md !== "string" || md.length == 0) {
                throw new Error("alignmentMismatches requires the MD tag");
            }

            const mismatchEvents = new Map(
                parseMdTag(md)
                    .filter((event) => event.type == "mismatch")
                    .map((event) => [event.refOffset, event.refBase])
            );
            const sequence = accessOptional(sequenceAccessor, datum);
            const quality = accessOptional(qualityAccessor, datum);

            for (const operation of walkCigar(cigar, start)) {
                if (operation.cigarOp == "M") {
                    for (const [refOffset, refBase] of mismatchEvents) {
                        const mismatchStart = start + refOffset;
                        if (
                            mismatchStart >= operation.cigarStart &&
                            mismatchStart < operation.cigarEnd
                        ) {
                            const readOffset =
                                operation.readStart +
                                (mismatchStart - operation.cigarStart);
                            this.#emitMismatch(
                                datum,
                                sequence,
                                quality,
                                mismatchStart,
                                readOffset,
                                refBase,
                                clone
                            );
                        }
                    }
                } else if (operation.cigarOp == "X") {
                    for (let i = 0; i < operation.cigarLength; i++) {
                        const mismatchStart = operation.cigarStart + i;
                        const refOffset = mismatchStart - start;
                        const refBase = mismatchEvents.get(refOffset);
                        if (refBase == undefined) {
                            throw new Error(
                                "MD tag does not provide a reference base for X operation"
                            );
                        }

                        this.#emitMismatch(
                            datum,
                            sequence,
                            quality,
                            mismatchStart,
                            operation.readStart + i,
                            refBase,
                            clone
                        );
                    }
                }
            }
        };
    }

    /**
     * @param {Record<string, any>} datum
     * @param {unknown} sequence
     * @param {unknown} quality
     * @param {number} mismatchStart
     * @param {number} readOffset
     * @param {string} refBase
     * @param {(datum: Record<string, any>) => Record<string, any>} clone
     */
    #emitMismatch(
        datum,
        sequence,
        quality,
        mismatchStart,
        readOffset,
        refBase,
        clone
    ) {
        if (typeof sequence !== "string") {
            throw new Error("alignmentMismatches requires read sequence");
        }

        const base = sequence[readOffset];
        if (typeof base !== "string") {
            throw new Error(
                `Read sequence is too short for mismatch offset: ${readOffset}`
            );
        }

        const mismatch = Object.assign(clone(datum), {
            mismatchStart,
            mismatchEnd: mismatchStart + 1,
            readOffset,
            base,
            refBase,
        });

        if (Array.isArray(quality) && quality[readOffset] != undefined) {
            mismatch.baseQuality = quality[readOffset];
        }

        this._propagate(mismatch);
    }
}

/**
 * @param {(datum: Record<string, any>) => unknown} accessor
 * @param {Record<string, any>} datum
 * @returns {unknown}
 */
function accessOptional(accessor, datum) {
    try {
        return accessor(datum);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith("Invalid field")
        ) {
            return undefined;
        } else {
            throw error;
        }
    }
}
