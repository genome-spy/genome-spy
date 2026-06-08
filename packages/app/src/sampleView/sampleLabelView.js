import UnitView from "@genome-spy/core/view/unitView.js";
import { contextMenu, DIVIDER } from "../utils/ui/contextMenu.js";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import { html } from "lit";
import { subscribeTo } from "../state/subscribeTo.js";
import { createDefaultValuesProvider } from "./attributeValues.js";

/** @type {import("./types.js").AttributeIdentifierType} */
const SAMPLE_NAME = "SAMPLE_NAME";
const INDEX_NUMBER_FIELD = "_indexNumber";
const LABEL_WIDTH_FIELD = "_labelWidth";
const LABEL_TITLE_FIELD = "_labelTitle";
const LABEL_TITLE_WIDTH_FIELD = "_labelTitleWidth";

/** @type {import("./types.js").AttributeInfo} */
const SAMPLE_NAME_ATTRIBUTE_INFO = Object.freeze({
    name: "sample",
    title: html`<em class="attribute">Sample</em>`,
    emphasizedName: html`<em class="attribute">Sample</em>`,
    attribute: { type: SAMPLE_NAME },
    accessor: (/** @type {string} */ sampleId) => sampleId,
    valuesProvider: createDefaultValuesProvider(
        (/** @type {string} */ sampleId) => sampleId
    ),
    type: "identifier",
    scale: undefined,
});

/**
 * @extends {UnitView<import("../spec/view.js").AppUnitSpec>}
 */
export class SampleLabelView extends UnitView {
    /** @type {import("./sampleView.js").default} */
    #sampleView;

    /** @type {boolean} */
    #autoLabelWidth;

    /**
     * @type {(identifier: import("./types.js").AttributeIdentifier) => import("./types.js").AttributeInfo}
     */
    #attributeInfoSource;

    /**
     * Last sample-state snapshot. Hidden views may not have a data source yet,
     * so the snapshot is replayed when lazy initialization creates one.
     *
     * @type {import("./state/sampleState.js").Sample[]}
     */
    #samples = [];

    /**
     * @param {import("./sampleView.js").default} sampleView
     * @param {import("@genome-spy/core/view/containerView.js").default} sidebarView
     */
    constructor(sampleView, sidebarView) {
        super(
            createLabelViewSpec(
                sampleView.spec.samples,
                sampleView.spec.metadata
            ),
            sampleView.context,
            sidebarView,
            sidebarView,
            "metadata-sample-label"
        );

        this.#sampleView = sampleView;
        this.#autoLabelWidth = sampleView.spec.samples.labelLength == null;

        this.#attributeInfoSource = () => SAMPLE_NAME_ATTRIBUTE_INFO;
        sampleView.compositeAttributeInfoSource.addAttributeInfoSource(
            SAMPLE_NAME,
            this.#attributeInfoSource
        );

        this.addInteractionListener(
            "contextmenu",
            this.handleContextMenu.bind(this)
        );

        // TODO: Data could be inherited from the parent view
        this.registerDisposer(
            subscribeTo(
                sampleView.provenance.store,
                (state) => state.provenance.present.sampleView.sampleData,
                (sampleData) => {
                    this.#setSamples(Object.values(sampleData.entities));
                }
            )
        );
        this.registerDisposer(
            this._addBroadcastHandler("subtreeDataReady", () => {
                this.#setSamples(this.#samples);
            })
        );
    }

    /**
     *
     * @param {import("./state/sampleState.js").Sample[]} samples
     */
    #setSamples(samples) {
        this.#samples = samples;

        const dynamicSource =
            /** @type {import("@genome-spy/core/data/sources/namedSource.js").default} */ (
                this.flowHandle?.dataSource
            );

        if (!dynamicSource) {
            // Configured-hidden views are intentionally skipped by lazy data
            // initialization. Keep #samples current and replay it when the
            // lazy-initialized subtree reports that its data source is ready.
            return;
        }

        const labelTitle = getLabelTitle(this.#sampleView.spec.samples) ?? "";

        dynamicSource.updateDynamicData(
            // Make a copy because the state-derived data is immutable
            samples.map((sample) => ({
                id: sample.id,
                displayName: sample.displayName ?? sample.id,
                [INDEX_NUMBER_FIELD]: sample.indexNumber,
                [LABEL_TITLE_FIELD]: labelTitle,
            }))
        );

        if (this.#autoLabelWidth) {
            this.#setAutoLabelWidth();
        }
    }

    /**
     * Infers the label column width from the measured sample labels and title.
     */
    #setAutoLabelWidth() {
        const collector = this.getCollector();
        if (!collector?.completed) {
            return;
        }

        const nextWidth = getLabelWidth(collector);

        if (this.spec.width === nextWidth) {
            return;
        }

        this.spec.width = nextWidth;
        this.invalidateSizeCache();
        this.context.requestLayoutReflow();
    }

    /**
     * @param {import("@genome-spy/core/utils/interaction.js").default} event
     */
    handleContextMenu(event) {
        const sample = this.#sampleView.findSampleForMouseEvent(event);

        if (!sample) {
            event.mouseEvent.preventDefault();
            return;
        }

        /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [
            this.#sampleView.makePeekMenuItem(
                event.point.y - this.#sampleView.childCoords.y,
                sample.id
            ),
            DIVIDER,
        ];

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

    /**
     * @override
     */
    dispose() {
        super.dispose();
        this.#sampleView.compositeAttributeInfoSource.removeAttributeInfoSource(
            SAMPLE_NAME,
            this.#attributeInfoSource
        );
    }
}

/**
 *
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleDef} sampleDef
 * @param {import("@genome-spy/app/spec/sampleView.js").MetadataDef} [metadataDef]
 */
function createLabelViewSpec(sampleDef, metadataDef) {
    const labelTitle = getLabelTitle(sampleDef);

    /** @type {import("../spec/view.js").AppUnitSpec} */
    const labelSpec = {
        name: "sample-labels",
        data: { name: null },
        width: sampleDef.labelLength ?? 0,
        configurableVisibility: true,
        transform: [
            {
                type: "measureText",
                field: "displayName",
                as: LABEL_WIDTH_FIELD,
                fontSize: sampleDef.labelFontSize ?? 11,
                font: sampleDef.labelFont,
                fontStyle: sampleDef.labelFontStyle,
                fontWeight: sampleDef.labelFontWeight,
            },
            {
                type: "measureText",
                field: LABEL_TITLE_FIELD,
                as: LABEL_TITLE_WIDTH_FIELD,
                fontSize: metadataDef?.labelFontSize ?? 11,
                font: metadataDef?.labelFont,
                fontStyle: metadataDef?.labelFontStyle,
                fontWeight: metadataDef?.labelFontWeight,
            },
        ],
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
            facetIndex: { field: INDEX_NUMBER_FIELD },
            x: { value: 0 },
            x2: { value: 1 },
            y: { value: 0 },
            y2: { value: 1 },
            text: { field: "displayName" },
        },
    };

    if (labelTitle !== null) {
        labelSpec.title = {
            text: labelTitle,
            orient: "bottom",
            anchor: "start",
            offset: 5,
            font: metadataDef?.labelFont,
            fontSize: metadataDef?.labelFontSize ?? 11,
            fontStyle: metadataDef?.labelFontStyle,
            fontWeight: metadataDef?.labelFontWeight,
        };
    }

    return labelSpec;
}

/**
 * @param {import("@genome-spy/core/data/collector.js").default} collector
 * @returns {number}
 */
function getLabelWidth(collector) {
    let labelWidth = 0;
    collector.visitData((datum) => {
        labelWidth = Math.max(
            labelWidth,
            Number(datum[LABEL_WIDTH_FIELD]) || 0,
            Number(datum[LABEL_TITLE_WIDTH_FIELD]) || 0
        );
    });

    return Math.ceil(labelWidth);
}

/**
 * @param {import("@genome-spy/app/spec/sampleView.js").SampleDef} sampleDef
 * @returns {string | null}
 */
function getLabelTitle(sampleDef) {
    return sampleDef.labelTitle !== undefined ? sampleDef.labelTitle : "Sample";
}
