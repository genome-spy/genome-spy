import { isChannelWithScale } from "@genome-spy/core/encoder/encoder.js";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { html } from "lit";
import { createViewAttributeAccessor } from "./attributeAccessors.js";

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
            ? formatAggregationLabel(specifier.aggregation.op) +
              " " +
              specifier.field
            : specifier.field;

    const accessor = createViewAttributeAccessor(view, specifier);

    // Find the channel and scale that matches the field
    const [channel, channelDef] = Object.entries(view.getEncoding()).find(
        ([_channel, channelDef]) =>
            "field" in channelDef && channelDef.field == specifier.field
    );
    const scale = isChannelWithScale(channel)
        ? view.getScaleResolution(channel).getScale()
        : undefined;

    /** @type {import("./types.js").AttributeInfo} */
    const attributeInfo = {
        name: attributeLabel,
        attribute: attributeIdentifier,
        // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
        title: html` <em class="attribute">${attributeLabel}</em>
            <span class="viewTitle">(${view.getTitleText() ?? view.name})</span>
            ${"interval" in specifier
                ? html`in
                      <span class="interval"
                          >${locusOrNumberToString(specifier.interval[0])}</span
                      >
                      –
                      <span class="interval"
                          >${locusOrNumberToString(specifier.interval[1])}</span
                      >`
                : html`at
                      <span class="locus"
                          >${formatLocusValue(specifier.locus)}</span
                      >`}`,
        accessor,
        // TODO: Ensure that there's a type even if it's missing from spec
        type: "type" in channelDef ? channelDef.type : undefined,
        scale,
    };

    return attributeInfo;
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
 * @param {import("./types.js").AggregationOp} op
 * @returns {string}
 */
function formatAggregationLabel(op) {
    switch (op) {
        case "min":
        case "max":
        case "count":
            return op;
        case "weightedMean":
            return "weighted mean";
        default:
            throw new Error("Unknown aggregation op: " + op);
    }
}
