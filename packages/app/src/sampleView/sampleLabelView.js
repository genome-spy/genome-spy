import UnitView from "@genome-spy/core/view/unitView.js";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import { html } from "lit";
import { watch } from "../state/watch.js";
import { sampleHierarchySelector } from "./sampleSlice.js";

const SAMPLE_NAME = "SAMPLE_NAME";

/** @type {import("./types.js").AttributeInfo} */
const SAMPLE_NAME_ATTRIBUTE_INFO = Object.freeze({
    name: "sample",
    attribute: { type: SAMPLE_NAME },
    accessor: (/** @type {string} */ sampleId) => sampleId,
    type: "identifier",
    scale: undefined,
});

export class SampleLabelView extends UnitView {
    /** @type {import("./sampleView.js").default} */
    #sampleView;

    /**
     * @param {import("./sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} dataParent
     */
    constructor(sampleView, dataParent) {
        super(
            createLabelViewSpec(sampleView.spec.samples),
            sampleView.context,
            sampleView,
            dataParent,
            "sample-label"
        );

        this.#sampleView = sampleView;

        sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_NAME,
            (attribute) => SAMPLE_NAME_ATTRIBUTE_INFO
        );

        this.addInteractionEventListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        // TODO: Data could be inherited from the parent view
        sampleView.provenance.storeHelper.subscribe(
            watch(
                (state) => sampleHierarchySelector(state).sampleData,
                (sampleData) => {
                    this.#setSamples(Object.values(sampleData.entities));
                }
            )
        );
    }

    /**
     *
     * @param {import("./sampleState.js").Sample[]} samples
     */
    #setSamples(samples) {
        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                this.context.dataFlow.findDataSourceByKey(this)
            );

        dynamicSource.updateDynamicData(
            // Make a copy because the state-derived data is immutable
            samples.map((sample) => ({
                id: sample.id,
                displayName: sample.displayName,
                indexNumber: sample.indexNumber,
            }))
        );
    }

    /**
     * @param {import("@genome-spy/core/view/layout/rectangle.js").default} coords
     * @param {import("@genome-spy/core/utils/interactionEvent.js").default} event
     */
    handleContextMenu(coords, event) {
        const sample = this.#sampleView.findSampleForMouseEvent(coords, event);

        if (!sample) {
            event.mouseEvent.preventDefault();
            return;
        }

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [this.#sampleView.makePeekMenuItem(), DIVIDER];

        items.push(
            ...generateAttributeContextMenu(
                html`Sample: <strong>${sample.displayName}</strong>`,
                SAMPLE_NAME_ATTRIBUTE_INFO,
                sample.id,
                this.#sampleView
            )
        );

        contextMenu({ items }, event.mouseEvent);
    }
}

/**
 *
 * @param {import("@genome-spy/core/spec/sampleView.js").SampleDef} sampleDef
 */
function createLabelViewSpec(sampleDef) {
    // TODO: Support styling: https://vega.github.io/vega-lite/docs/header.html#labels

    /** @type {import("@genome-spy/core/spec/view.js").UnitSpec} */
    const labelSpec = {
        data: { name: null },
        title: {
            text: sampleDef.labelTitleText ?? "Sample name",
            orient: "bottom",
            anchor: "start",
            offset: 5,
            font: sampleDef.attributeLabelFont,
            fontSize: sampleDef.attributeLabelFontSize ?? 11,
            fontStyle: sampleDef.attributeLabelFontStyle,
            fontWeight: sampleDef.attributeLabelFontWeight,
        },
        width: sampleDef.labelLength ?? 140,
        mark: {
            type: "text",
            baseline: "middle",
            font: sampleDef.labelFont,
            size: sampleDef.labelFontSize ?? 11,
            fontStyle: sampleDef.labelFontStyle,
            fontWeight: sampleDef.labelFontWeight,
            align: sampleDef.labelAlign ?? "left",
            flushY: false,
        },
        encoding: {
            facetIndex: { field: "indexNumber" },
            x: { value: 0 },
            x2: { value: 1 },
            y: { value: 0 },
            y2: { value: 1 },
            text: { field: "displayName" },
        },
    };

    return labelSpec;
}
