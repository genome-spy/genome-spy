import { isDiscrete } from "vega-scale";
import {
    getOffsetChannel,
    isColorChannel,
    isNestedDiscreteOffsetDef,
    isOffsetChannel,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
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
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("./scaleResolution.js").default | undefined} [options.getOwnerScaleResolution]
 * @returns {Scale}
 */
export function resolveScalePropsBase({
    channel,
    dataType,
    orderedMembers,
    viewLevelScaleProps,
    isExplicitDomain,
    configScopes,
    getOwnerScaleResolution,
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

    const hasNestedOffset =
        isPrimaryPositionalChannel(channel) &&
        memberList.some((member) =>
            isNestedDiscreteOffsetDef(
                member.view.getEncoding()[getOffsetChannel(channel)]
            )
        );

    if (
        hasNestedOffset &&
        props.type == "band" &&
        props.padding === undefined
    ) {
        // Primary padding separates groups; offset-scale padding separates
        // marks within each group. Based on Vega-Lite's group-level defaults:
        // https://github.com/vega/vega-lite/blob/f0e76dfc7efa720817249f612f66599e2ca5ead4/src/scale.ts
        // Explicit values win, and the padding shortcut controls both values.
        props.paddingInner ??= 0.2;
        props.paddingOuter ??= 0.2;
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
        const positionResolution = getOwnerScaleResolution?.(positionChannel);

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
