import { isChannelWithScale } from "@genome-spy/core/encoder/encoder.js";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { html } from "lit";
import {
    formatAggregationExpression,
    formatAggregationLabel,
} from "./aggregationOps.js";
import { createViewAttributeAccessor } from "./attributeAccessors.js";
import { createDefaultValuesProvider } from "./attributeValues.js";
import { formatInterval } from "./intervalFormatting.js";

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
            rootView.findDescendantByName(specifier.view)
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
    const [channel, channelDef] = Object.entries(view.getEncoding()).find(
        ([_channel, channelDef]) =>
            "field" in channelDef && channelDef.field == specifier.field
    );
    const scale = isChannelWithScale(channel)
        ? view.getScaleResolution(channel).getScale()
        : undefined;

    const baseType = "type" in channelDef ? channelDef.type : undefined;
    const resolvedType = "aggregation" in specifier ? "quantitative" : baseType;

    /** @type {import("./types.js").AttributeInfo} */
    const attributeInfo = {
        name: attributeLabel,
        attribute: attributeIdentifier,
        // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
        title: html`${attributeTitle}
            <span class="viewTitle">(${view.getTitleText() ?? view.name})</span>
            ${"interval" in specifier
                ? html`in
                      <span class="interval"
                          >${formatInterval(view, specifier.interval)}</span
                      >`
                : html`at
                      <span class="locus"
                          >${formatLocusValue(specifier.locus)}</span
                      >`}`,
        accessor,
        valuesProvider,
        // TODO: Ensure that there's a type even if it's missing from spec
        type: resolvedType,
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

/**
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("./types.js").Interval} interval
 * @returns {string}
 */
