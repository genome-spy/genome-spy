import { isString } from "vega-util";
import {
    getChannelDefWithScale,
    getPrimaryChannel,
    isExprDef,
    isFieldDef,
    isSecondaryChannel,
    isValueDef,
} from "../encoder/encoder.js";
import coalesce from "../utils/coalesce.js";

import mergeObjects from "../utils/mergeObjects.js";
import { getCachedOrCall, invalidate } from "../utils/propertyCacher.js";

/**
 * @template {import("../spec/channel.js").PositionalChannel}[T=PositionalChannel]
 *
 * @typedef {object} AxisResolutionMember
 * @prop {import("./unitView.js").default} view
 * @prop {T} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 */
export default class AxisResolution {
    /**
     * @typedef {import("./unitView.js").default} UnitView
     * @typedef {import("../spec/channel.js").PositionalChannel} PositionalChannel
     */

    /** @type {Set<AxisResolutionMember>} The involved views */
    #members = new Set();

    /**
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     */
    constructor(channel) {
        this.channel = channel;
    }

    get scaleResolution() {
        const first = this.#members.values().next().value;
        return first?.view.getScaleResolution(this.channel);
    }

    /**
     * N.B. This is expected to be called in depth-first order, AFTER the
     * scales have been resolved.
     *
     * @param {AxisResolutionMember} newMember
     */
    #addMember(newMember) {
        const { view } = newMember;
        const newScaleResolution = view.getScaleResolution(this.channel);

        if (!newScaleResolution) {
            throw new Error("Cannot find a scale resolution!");
        }

        if (
            this.scaleResolution &&
            newScaleResolution !== this.scaleResolution
        ) {
            throw new Error(
                `Shared axes must have a shared scale! Channel: ${
                    this.channel
                }, existing views: [${Array.from(this.#members)
                    .map((m) => m.view.getPathString())
                    .join(", ")}], new view: ${view.getPathString()}.`
            );
        }

        this.#members.add(newMember);
        invalidate(this, "axisProps");
    }

    /**
     * @param {AxisResolutionMember} member
     * @returns {() => boolean}
     */
    registerMember(member) {
        this.#addMember(member);
        return () => {
            const removed = this.removeMember(member);
            return removed && this.#members.size === 0;
        };
    }

    /**
     * @param {AxisResolutionMember} member
     * @returns {boolean}
     */
    removeMember(member) {
        const removed = this.#members.delete(member);
        if (removed) {
            invalidate(this, "axisProps");
        }
        return removed;
    }

    getAxisProps() {
        return getCachedOrCall(this, "axisProps", () => {
            const propArray = Array.from(this.#members).map((member) => {
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
        /** @param {AxisResolutionMember} member} */
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

        const titles = Array.from(this.#members).map(computeTitle);

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
