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
import { isChromeView } from "../view/viewSelectors.js";
import { orderResolutionMembers } from "./resolutionMemberOrder.js";

/**
 * @template {import("../spec/channel.js").PositionalChannel}[T=PositionalChannel]
 *
 * @typedef {object} AxisResolutionMember
 * @prop {import("../view/unitView.js").default} view
 * @prop {T} channel
 * @prop {import("../spec/channel.js").ChannelDefWithScale} channelDef
 */
export default class AxisResolution {
    /**
     * @typedef {import("../view/unitView.js").default} UnitView
     * @typedef {import("../spec/channel.js").PositionalChannel} PositionalChannel
     */

    /** @type {Set<AxisResolutionMember>} The involved views */
    #members = new Set();

    /** @type {{ view: import("../view/view.js").default, config: Partial<import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis> } | undefined} */
    #viewLevelAxisConfig;

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
        this.#assertNoMixing(member);
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

    /**
     * @returns {boolean} True when at least one non-chrome axis-contributing view is visible.
     */
    hasVisibleNonChromeMember() {
        for (const member of this.#members) {
            if (
                member.view.isVisible() &&
                !member.view.getLayoutAncestors().some(isChromeView)
            ) {
                return true;
            }
        }

        return false;
    }

    getDebugState() {
        return {
            kind: "axis",
            channel: this.channel,
            hostView:
                this.scaleResolution?.getDebugState().hostView ??
                this.#viewLevelAxisConfig?.view ??
                this.#members.values().next().value?.view,
            scaleResolution: this.scaleResolution,
            title: this.getTitle(),
            axisProps: this.getAxisProps(),
            hasVisibleNonChromeMember: this.hasVisibleNonChromeMember(),
            members: orderResolutionMembers(this.#members).map((member) => ({
                view: member.view,
                channel: member.channel,
                channelDef: structuredClone(member.channelDef),
            })),
            viewLevelAxisConfig: this.#viewLevelAxisConfig
                ? {
                      view: this.#viewLevelAxisConfig.view,
                      config: structuredClone(this.#viewLevelAxisConfig.config),
                  }
                : undefined,
        };
    }

    getAxisProps() {
        return getCachedOrCall(this, "axisProps", () => {
            const propArray = this.#viewLevelAxisConfig
                ? [this.#viewLevelAxisConfig.config]
                : orderResolutionMembers(this.#members).map((member) => {
                      const channelDef =
                          member.view.mark.encoding[member.channel];
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
        if (this.#viewLevelAxisConfig?.config.title !== undefined) {
            return this.#viewLevelAxisConfig.config.title;
        }

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
                axisTitle:
                    // TODO: Proper type guard
                    "axis" in channelDef ? channelDef.axis?.title : undefined,
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

        const titles = orderResolutionMembers(this.#members).map(computeTitle);
        const explicitAxisTitle = titles
            .map((title) => title.axisTitle)
            .find((title) => title !== undefined);

        if (explicitAxisTitle !== undefined) {
            return explicitAxisTitle;
        }

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

    /**
     * @param {import("../view/view.js").default} view
     * @param {Partial<import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis>} config
     */
    attachViewLevelAxisConfig(view, config) {
        if (
            this.#viewLevelAxisConfig &&
            this.#viewLevelAxisConfig.view !== view
        ) {
            throw new Error(
                `Multiple view-level axis configs target the same ${this.channel} axis resolution.`
            );
        }

        for (const member of this.#members) {
            const channelDef = member.view.mark.encoding[member.channel];
            if ("axis" in channelDef && channelDef.axis !== undefined) {
                throw new Error(
                    `Cannot mix view-level axes.${this.channel} with encoding.${member.channel}.axis in the same axis resolution.`
                );
            }
        }

        this.#viewLevelAxisConfig = { view, config };
        invalidate(this, "axisProps");
    }

    /**
     * @param {import("../view/view.js").default} view
     */
    clearViewLevelAxisConfig(view) {
        if (this.#viewLevelAxisConfig?.view === view) {
            this.#viewLevelAxisConfig = undefined;
            invalidate(this, "axisProps");
        }
    }

    getViewLevelAxisConfig() {
        return this.#viewLevelAxisConfig;
    }

    /**
     * @param {AxisResolutionMember} member
     */
    #assertNoMixing(member) {
        if (!this.#viewLevelAxisConfig) {
            return;
        }

        const channelDef = member.view.mark.encoding[member.channel];
        if ("axis" in channelDef && channelDef.axis !== undefined) {
            throw new Error(
                `Cannot mix view-level axes.${this.channel} with encoding.${member.channel}.axis in the same axis resolution.`
            );
        }
    }
}
