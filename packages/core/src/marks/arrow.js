import Mark from "./mark.js";
import { fixFill, fixStroke } from "./markUtils.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";
import { fixRuleLikeEncoding } from "./ruleLikeEncoding.js";

/** @extends {Mark<import("../spec/mark.js").ArrowProps>} */
export default class ArrowMark extends Mark {
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
            "size",
            "direction",
        ];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        fixRuleLikeEncoding(encoding, "arrow");

        if (!encoding.size && isRelativeSize(this.properties.size)) {
            encoding.size = createRelativeSizeDef(
                this.properties.size,
                this.properties.size.channel ?? "auto",
                encoding
            );
        }

        fixStroke(encoding, this.properties.filled);
        fixFill(encoding, this.properties.filled);

        delete encoding.color;
        delete encoding.opacity;

        return encoding;
    }
}

/**
 * @param {unknown} value
 * @returns {value is {band: number, channel?: "x" | "y" | "auto"}}
 */
function isRelativeSize(value) {
    return (
        typeof value == "object" &&
        value !== null &&
        "band" in value &&
        typeof value.band == "number"
    );
}

/**
 * @param {{band: number, channel?: "x" | "y" | "auto"}} size
 * @param {"x" | "y" | "auto"} referenceChannel
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function createRelativeSizeDef(size, referenceChannel, encoding) {
    const channel = getSizeReferenceChannel(referenceChannel, encoding);
    const dimension = channel == "x" ? "width" : "height";
    const channelDef = encoding[channel];
    const referenceExpr =
        isChannelDefWithScale(channelDef) && channelDef.scale !== null
            ? `bandwidth("${channel}") * ${dimension}`
            : dimension;

    return /** @type {const} */ ({
        value: { expr: `${referenceExpr} * ${size.band}` },
    });
}

/**
 * @param {"x" | "y" | "auto"} channel
 * @param {import("../spec/channel.js").Encoding} encoding
 */
function getSizeReferenceChannel(channel, encoding) {
    if (channel == "auto") {
        return inferPerpendicularChannel(encoding);
    } else if (isDiagonalCapable(encoding)) {
        throw new Error(
            "Band-relative arrow size is not supported for diagonal arrows."
        );
    } else {
        return channel;
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {"x" | "y"}
 */
function inferPerpendicularChannel(encoding) {
    if (isDiagonalCapable(encoding)) {
        throw new Error(
            "Band-relative arrow size is not supported for diagonal arrows."
        );
    } else if (isXAligned(encoding)) {
        return "y";
    } else {
        return "x";
    }
}

/** @param {import("../spec/channel.js").Encoding} encoding */
function isDiagonalCapable(encoding) {
    return isXAligned(encoding) && isYAligned(encoding);
}

/** @param {import("../spec/channel.js").Encoding} encoding */
function isXAligned(encoding) {
    return encoding.x2 != null && encoding.x2 !== encoding.x;
}

/** @param {import("../spec/channel.js").Encoding} encoding */
function isYAligned(encoding) {
    return encoding.y2 != null && encoding.y2 !== encoding.y;
}
