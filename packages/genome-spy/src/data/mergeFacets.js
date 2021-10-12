import { isFieldDef } from "../encoder/encoder";
import {
    isSampleGroup,
    iterateGroupHierarcy,
} from "../sampleHandler/sampleHandler";
import { peek } from "../utils/arrayUtils";
import { field } from "../utils/field";
import kWayMerge from "../utils/kWayMerge";
import SampleView from "../view/sampleView/sampleView";
import UnitView from "../view/unitView";
import Collector from "./collector";
import FlowNode from "./flowNode";

/** The number of samples in a facet */
const SAMPLE_COUNT_VARIABLE = "sampleCount";

/**
 * Merges sample facets by groups that have been formed in SampleHandler.
 * Propagates the merged facets as new facets.
 *
 * @typedef {import("../view/view").default} View
 */
export default class MergeSampleFacets extends FlowNode {
    /**
     *
     * @param {any} params
     * @param {View} view
     */
    constructor(params, view) {
        super();

        this.view = view;

        const animator = view.context.animator;

        for (const v of view.getAncestors()) {
            if (v instanceof SampleView) {
                this.provenance = v.sampleHandler.provenance;
                this.provenance.addListener((state) =>
                    animator.requestTransition(() => {
                        this.reset();
                        this._mergeAndPropagate(state);
                        this.complete();
                    })
                );
            }
        }

        if (!this.provenance) {
            throw new Error("No SampleView was found!");
        }

        /** @type {any} */
        this.contextObject = undefined;
    }

    initialize() {
        this.contextObject = Object.create(super.getGlobalObject());

        const xChannelDef = this.view.parent.getEncoding()["x"];
        if (isFieldDef(xChannelDef)) {
            this.xAccessor = field(xChannelDef.field);
        } else {
            // TODO
            throw new Error("Crash!");
        }
    }

    /**
     * @param {import("./flowNode").Datum} datum
     */
    handle(datum) {
        // NOP. Block propagation.
        // TODO: Optimize by preventing calling altogether
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
        this._mergeAndPropagate(this.provenance.state);
        super.complete();
    }

    /**
     * @param {import("../sampleHandler/sampleState").State} state
     */
    _mergeAndPropagate(state) {
        const groupPaths = [...iterateGroupHierarcy(state.rootGroup)].filter(
            (path) => isSampleGroup(peek(path))
        );

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

                const iterator = kWayMerge(
                    samples.map(
                        (sample) => collector.facetBatches.get([sample]) ?? []
                    ),
                    this.xAccessor
                );

                for (const d of iterator) {
                    this._propagate(d);
                }
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
        /** @type {Set<import("../view/view").ScaleResolution>} */
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
            resolution.reconfigure();
        }
    }
}
