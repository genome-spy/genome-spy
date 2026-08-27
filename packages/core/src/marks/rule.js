import Mark from "./mark.js";
import { isChannelDefWithScale } from "../encoder/encoder.js";
import { fixRuleLikeEncoding } from "./ruleLikeEncoding.js";

const HORIZONTAL = "horizontal";
const VERTICAL = "vertical";

/**
 * @extends {Mark<import("../spec/mark.js").RuleProps | import("../spec/mark.js").TickProps>}
 */
export default class RuleMark extends Mark {
    /** @returns {import("../spec/channel.js").Channel[]} */
    getSupportedChannels() {
        return [...super.getSupportedChannels(), "x2", "y2", "size"];
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixEncoding(encoding) {
        return this.getType() == "tick"
            ? this.fixTickEncoding(encoding)
            : fixRuleLikeEncoding(encoding, "rule");
    }

    /**
     * @param {import("../spec/channel.js").Encoding} encoding
     * @returns {import("../spec/channel.js").Encoding}
     */
    fixTickEncoding(encoding) {
        const props = /** @type {import("../spec/mark.js").TickProps} */ (
            this.properties
        );

        encoding.x ??= { value: 0.5 };
        encoding.y ??= { value: 0.5 };
        encoding.size = { value: props.thickness };

        const orient = props.orient ?? inferTickOrient(encoding);
        if (!orient) {
            throw new Error(
                "Cannot infer tick orientation from the encoding. Specify the tick mark's orient explicitly."
            );
        }

        applyTickSpan(encoding, orient);
        return encoding;
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @returns {"vertical" | "horizontal" | undefined}
 */
function inferTickOrient(encoding) {
    if (!encoding.y) {
        return VERTICAL;
    } else if (!encoding.x) {
        return HORIZONTAL;
    }

    const xBand = isBandChannelDef(encoding.x);
    const yBand = isBandChannelDef(encoding.y);
    if (!xBand && yBand) {
        return VERTICAL;
    } else if (xBand && !yBand) {
        return HORIZONTAL;
    } else {
        return undefined;
    }
}

/**
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {"vertical" | "horizontal"} orient
 */
function applyTickSpan(encoding, orient) {
    if (orient == VERTICAL) {
        encoding.x2 = encoding.x;
        if (isBandChannelDef(encoding.y)) {
            [encoding.y, encoding.y2] = createBandCoverage(encoding.y);
        } else {
            encoding.y = { value: 0 };
            encoding.y2 = { value: 1 };
        }
    } else {
        encoding.y2 = encoding.y;
        if (isBandChannelDef(encoding.x)) {
            [encoding.x, encoding.x2] = createBandCoverage(encoding.x);
        } else {
            encoding.x = { value: 0 };
            encoding.x2 = { value: 1 };
        }
    }
}

/**
 * @param {import("../spec/channel.js").ChannelDef} channelDef
 * @returns {channelDef is import("../spec/channel.js").ChannelDefWithScale}
 */
function isBandChannelDef(channelDef) {
    return (
        isChannelDefWithScale(channelDef) &&
        (channelDef.type == "ordinal" || channelDef.type == "nominal")
    );
}

/** @param {import("../spec/channel.js").ChannelDefWithScale} channelDef @param {number} band */
function withBand(channelDef, band) {
    return /** @type {import("../spec/channel.js").ChannelDefWithScale} */ ({
        ...channelDef,
        band,
    });
}

/** @param {import("../spec/channel.js").ChannelDefWithScale} channelDef */
function createBandCoverage(channelDef) {
    const band = /** @type {import("../spec/channel.js").BandMixins} */ (
        channelDef
    ).band;
    const adjustment = (1 - (band ?? 1)) / 2;
    return [
        withBand(channelDef, adjustment),
        withBand(channelDef, 1 - adjustment),
    ];
}
