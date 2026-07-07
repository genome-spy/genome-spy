/**
 * @typedef {"M" | "I" | "D" | "N" | "S" | "H" | "P" | "=" | "X"} CigarOp
 *
 * @typedef {object} CigarOperation
 * @prop {CigarOp} op
 * @prop {number} length
 *
 * @typedef {object} CigarOperationLayout
 * @prop {CigarOp} cigarOp
 * @prop {number} cigarLength
 * @prop {number} cigarStart
 * @prop {number} cigarEnd
 * @prop {number} readStart
 * @prop {number} readEnd
 * @prop {"aligned" | "insertion" | "deletion" | "skip" | "softClip" | "hardClip" | "padding"} cigarType
 *
 * @typedef {object} CigarOperationSemantics
 * @prop {boolean} consumesQuery
 * @prop {boolean} consumesReference
 * @prop {CigarOperationLayout["cigarType"]} cigarType
 */

/**
 * CIGAR operation parsing follows SAMv1, section 1.4 and the CIGAR operation
 * table: https://samtools.github.io/hts-specs/SAMv1.pdf
 *
 * Keep this table aligned with the spec's query/reference consumption rules.
 *
 * @type {Record<CigarOp, CigarOperationSemantics>}
 */
const operationSemantics = {
    M: { consumesQuery: true, consumesReference: true, cigarType: "aligned" },
    I: {
        consumesQuery: true,
        consumesReference: false,
        cigarType: "insertion",
    },
    D: {
        consumesQuery: false,
        consumesReference: true,
        cigarType: "deletion",
    },
    N: { consumesQuery: false, consumesReference: true, cigarType: "skip" },
    S: {
        consumesQuery: true,
        consumesReference: false,
        cigarType: "softClip",
    },
    H: {
        consumesQuery: false,
        consumesReference: false,
        cigarType: "hardClip",
    },
    P: {
        consumesQuery: false,
        consumesReference: false,
        cigarType: "padding",
    },
    "=": { consumesQuery: true, consumesReference: true, cigarType: "aligned" },
    X: { consumesQuery: true, consumesReference: true, cigarType: "aligned" },
};

const cigarPattern = /([0-9]+)([MIDNSHP=X])/g;

/**
 * Parses a SAM CIGAR string into operation-length pairs.
 *
 * @param {string} cigar
 * @returns {CigarOperation[]}
 */
export function parseCigar(cigar) {
    if (typeof cigar !== "string" || cigar.length == 0) {
        throw new Error(`Malformed CIGAR string: ${JSON.stringify(cigar)}`);
    }

    /** @type {CigarOperation[]} */
    const operations = [];
    let consumedLength = 0;
    let match;
    cigarPattern.lastIndex = 0;

    while ((match = cigarPattern.exec(cigar)) !== null) {
        if (match.index !== consumedLength) {
            throw new Error(`Malformed CIGAR string: ${cigar}`);
        }

        const length = Number(match[1]);
        if (length <= 0) {
            throw new Error(`Malformed CIGAR string: ${cigar}`);
        }

        operations.push({
            op: /** @type {CigarOp} */ (match[2]),
            length,
        });
        consumedLength = cigarPattern.lastIndex;
    }

    if (consumedLength !== cigar.length) {
        throw new Error(`Malformed CIGAR string: ${cigar}`);
    }

    return operations;
}

/**
 * Walks a CIGAR string from a 0-based reference start position.
 *
 * @param {string} cigar
 * @param {number} start
 * @returns {Generator<CigarOperationLayout>}
 */
export function* walkCigar(cigar, start) {
    if (!Number.isFinite(start)) {
        throw new Error(`Invalid CIGAR start coordinate: ${start}`);
    }

    let refPos = start;
    let readPos = 0;

    for (const { op, length } of parseCigar(cigar)) {
        const semantics = operationSemantics[op];
        const cigarStart = refPos;
        const readStart = readPos;

        if (semantics.consumesReference) {
            refPos += length;
        }
        if (semantics.consumesQuery) {
            readPos += length;
        }

        yield {
            cigarOp: op,
            cigarLength: length,
            cigarStart,
            cigarEnd: refPos,
            readStart,
            readEnd: readPos,
            cigarType: semantics.cigarType,
        };
    }
}
