import Mark from "./mark.js";
import { fixCoveragePositional, fixFill, fixStroke } from "./markUtils.js";
import { asArray } from "../utils/arrayUtils.js";
import {
    getEncoderDataAccessor,
    isNestedDiscreteOffsetDef,
    isValueDef,
} from "../encoder/encoder.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";
import { isDiscrete } from "vega-scale";

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

    get opaque() {
        return (
            getCachedOrCall(
                this,
                "opaque",
                () =>
                    !this.#isRoundedCorners() &&
                    !this.#isStroked() &&
                    !this.properties.shadowOpacity &&
                    isValueDef(this.encoding.fillOpacity) &&
                    this.encoding.fillOpacity.value == 1.0 &&
                    this.properties.minOpacity == 1.0
            ) && this.unitView.getEffectiveOpacity() == 1
        );
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

    #isRoundedCorners() {
        const p = this.properties;
        return (
            p.cornerRadius ||
            p.cornerRadiusBottomLeft ||
            p.cornerRadiusBottomRight ||
            p.cornerRadiusTopLeft ||
            p.cornerRadiusTopRight
        );
    }

    #isStroked() {
        const strokeWidth = this.encoding.strokeWidth;
        return (
            !(isValueDef(strokeWidth) && !strokeWidth.value) ||
            "condition" in strokeWidth
        );
    }

    /**
     * @param {any} facetId
     * @param {import("../spec/channel.js").Scalar} x
     * @returns {any}
     * @override
     */
    findDatumAt(facetId, x) {
        facetId = asArray(facetId);
        const data = this.unitView.getCollector().facetBatches.get(facetId);
        if (!data) {
            return;
        }

        const encoders = this.encoders;
        if (isDiscrete(encoders.x.scale.type)) {
            const accessor = getEncoderDataAccessor(encoders.x);
            return accessor
                ? data.find((datum) => x == accessor(datum))
                : undefined;
        } else {
            const accessor = getEncoderDataAccessor(encoders.x);
            const secondaryAccessor = getEncoderDataAccessor(encoders.x2);
            if (!accessor || !secondaryAccessor) {
                return;
            }
            return data.find(
                (datum) => x >= accessor(datum) && x < secondaryAccessor(datum)
            );
        }
    }
}
