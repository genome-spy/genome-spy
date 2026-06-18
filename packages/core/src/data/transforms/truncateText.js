import { BEHAVIOR_MODIFIES } from "../flowNode.js";
import { field } from "../../utils/field.js";
import Transform from "./transform.js";

const DEFAULT_ELLIPSIS = "...";

/**
 * @param {string} text
 * @param {number | undefined} limit
 * @param {((text: string, fontSize?: number) => number) | undefined} measureWidth
 * @param {number} fontSize
 * @param {string} ellipsis
 */
export function truncateText(text, limit, measureWidth, fontSize, ellipsis) {
    if (limit === undefined || !Number.isFinite(limit)) {
        return text;
    }

    if (limit <= 0) {
        return "";
    }

    if (!measureWidth || measureWidth(text, fontSize) <= limit) {
        return text;
    }

    if (measureWidth(ellipsis, fontSize) > limit) {
        return "";
    }

    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (measureWidth(text.slice(0, mid) + ellipsis, fontSize) <= limit) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return text.slice(0, low) + ellipsis;
}

export default class TruncateTextTransform extends Transform {
    get behavior() {
        return BEHAVIOR_MODIFIES;
    }

    /**
     * @param {import("../../spec/transform.js").TruncateTextParams} params
     * @param {import("../flowNode.js").ParamRuntimeProvider} paramRuntimeProvider
     */
    constructor(params, paramRuntimeProvider) {
        super(params, paramRuntimeProvider);

        this.params = params;
        this.accessor = field(params.field);
        this.as = params.as ?? params.field;
        this.fontSize = params.fontSize;
        this.ellipsis = params.ellipsis ?? DEFAULT_ELLIPSIS;
    }

    initialize() {
        const fontManager = this.paramRuntimeProvider.context.fontManager;
        this.font = this.params.font
            ? fontManager.getFont(
                  this.params.font,
                  this.params.fontStyle,
                  this.params.fontWeight
              )
            : fontManager.getDefaultFont();
    }

    /**
     * @param {any} datum
     */
    handle(datum) {
        const value = this.accessor(datum);
        if (value === undefined || value === null) {
            datum[this.as] = "";
        } else {
            datum[this.as] = truncateText(
                "" + value,
                this.params.limit,
                this.font.metrics?.measureWidth,
                this.fontSize,
                this.ellipsis
            );
        }

        this._propagate(datum);
    }
}
