import { isChannelWithScale } from "@genome-spy/core/encoder/encoder.js";
import { isChromosomalLocus } from "@genome-spy/core/genome/genome.js";
import { locusOrNumberToString } from "@genome-spy/core/genome/locusFormat.js";
import { html } from "lit";

/**
 *
 * @param {import("@genome-spy/core/view/containerView").default} rootView
 * @param {import("./types").AttributeIdentifier} attributeIdentifier
 * @returns
 */
export default function getViewAttributeInfo(rootView, attributeIdentifier) {
    const specifier =
        /** @type {import("./sampleViewTypes").LocusSpecifier} */ (
            attributeIdentifier.specifier
        );
    const view =
        /** @type {import("@genome-spy/core/view/unitView").default} */ (
            rootView.findDescendantByName(specifier.view)
        );

    const xScaleResolution = view.getScaleResolution("x");

    /** @type {import("@genome-spy/core/spec/channel").Scalar} */
    let scalarLocus;

    if (isChromosomalLocus(specifier.locus)) {
        const genome = xScaleResolution.getGenome();
        if (genome) {
            scalarLocus = genome.toContinuous(
                specifier.locus.chrom,
                specifier.locus.pos
            );
        } else {
            throw new Error(
                "Encountered a chromosomal locus but no genome is available!"
            );
        }
    } else {
        scalarLocus = specifier.locus;
    }

    /** @param {string} sampleId */
    const accessor = (sampleId) =>
        view.mark.findDatumAt(sampleId, scalarLocus)?.[specifier.field];

    // Find the channel and scale that matches the field
    const [channel, channelDef] = Object.entries(view.getEncoding()).find(
        ([_channel, channelDef]) =>
            "field" in channelDef && channelDef.field == specifier.field
    );
    const scale = isChannelWithScale(channel)
        ? view.getScaleResolution(channel).getScale()
        : undefined;

    /** @type {import("./types").AttributeInfo} */
    const attributeInfo = {
        name: specifier.field,
        attribute: attributeIdentifier,
        // TODO: Truncate view title: https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
        // TODO: Format scalarLocus (if it's a number)
        title: html` <em class="attribute">${specifier.field}</em>
            <span class="viewTitle">(${view.getTitleText() ?? view.name})</span>
            ${isChromosomalLocus(specifier.locus)
                ? html`at
                      <span class="locus"
                          >${locusOrNumberToString(specifier.locus)}</span
                      >`
                : html`<span class="scalar">of ${scalarLocus}</span>`}`,
        accessor,
        // TODO: Ensure that there's a type even if it's missing from spec
        type: "type" in channelDef ? channelDef.type : undefined,
        scale,
    };

    return attributeInfo;
}
