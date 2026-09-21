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
import { getResolutionOwnerPrecedence } from "./resolutionOwnerPrecedence.js";

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

    /** @type {{ view: import("../view/view.js").default, props: Partial<import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis> } | undefined} */
    #viewLevelAxisProps;

    /**
     * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
     * @param {import("./scaleResolution.js").default} scaleResolution
     * @param {import("../view/view.js").default} hostView
     */
    constructor(channel, scaleResolution, hostView) {
        this.channel = channel;
        this.scaleResolution = scaleResolution;
        this.hostView = hostView;
    }

    /**
     * @param {AxisResolutionMember} member
     * @returns {() => void}
     */
    registerMember(member) {
        this.#assertNoMixing(member);
        this.#members.add(member);
        invalidate(this, "axisProps");
        return () => {
            this.#members.delete(member);
            invalidate(this, "axisProps");
        };
    }

    /**
     * @returns {boolean} True when at least one non-chrome axis-contributing view is visible.
     */
    hasVisibleNonChromeMember() {
        for (const member of this.#getNonChromeMembers()) {
            if (member.view.isVisible()) {
                return true;
            }
        }

        return false;
    }

    /** Whether this guide has a visible authored source. */
    isVisible() {
        return (
            this.hostView.isVisible() &&
            ((this.scaleResolution.isExplicitlyOwned() &&
                this.scaleResolution
                    .getViewLevelScaleProps()
                    .view.isVisible()) ||
                this.hasVisibleNonChromeMember())
        );
    }

    getDebugState() {
        return {
            kind: "axis",
            channel: this.channel,
            hostView: this.hostView,
            scaleResolution: this.scaleResolution,
            title: this.getTitle(),
            axisProps: this.getAxisProps(),
            hasVisibleNonChromeMember: this.hasVisibleNonChromeMember(),
            members: orderResolutionMembers(this.#members).map((member) => ({
                view: member.view,
                channel: member.channel,
                channelDef: structuredClone(member.channelDef),
            })),
            viewLevelAxisProps: this.#viewLevelAxisProps
                ? {
                      view: this.#viewLevelAxisProps.view,
                      props: structuredClone(this.#viewLevelAxisProps.props),
                  }
                : undefined,
        };
    }

    getAxisProps() {
        return getCachedOrCall(this, "axisProps", () => {
            /** @type {(false | null | Partial<import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis> | undefined)[]} */
            let propArray;
            if (this.#viewLevelAxisProps) {
                propArray = [this.#viewLevelAxisProps.props];
            } else {
                const members = this.#getNonChromeMembers();
                if (!members.length) {
                    return this.scaleResolution.isExplicitlyOwned() ? {} : null;
                }
                propArray = members.map((member) => {
                    const channelDef =
                        member.view.mark.encoding[member.channel];
                    return "axis" in channelDef && channelDef.axis;
                });
            }

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
        if (this.#viewLevelAxisProps?.props.title !== undefined) {
            return this.#viewLevelAxisProps.props.title;
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

        const titles = this.#getNonChromeMembers().map(computeTitle);
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
     * @param {Partial<import("../spec/axis.js").Axis & import("../spec/axis.js").GenomeAxis>} props
     */
    attachViewLevelAxisProps(view, props) {
        if (
            this.#viewLevelAxisProps &&
            this.#viewLevelAxisProps.view !== view
        ) {
            const precedence = getResolutionOwnerPrecedence(
                this.#viewLevelAxisProps.view,
                view
            );
            if (precedence === "current") {
                return;
            } else if (precedence === "conflict") {
                throw new Error(
                    `Multiple view-level axis declarations target the same ${this.channel} axis resolution.`
                );
            }
        }

        for (const member of this.#getNonChromeMembers()) {
            const channelDef = member.view.mark.encoding[member.channel];
            if ("axis" in channelDef && channelDef.axis !== undefined) {
                throw new Error(
                    `Cannot mix view-level axes.${this.channel} with encoding.${member.channel}.axis in the same axis resolution.`
                );
            }
        }

        this.#viewLevelAxisProps = { view, props };
        invalidate(this, "axisProps");
    }

    /**
     * @param {import("../view/view.js").default} view
     */
    clearViewLevelAxisProps(view) {
        if (this.#viewLevelAxisProps?.view === view) {
            this.#viewLevelAxisProps = undefined;
            invalidate(this, "axisProps");
        }
    }

    getViewLevelAxisProps() {
        return this.#viewLevelAxisProps;
    }

    /**
     * @returns {AxisResolutionMember[]}
     */
    #getNonChromeMembers() {
        return orderResolutionMembers(this.#members).filter(
            (member) => !this.#isChromeMember(member)
        );
    }

    /**
     * @param {AxisResolutionMember} member
     */
    #isChromeMember(member) {
        return member.view.getLayoutAncestors().some(isChromeView);
    }

    /**
     * @param {AxisResolutionMember} member
     */
    #assertNoMixing(member) {
        if (!this.#viewLevelAxisProps) {
            return;
        }

        if (this.#isChromeMember(member)) {
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
