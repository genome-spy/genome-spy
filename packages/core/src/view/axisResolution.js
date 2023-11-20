import { isString } from "vega-util";
import {
    getChannelDefWithScale,
    getPrimaryChannel,
    isExprDef,
    isFieldDef,
    isSecondaryChannel,
    isValueDef,
} from "../encoder/encoder.js";
import { peek } from "../utils/arrayUtils.js";
import coalesce from "../utils/coalesce.js";

import mergeObjects from "../utils/mergeObjects.js";
import { getCachedOrCall } from "../utils/propertyCacher.js";

export default class AxisResolution {
    /**
     * @typedef { import("./unitView.js").default} UnitView
     */

    /**
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     */
    constructor(channel) {
        this.channel = channel;
        /** @type {import("./scaleResolution.js").ResolutionMember<import("../spec/channel.js").PositionalChannel>[]} The involved views */
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
     * @param {import("../spec/channel.js").PositionalChannel} channel TODO: Do something for this
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
            const propArray = this.members.map((member) => {
                const channelDef = member.view.mark.encoding[member.channel];
                return "axis" in channelDef && channelDef.axis;
            });

            if (
                propArray.length > 0 &&
                propArray.some((props) => props === null)
            ) {
                // No axis whatsoever is wanted
                return null;
            } else {
                return /** @type { import("../spec/axis.js").GenomeAxis} */ (
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
        /** @param {import("./scaleResolution.js").ResolutionMember} member} */
        const computeTitle = (member) => {
            const channelDef = getChannelDefWithScale(
                member.view,
                member.channel
            );

            if (isValueDef(channelDef)) {
                return undefined;
            }

            // Retain nulls as they indicate that no title should be shown

            return {
                member,
                explicitTitle: coalesce(
                    // TODO: Proper type guard
                    "axis" in channelDef ? channelDef.axis?.title : undefined,
                    channelDef.title
                ),
                implicitTitle: coalesce(
                    isFieldDef(channelDef) ? channelDef.field : undefined,
                    isExprDef(channelDef) ? channelDef.expr : undefined
                ),
            };
        };

        const titles = this.members.map(computeTitle);

        // Skip implicit secondary channel titles if the primary channel has an explicit title
        const filteredTitles = titles.filter((title) => {
            if (
                isSecondaryChannel(title.member.channel) &&
                !title.explicitTitle
            ) {
                const primaryChannel = getPrimaryChannel(title.member.channel);
                return (
                    titles.find(
                        (title2) =>
                            title2.member.view == title.member.view &&
                            title2.member.channel == primaryChannel
                    )?.explicitTitle === undefined
                );
            }
            return true;
        });

        const uniqueTitles = new Set(
            filteredTitles
                .map((title) =>
                    coalesce(title.explicitTitle, title.implicitTitle)
                )
                .filter(isString)
        );

        return uniqueTitles.size ? [...uniqueTitles].join(", ") : null;
    }
}
