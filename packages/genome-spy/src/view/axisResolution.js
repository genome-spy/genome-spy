import { isString } from "vega-util";
import { peek } from "../utils/arrayUtils";
import coalesce from "../utils/coalesce";

import mergeObjects from "../utils/mergeObjects";
import { getCachedOrCall } from "../utils/propertyCacher";

/**
 *
 * @typedef { import("./unitView").default} UnitView
 */
export default class AxisResolution {
    /**
     * @param {import("../spec/channel").Channel} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./unitView").default[]} The involved views */
        this.views = [];
    }

    get scaleResolution() {
        return peek(this.views)?.getScaleResolution(this.channel);
    }

    /**
     * N.B. This is expected to be called in depth-first order, AFTER the
     * scales have been resolved.
     *
     * @param {UnitView} view
     */
    pushUnitView(view) {
        const newScaleResolution = view.getScaleResolution(this.channel);

        if (!newScaleResolution) {
            throw new Error("Cannot find a scale resolution!");
        }

        if (
            this.scaleResolution &&
            newScaleResolution !== this.scaleResolution
        ) {
            throw new Error("Shared axes must have a shared scale!");
        }

        this.views.push(view);
    }

    getAxisProps() {
        return getCachedOrCall(this, "axisProps", () => {
            const propArray = this.views.map(
                (view) => this._getEncoding(view).axis
            );

            if (
                propArray.length > 0 &&
                propArray.some((props) => props === null)
            ) {
                // No axis whatsoever is wanted
                return null;
            } else {
                return /** @type { import("../spec/axis").Axis} */ (
                    mergeObjects(
                        propArray.filter((props) => props !== undefined),
                        "axis",
                        ["title"]
                    )
                );
            }
        });
    }

    getTitle() {
        /** @param {UnitView} view} */
        const computeTitle = (view) => {
            const channelDef =
                /** @type {import("../spec/channel").ChannelDefWithScale} */ (
                    this._getEncoding(view)
                );

            // Retain nulls as they indicate that no title should be shown
            return coalesce(
                channelDef.axis === null ? null : undefined,
                channelDef.axis?.title,
                channelDef.title,
                channelDef.field,
                channelDef.expr
            );
        };

        return [...new Set(this.views.map(computeTitle).filter(isString))].join(
            ", "
        );
    }

    /**
     *
     * @param {UnitView} view
     */
    _getEncoding(view) {
        return view.mark.encoding[this.channel];
    }
}
