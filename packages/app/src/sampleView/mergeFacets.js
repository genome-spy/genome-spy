import { isFieldDef } from "@genome-spy/core/encoder/encoder.js";
import {
    isSampleGroup,
    iterateGroupHierarchy,
    sampleHierarchySelector,
    SAMPLE_SLICE_NAME,
} from "./sampleSlice.js";
import { peek } from "@genome-spy/core/utils/arrayUtils.js";
import { field } from "@genome-spy/core/utils/field.js";
import kWayMerge from "@genome-spy/core/utils/kWayMerge.js";
import SampleView from "./sampleView.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import Collector from "@genome-spy/core/data/collector.js";
import FlowNode from "@genome-spy/core/data/flowNode.js";

/** The number of samples in a facet */
const SAMPLE_COUNT_VARIABLE = "sampleCount";

/**
 * Merges sample facets by groups that have been formed in SampleSlice.
 * Propagates the merged facets as new facets.
 *
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 */
export default class MergeSampleFacets extends FlowNode {
    #initialUpdate = true;

    /**
     *
     * @param {any} params
     * @param {View} view
     */
    constructor(params, view) {
        super();

        this.view = view;

        const animator = view.context.animator;

        this.provenance = findProvenance(view);

        if (!this.provenance) {
            throw new Error("No SampleView was found!");
        }

        this.provenance.storeHelper.subscribe((state) => {
            if (!this.#shouldUpdate) {
                return;
            }

            // Ensure that propagation is complete (albeit without actual data)
            // before the first update. This is necessary to prevent errors in
            // rendering before the initial data is available. The requestTransition
            // hack below postpones the update until the next animation frame.
            if (this.#initialUpdate) {
                this.#initialUpdate = false;
                this.reset();
                this.complete();
            }

            // Using requestTransition to prevent unnecessary updates
            // when multiple actions are dispatched as a batch.
            // TODO: Figure out a cleaner way to do this.
            animator.requestTransition(() => {
                this.reset();
                this._mergeAndPropagate(sampleHierarchySelector(state));
                this.complete();
            });
        });

        /** @type {any} */
        this.contextObject = undefined;
    }

    initialize() {
        this.contextObject = Object.create(super.getGlobalObject());

        const xChannelDef = this.view.getEncoding()["x"];
        if (isFieldDef(xChannelDef)) {
            this.xAccessor = field(xChannelDef.field);
        } else {
            throw new Error(
                "Sample summarization requires a FieldDef. This is not a FieldDef: " +
                    JSON.stringify(xChannelDef)
            );
        }
    }

    /**
     * @param {import("@genome-spy/core/data/flowNode.js").Datum} datum
     */
    handle(datum) {
        // NOP. Block propagation.
        // TODO: Optimize by preventing calling altogether
    }

    get #shouldUpdate() {
        // TODO: Should update only when the sample hierarchy changes.
        // i.e., when groups or samples are added or removed. Reordering the
        // the samples within a group should not trigger an update.
        // TODO: Also check child visibilities. No need to propagate if
        // the directly attached view is visible but all its children are
        // invisible.
        return this.view.isConfiguredVisible();
    }

    getGlobalObject() {
        return this.contextObject;
    }

    _getCollector() {
        if (this.parent instanceof Collector) {
            // TODO: Ensure that the collector has proper groupbys
            return this.parent;
        } else {
            throw new Error(
                "MergeFacetsTransform must be a direct child of a Collector"
            );
        }
    }

    complete() {
        if (this.#shouldUpdate) {
            this._mergeAndPropagate(
                this.provenance.getPresentState()[SAMPLE_SLICE_NAME]
            );
        }

        super.complete();
    }

    /**
     * @param {import("./sampleSlice.js").SampleHierarchy} sampleHierarchy
     */
    _mergeAndPropagate(sampleHierarchy) {
        const groupPaths = [
            ...iterateGroupHierarchy(sampleHierarchy.rootGroup),
        ].filter((path) => isSampleGroup(peek(path)));

        for (const [i, groupPath] of groupPaths.entries()) {
            const group = peek(groupPath);

            if (isSampleGroup(group)) {
                this.contextObject[SAMPLE_COUNT_VARIABLE] =
                    group.samples.length;

                this.beginBatch({ type: "facet", facetId: [i] });

                const samples = group.samples;
                const collector = this._getCollector();

                // TODO: Only merge and propagate if the sets of samples change.
                // Computation is unnecessary when data is just sorted.

                kWayMerge(
                    samples.map(
                        (sample) => collector.facetBatches.get([sample]) ?? []
                    ),
                    (d) => this._propagate(d),
                    this.xAccessor
                );
            }
        }

        this._updateScales();
    }

    /**
     *
     * @param {FlowNode} parent
     */
    setParent(parent) {
        super.setParent(parent);

        // TODO: Validate that the parent is a collector
    }

    _updateScales() {
        /** @type {Set<import("@genome-spy/core/view/scaleResolution.js").default>} */
        const resolutions = new Set();
        this.view.visit((view) => {
            if (view instanceof UnitView && view.mark.encoding.y) {
                const resolution = view.getScaleResolution("y");
                if (resolution) {
                    resolutions.add(resolution);
                }
            }
        });
        for (const resolution of resolutions) {
            // TODO: This should be handled automatically by collectors
            resolution.reconfigure();
        }
    }
}

/**
 * @param {View} view
 */
function findProvenance(view) {
    for (const v of view.getLayoutAncestors()) {
        if (v instanceof SampleView) {
            return v.provenance;
        }
    }
}
