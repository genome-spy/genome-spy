import Mark from "./mark.js";
import { fixCoveragePositional, fixFill, fixStroke } from "./markUtils.js";
import { isNestedDiscreteOffsetDef } from "../encoder/encoder.js";

/** @extends {Mark<import("../spec/mark.js").RectProps>} */
export default class RectMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [
            ...super.getSupportedChannels(),
            "x2",
            "y2",
            "fill",
            "stroke",
            "fillOpacity",
            "strokeOpacity",
            "strokeWidth",
        ];
    }

    /** @param {string} channel @returns {number} @protected */
    getOffsetBand(channel) {
        return channel == "x2Offset" || channel == "y2Offset" ? 1 : 0;
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        fixCoveragePositional(
            encoding,
            "x",
            isNestedDiscreteOffsetDef(encoding.xOffset)
        );
        fixCoveragePositional(
            encoding,
            "y",
            isNestedDiscreteOffsetDef(encoding.yOffset)
        );

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);
        delete encoding.color;
        delete encoding.opacity;
        return encoding;
    }
}
