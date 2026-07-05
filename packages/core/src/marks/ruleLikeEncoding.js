import { isChannelDefWithScale } from "../encoder/encoder.js";

/**
 * Completes rule-like positional endpoints from partially specified x/y/x2/y2
 * encodings. Used by rule and arrow marks.
 *
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {string} markName
 * @returns {import("../spec/channel.js").Encoding}
 */
export function fixRuleLikeEncoding(encoding, markName) {
    if (encoding.x && encoding.y && encoding.x2 && encoding.y2) {
        // Everything is defined.
    } else if (encoding.x && encoding.x2 && !encoding.y) {
        encoding.y = { value: 0.5 };
        encoding.y2 = encoding.y;
    } else if (encoding.y && encoding.y2 && !encoding.x) {
        encoding.x = { value: 0.5 };
        encoding.x2 = encoding.x;
    } else if (encoding.x && !encoding.y) {
        encoding.y = { value: 0 };
        encoding.y2 = { value: 1 };
        encoding.x2 = encoding.x;
    } else if (encoding.y && !encoding.x) {
        encoding.x = { value: 0 };
        encoding.x2 = { value: 1 };
        encoding.y2 = encoding.y;
    } else if (encoding.x && encoding.y && encoding.y2) {
        encoding.x2 = encoding.x;
    } else if (encoding.y && encoding.x && encoding.x2) {
        encoding.y2 = encoding.y;
    } else if (encoding.y && encoding.x) {
        if (
            !encoding.x2 &&
            isChannelDefWithScale(encoding.y) &&
            encoding.y.type == "quantitative"
        ) {
            encoding.x2 = encoding.x;
            encoding.y2 = { datum: 0 };
        } else if (
            !encoding.y2 &&
            isChannelDefWithScale(encoding.x) &&
            encoding.x.type == "quantitative"
        ) {
            encoding.y2 = encoding.y;
            encoding.x2 = { datum: 0 };
        } else {
            throw new Error(
                `Cannot infer ${markName} mark's secondary position channel from the encoding: ` +
                    JSON.stringify(encoding)
            );
        }
    } else {
        throw new Error(
            `At a minimum, either the x or y channel must be defined in the ${markName} mark's encoding: ` +
                JSON.stringify(encoding)
        );
    }

    return encoding;
}
