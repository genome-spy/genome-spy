import Mark from "./mark.js";
import { fixCoveragePositional, fixHalfOpenRangedText } from "./markUtils.js";
import { primaryPositionalChannels } from "../encoder/encoder.js";
import { requestFont } from "../fonts/textMetrics.js";

/** @extends {Mark<import("../spec/mark.js").TextProps>} */
export default class TextMark extends Mark {
    /** @param {import("../view/unitView.js").default} unitView */
    constructor(unitView) {
        super(unitView);
        this.font = requestFont(unitView.context.fontManager, this.properties);
        this.setupExprRefsNeedingGraphicsUpdate([
            "text",
            "fitToBand",
            "logoLetters",
        ]);
    }

    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "size",
            "text",
            "angle",
        ];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        for (const channel of primaryPositionalChannels) {
            if (this.properties.fitToBand) {
                fixCoveragePositional(encoding, channel);
            } else {
                fixHalfOpenRangedText(encoding, channel);
            }
        }
        return encoding;
    }
}
