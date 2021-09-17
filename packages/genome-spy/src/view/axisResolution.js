import { isString } from "vega-util";
import { getChannelDefWithScale } from "../encoder/encoder";
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
        /** @type {import("./scaleResolution").ResolutionMember[]} The involved views */
        this.members = [];
    }

    get scaleResolution() {
        return peek(this.members)?.view.getScaleResolution(this.channel);
    }

    /**
     * N.B. This is expected to be called in depth-first order, AFTER the
     * scales have been resolved.
     *
     * @param {UnitView} view
     * @param {import("../spec/channel").Channel} channel TODO: Do something for this
     */
    pushUnitView(view, channel) {
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

        this.members.push({ view, channel });
    }

    getAxisProps() {
        return getCachedOrCall(this, "axisProps", () => {
            const propArray = this.members.map(
                (member) =>
                    getChannelDefWithScale(member.view, member.channel).axis
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
        /** @param {import("./scaleResolution").ResolutionMember} member} */
        const computeTitle = (member) => {
            const channelDef = getChannelDefWithScale(
                member.view,
                member.channel
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

        return [
            ...new Set(this.members.map(computeTitle).filter(isString)),
        ].join(", ");
    }
}
