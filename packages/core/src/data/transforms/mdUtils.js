/**
 * @typedef {object} MdMismatchEvent
 * @prop {"mismatch"} type
 * @prop {number} refOffset
 * @prop {string} refBase
 *
 * @typedef {object} MdDeletionEvent
 * @prop {"deletion"} type
 * @prop {number} refOffset
 * @prop {string} refBases
 *
 * @typedef {MdMismatchEvent | MdDeletionEvent} MdEvent
 */

const digitPattern = /[0-9]/;
const basePattern = /[A-Z]/;

/**
 * MD tag parsing follows SAMtags, section 1.7:
 * https://samtools.github.io/hts-specs/SAMtags.pdf
 *
 * MD numbers advance over reference matches, letters mark mismatching reference
 * bases, and "^" marks deleted reference bases.
 *
 * @param {string} md
 * @returns {MdEvent[]}
 */
export function parseMdTag(md) {
    if (typeof md !== "string" || md.length == 0) {
        throw new Error(`Malformed MD tag: ${JSON.stringify(md)}`);
    }

    /** @type {MdEvent[]} */
    const events = [];
    let index = 0;
    let refOffset = 0;

    while (index < md.length) {
        if (!digitPattern.test(md[index])) {
            throw new Error(`Malformed MD tag: ${md}`);
        }

        const countStart = index;
        while (index < md.length && digitPattern.test(md[index])) {
            index++;
        }
        refOffset += Number(md.slice(countStart, index));

        if (index < md.length) {
            if (md[index] == "^") {
                index++;
                const deletionStart = index;
                while (index < md.length && basePattern.test(md[index])) {
                    index++;
                }
                if (index == deletionStart) {
                    throw new Error(`Malformed MD tag: ${md}`);
                }

                const refBases = md.slice(deletionStart, index);
                events.push({ type: "deletion", refOffset, refBases });
                refOffset += refBases.length;
            } else if (basePattern.test(md[index])) {
                events.push({
                    type: "mismatch",
                    refOffset,
                    refBase: md[index],
                });
                index++;
                refOffset++;
            } else {
                throw new Error(`Malformed MD tag: ${md}`);
            }

            if (index == md.length) {
                throw new Error(`Malformed MD tag: ${md}`);
            }
        }
    }

    return events;
}
