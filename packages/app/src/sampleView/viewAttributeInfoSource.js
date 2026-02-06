import { isChannelWithScale } from "@genome-spy/core/encoder/encoder.js";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { html } from "lit";
import {
    formatAggregationExpression,
    formatAggregationLabel,
} from "./attributeAggregation/aggregationOps.js";
import { createViewAttributeAccessor } from "./attributeAggregation/attributeAccessors.js";
import { createDefaultValuesProvider } from "./attributeValues.js";
import { formatInterval } from "./attributeAggregation/intervalFormatting.js";
import { hasIntervalSource, hasLiteralInterval } from "./sampleViewTypes.js";
import { resolveViewRef } from "./viewRef.js";

/**
 *
 * @param {import("@genome-spy/core/view/containerView.js").default} rootView
 * @param {import("./types.js").AttributeIdentifier} attributeIdentifier
 * @returns
 */
export default function getViewAttributeInfo(rootView, attributeIdentifier) {
    const specifier =
        /** @type {import("./sampleViewTypes.js").ViewAttributeSpecifier} */ (
            attributeIdentifier.specifier
        );
    const view =
        /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
            resolveViewRef(rootView, specifier.view)
        );

    const attributeLabel =
        "aggregation" in specifier
            ? formatAggregationExpression(
                  specifier.aggregation.op,
                  specifier.field
              )
            : specifier.field;
    const emphasizedName =
        "aggregation" in specifier
            ? formatAggregationTitle(specifier.aggregation.op, specifier.field)
            : html`<em class="attribute">${specifier.field}</em>`;
    const attributeTitle =
        "aggregation" in specifier
            ? formatAggregationTitle(specifier.aggregation.op, specifier.field)
            : html`<em class="attribute">${specifier.field}</em>`;

    const accessor = createViewAttributeAccessor(view, specifier);
    const defaultValuesProvider = createDefaultValuesProvider(accessor);

    /**
     * @param {import("./types.js").AttributeValuesScope} scope
     */
    const valuesProvider = (scope) => {
        if (!scope.interval) {
            return defaultValuesProvider(scope);
        }

        if (!scope.aggregation) {
            throw new Error(
                "Interval values require an aggregation specification!"
            );
        }

        const intervalSpecifier = {
            view: specifier.view,
            field: specifier.field,
            interval: scope.interval,
            aggregation: scope.aggregation,
        };
        const intervalAccessor = createViewAttributeAccessor(
            view,
            intervalSpecifier
        );
        return scope.sampleIds.map((/** @type {string} */ sampleId) =>
            intervalAccessor(sampleId, scope.sampleHierarchy)
        );
    };

    // Find the channel and scale that matches the field
    const channelEntry = Object.entries(view.getEncoding()).find(
        ([_channel, channelDef]) =>
            "field" in channelDef && channelDef.field == specifier.field
    );
    const channel = channelEntry?.[0];
    const channelDef = channelEntry?.[1];
    if (!channelDef && !("aggregation" in specifier)) {
        throw new Error(
            `Cannot resolve field '${specifier.field}' in view '${view.name}'`
        );
    }
    if (
        !channelDef &&
        "aggregation" in specifier &&
        specifier.aggregation.op !== "count"
    ) {
        throw new Error(
            `Aggregation '${specifier.aggregation.op}' requires a field definition for '${specifier.field}' in view '${view.name}'`
        );
    }
    const scale =
        channel && isChannelWithScale(channel)
            ? view.getScaleResolution(channel).getScale()
            : undefined;

    const baseType =
        channelDef && "type" in channelDef ? channelDef.type : undefined;
    const resolvedType = "aggregation" in specifier ? "quantitative" : baseType;

    /** @type {(context: import("./types.js").AttributeEnsureContext) => Promise<void>} */
    let ensureAvailability;

    /** @type {(context: import("./types.js").AttributeEnsureContext) => Promise<void>} */
    let awaitProcessed;
    if ("ensureViewAttributeAvailability" in rootView) {
        const sampleView = /** @type {import("./sampleView.js").default} */ (
            rootView
        );
        ensureAvailability = (context) =>
            sampleView.ensureViewAttributeAvailability(specifier, context);
        awaitProcessed = (context) =>
            sampleView.awaitViewAttributeProcessed(specifier, context);
    }

    const locationLabel = (() => {
        if (hasLiteralInterval(specifier)) {
            return html`in
                <span class="interval"
                    >${formatInterval(view, specifier.interval)}</span
                >`;
        } else if (hasIntervalSource(specifier)) {
            return html`in
                <span class="interval"
                    >selection ${specifier.interval.selector.param}</span
                >`;
        } else if ("locus" in specifier) {
            return html`at
                <span class="locus"
                    >${formatLocusValue(specifier.locus)}</span
                >`;
        } else {
            throw new Error("Unsupported view attribute specifier.");
        }
    })();

    /** @type {import("./types.js").AttributeInfo} */
    const attributeInfo = {
        name: attributeLabel,
        attribute: attributeIdentifier,
        // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
        title: html`${attributeTitle}
            <span class="viewTitle">(${view.getTitleText() ?? view.name})</span>
            ${locationLabel}`,
        accessor,
        valuesProvider,
        // TODO: Ensure that there's a type even if it's missing from spec
        type: resolvedType,
        ensureAvailability,
        awaitProcessed,
        scale,
        emphasizedName,
    };

    return attributeInfo;
}

/**
 * @param {import("./types.js").AggregationOp} op
 * @param {string} field
 * @returns {import("lit").TemplateResult}
 */
function formatAggregationTitle(op, field) {
    if (op === "count") {
        return html`${formatAggregationLabel(op)}`;
    }
    return html`${formatAggregationLabel(op)}(<em class="attribute">${field}</em
        >)`;
}

/**
 * @param {import("@genome-spy/core/spec/channel.js").Scalar | import("@genome-spy/core/spec/genome.js").ChromosomalLocus} value
 * @returns {string}
 */
function formatLocusValue(value) {
    if (isChromosomalLocus(value) || typeof value === "number") {
        return locusOrNumberToString(value);
    }
    return String(value);
}
