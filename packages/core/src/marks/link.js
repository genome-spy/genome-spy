import Mark from "./mark.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";

/** @extends {Mark<import("../spec/mark.js").LinkProps>} */
export default class LinkMark extends Mark {
    /** @returns {import("./mark.js").HitTestMode} */
    get defaultHitTestMode() {
        return "endpoints";
    }

    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        if (!encoding.x2) {
            if (isChannelDefWithScale(encoding.x)) {
                encoding.x2 = { datum: 0.0 };
            } else {
                encoding.x2 = encoding.x;
            }
        }

        if (!encoding.y2) {
            if (isChannelDefWithScale(encoding.y)) {
                encoding.y2 = { datum: 0.0 };
            } else {
                encoding.y2 = encoding.y;
            }
        }

        return encoding;
    }
}
