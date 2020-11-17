import { isString } from "vega-util";
import { peek } from "../utils/arrayUtils";

import mergeObjects from "../utils/mergeObjects";
import { getCachedOrCall } from "../utils/propertyCacher";

/**
 *
 * @typedef { import("./unitView").default} UnitView
 */
export default class AxisResolution {
    /**
     * @param {string} channel
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
                view => this._getEncoding(view).axis
            );

            if (
                propArray.length > 0 &&
                propArray.some(props => props === null)
            ) {
                // No axis whatsoever is wanted
                return null;
            } else {
                return /** @type { import("../spec/axis").Axis} */ (mergeObjects(
                    propArray.filter(props => props !== undefined),
                    "axis",
                    ["title"]
                ));
            }
        });
    }

    getTitle() {
        /** @param {UnitView} view} */
        const computeTitle = view => {
            const encodingSpec = this._getEncoding(view);

            // Retain nulls as they indicate that no title should be shown
            return [
                encodingSpec.axis === null ? null : undefined,
                encodingSpec.axis !== null &&
                typeof encodingSpec.axis === "object"
                    ? encodingSpec.axis.title
                    : undefined,
                encodingSpec.title,
                encodingSpec.field, // TODO: Use accessor.fields instead of encoding.field
                encodingSpec.expr
            ]
                .filter(title => title !== undefined)
                .shift();
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
        return view.getEncoding()[this.channel];
    }
}
