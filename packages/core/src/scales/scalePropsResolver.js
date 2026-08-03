import { isDiscrete } from "vega-scale";
import { isColorChannel, isOffsetChannel } from "../encoder/encoder.js";
import { isExprRef } from "../paramRuntime/paramUtils.js";

import mergeObjects from "../utils/mergeObjects.js";
import {
    getConfiguredScaleConfig,
    getConfiguredScaleDefaults,
    getConfiguredNamedRange,
    isConfigRangeName,
} from "../config/scaleConfig.js";
import { collectConfiguredDomainExprRefs } from "./domainExpressions.js";
import {
    applyLockedProperties,
    getDefaultScaleType,
    validateScaleTypeCompatibility,
} from "./scaleRules.js";
import { INDEX, LOCUS } from "./scaleResolutionConstants.js";

/**
 * @typedef {import("../spec/channel.js").Channel} Channel
 * @typedef {import("../spec/scale.js").Scale} Scale
 * @typedef {import("./scaleResolution.js").ScaleResolutionMember} ScaleResolutionMember
 */

/**
 * @param {object} options
 * @param {Channel} options.channel
 * @param {import("../spec/channel.js").Type} options.dataType
 * @param {ScaleResolutionMember[]} options.orderedMembers
 * @param {{ view: import("../view/view.js").default, props: Scale } | undefined} [options.viewLevelScaleProps]
 * @param {boolean} options.isExplicitDomain
 * @param {import("../spec/config.js").GenomeSpyConfig[]} options.configScopes
 * @returns {Scale}
 */
export function resolveScalePropsBase({
    channel,
    dataType,
    orderedMembers,
    viewLevelScaleProps,
    isExplicitDomain,
    configScopes,
}) {
    const memberList = orderedMembers;

    const markTypes = memberList
        .map((member) =>
            typeof member.view.getMarkType == "function"
                ? member.view.getMarkType()
                : undefined
        )
        .filter((markType) => !!markType);

    const propArray = viewLevelScaleProps
        ? [viewLevelScaleProps.props]
        : memberList
              .map((member) => member.channelDef.scale)
              .filter((props) => props !== undefined);

    // TODO: Disabled scale: https://vega.github.io/vega-lite/docs/scale.html#disable
    const mergedProps = mergeObjects(propArray, "scale", ["domain"]);
    if (mergedProps === null || mergedProps.type == "null") {
        return /** @type {Scale} */ ({ type: "null" });
    }

    const props = {
        ...getConfiguredScaleDefaults(configScopes, {
            channel,
            dataType,
            isExplicitDomain,
            markTypes: /** @type {import("../spec/mark.js").MarkType[]} */ (
                markTypes
            ),
            hasDomainMid: mergedProps.domainMid !== undefined,
        }),
        ...mergedProps,
    };

    if (!props.type) {
        // TODO: When discrete positional scale inference is revisited, plumb
        // mark-level context into getDefaultScaleType instead of deciding only
        // from channel + data type. The `markTypes` collection above is the
        // natural starting point for a Vega-Lite-like band-vs-point choice,
        // including future rect-backed marks such as "bar".
        props.type = getDefaultScaleType(channel, dataType);
    }

    validateScaleTypeCompatibility(
        channel,
        dataType,
        viewLevelScaleProps ? props.type : undefined,
        `View-level scales.${channel}.type`
    );

    if (typeof props.range == "string") {
        if (!isConfigRangeName(props.range)) {
            throw new Error(
                'Unknown named scale range "' +
                    props.range +
                    '". Supported names: shape, size, angle, heatmap, ramp, diverging.'
            );
        }

        const resolvedNamedRange = getConfiguredNamedRange(
            configScopes,
            props.range
        );
        if (resolvedNamedRange === undefined) {
            throw new Error(
                'Named scale range "' +
                    props.range +
                    '" is not configured in config.range.'
            );
        }

        if (
            isColorChannel(channel) &&
            (typeof resolvedNamedRange == "string" ||
                (resolvedNamedRange != null &&
                    typeof resolvedNamedRange == "object" &&
                    !Array.isArray(resolvedNamedRange)))
        ) {
            props.scheme =
                /** @type {import("../spec/scale.js").Scale["scheme"]} */ (
                    resolvedNamedRange
                );
            delete props.range;
        } else {
            props.range =
                /** @type {import("../spec/scale.js").Scale["range"]} */ (
                    resolvedNamedRange
                );
        }
    }

    // Reverse discrete y axis
    if (
        channel == "y" &&
        isDiscrete(props.type) &&
        props.reverse == undefined
    ) {
        props.reverse = true;
    }

    if (isOffsetChannel(channel) && isDiscrete(props.type) && !props.range) {
        const positionChannel = channel == "xOffset" ? "x" : "y";
        const rangeOwner = memberList[0]?.view;
        const positionResolution =
            rangeOwner?.getScaleResolution(positionChannel);

        if (positionResolution?.getResolvedScaleType() == "band") {
            // Initialize the dependency before binding the reactive range.
            // Otherwise its first range notification can re-enter bandwidth()
            // while the offset scale itself is being initialized.
            positionResolution.getScale();
            const size = positionChannel == "x" ? "width" : "height";
            props.range = [
                0,
                { expr: `bandwidth("${positionChannel}") * ${size}` },
            ];
            /** @type {any} */ (props).__rangeExprScope = rangeOwner;
        }
    }

    if (props.range && props.scheme) {
        delete props.scheme;
        // TODO: Props should be set more intelligently
    }

    if (props.domainTransition === undefined) {
        const hasExprDrivenDomain =
            memberList.some(
                (member) =>
                    collectConfiguredDomainExprRefs(
                        member.channelDef.scale?.domain
                    ).length > 0
            ) ||
            collectConfiguredDomainExprRefs(viewLevelScaleProps?.props.domain)
                .length > 0;
        props.domainTransition = !hasExprDrivenDomain;
    }

    if (
        Array.isArray(props.range) &&
        props.range.some(isExprRef) &&
        memberList.length > 0
    ) {
        const rangeOwner =
            viewLevelScaleProps?.props.range !== undefined
                ? viewLevelScaleProps.view
                : memberList.find(
                      (member) => member.channelDef.scale?.range !== undefined
                  )?.view;
        if (rangeOwner) {
            /** @type {any} */
            (props).__rangeExprScope = rangeOwner;
        }
    }

    // By default, index and locus scales are zoomable, others are not.
    // Config can override this baseline via scale.zoom.
    if (!("zoom" in props)) {
        const scaleConfig = getConfiguredScaleConfig(configScopes, dataType);
        if (scaleConfig.zoom !== undefined) {
            props.zoom = scaleConfig.zoom;
        } else if ([INDEX, LOCUS].includes(props.type)) {
            props.zoom = true;
        }
    }

    applyLockedProperties(props, channel);

    return props;
}

/**
 * @param {Scale} props
 * @param {Channel} channel
 */
