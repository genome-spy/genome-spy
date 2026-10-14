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
     * @param {import("../flowNode.js").ParamRuntimeProvider} [paramRuntimeProvider]
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        const startAccessor = this.createFieldAccessor(params, "start", {
            defaultValue: "start",
        });
        const cigarAccessor = this.createFieldAccessor(params, "cigar", {
            defaultValue: "cigar",
        });
        const sequenceAccessor = this.createFieldAccessor(params, "sequence", {
            defaultValue: "seq",
        });
        const qualityAccessor = this.createFieldAccessor(params, "quality", {
            defaultValue: "qual",
        });
        const mdAccessor = this.createFieldAccessor(params, "md", {
            defaultValue: "md",
        });
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

            const md = mdAccessor(datum);
            if (typeof md !== "string" || md.length == 0) {
                throw new Error("alignmentMismatches requires the MD tag");
            }

            const mismatchEvents = new Map(
                parseMdTag(md)
                    .filter((event) => event.type == "mismatch")
                    .map((event) => [event.refOffset, event.refBase])
            );
            const quality = accessOptional(qualityAccessor, datum);

            // TODO: Avoid scanning all MD mismatch events for every M operation.
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
                                sequenceAccessor,
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
                            sequenceAccessor,
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

        /** @param {import("../../types/flowBatch.js").FlowBatch} flowBatch */
        this.beginBatch = (flowBatch) => {
            clone.reset();
            super.beginBatch(flowBatch);
        };
    }

    /**
     * @param {Record<string, any>} datum
     * @param {(datum: Record<string, any>) => unknown} sequenceAccessor
     * @param {unknown} quality
     * @param {number} mismatchStart
     * @param {number} readOffset
     * @param {string} refBase
     * @param {(datum: Record<string, any>) => Record<string, any>} clone
     */
    #emitMismatch(
        datum,
        sequenceAccessor,
        quality,
        mismatchStart,
        readOffset,
        refBase,
        clone
    ) {
        const sequence = sequenceAccessor(datum);
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
