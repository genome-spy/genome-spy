import { isDiscrete } from "vega-scale";
import { asArray } from "@genome-spy/core/utils/arrayUtils.js";

/**
 * Creates a facet-aware datum lookup function for a UnitView.
 *
 * @param {import("@genome-spy/core/view/unitView.js").default} view
 * @param {import("@genome-spy/core/data/collector.js").default} [collector]
 * @returns {(sampleId: import("@genome-spy/core/spec/channel.js").Scalar, x: import("@genome-spy/core/spec/channel.js").Scalar) => import("@genome-spy/core/data/flowNode.js").Datum}
 */
export function createDatumAtAccessor(view, collector = view.getCollector()) {
    const xAccessor = view.getDataAccessor("x");
    const x2Accessor = view.getDataAccessor("x2");
    const scaleType = view.getScaleResolution("x")?.getScale()?.type;
    const isDiscreteScale = scaleType ? isDiscrete(scaleType) : false;
    const useRange = !isDiscreteScale && !!x2Accessor;

    if (!collector || !xAccessor) {
        return () => undefined;
    }

    if (isDiscreteScale) {
        return (sampleId, x) => {
            const data = collector.facetBatches.get(asArray(sampleId));
            return data?.find((datum) => x == xAccessor(datum));
        };
    }

    if (useRange) {
        return (sampleId, x) => {
            const data = collector.facetBatches.get(asArray(sampleId));
            return data?.find(
                (datum) => x >= xAccessor(datum) && x < x2Accessor(datum)
            );
        };
    }

    return (sampleId, x) => {
        const data = collector.facetBatches.get(asArray(sampleId));
        return data?.find((datum) => x == xAccessor(datum));
    };
}
