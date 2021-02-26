import { isFieldDef } from "../encoder/encoder";
import {
    isSampleGroup,
    iterateGroupHierarcy
} from "../sampleHandler/sampleHandler";
import { peek, shallowArrayEquals } from "../utils/arrayUtils";
import { field } from "../utils/field";
import kWayMerge from "../utils/kWayMerge";
import { getCachedOrCall } from "../utils/propertyCacher";
import SampleView from "../view/sampleView/sampleView";
import ScaleResolution from "../view/scaleResolution";
import UnitView from "../view/unitView";
import View from "../view/view";
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
export default class MergeFacets extends FlowNode {
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
                v.sampleHandler.provenance.addListener(state =>
                    animator.requestTransition(() =>
                        this._facetGroupsUpdated(state)
                    )
                );
            }
        }

        this.contextObject = Object.create(super.getGlobalObject());
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

    _getXAccessor() {
        const xChannelDef = this.view.parent.getEncoding()["x"];
        if (isFieldDef(xChannelDef)) {
            return field(xChannelDef.field);
        } else {
            // TODO
            throw new Error("Crash!");
        }
    }

    /**
     * @param {import("../sampleHandler/sampleState").State} state
     */
    _facetGroupsUpdated(state) {
        const groupPaths = [
            ...iterateGroupHierarcy(state.rootGroup)
        ].filter(path => isSampleGroup(peek(path)));

        this.reset();

        // TODO: Recycle accessor
        const xAccessor = this._getXAccessor();

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
                        sample => collector.facetBatches.get([sample]) ?? []
                    ),
                    xAccessor
                );

                for (const d of iterator) {
                    this._propagate(d);
                }
            }
        }

        this.complete();

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
        /** @type {Set<ScaleResolution>} */
        const resolutions = new Set();
        this.view.visit(view => {
            if (view instanceof UnitView && view.getEncoding().y) {
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
