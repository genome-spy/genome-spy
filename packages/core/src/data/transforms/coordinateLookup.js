import { field } from "../../utils/field.js";
import SingleAxisLazySource from "../sources/lazy/singleAxisLazySource.js";
import KeyedLookupTransform from "./keyedLookup.js";

/**
 * Performs an exact keyed lookup from a lazy side input on a shared positional
 * scale. Primary rows outside the side input's loaded coverage are omitted.
 */
export default class CoordinateLookupTransform extends KeyedLookupTransform {
    /**
     * @param {import("../../spec/transform.js").CoordinateLookupParams} params
     * @param {import("../collector.js").default} foreignCollector
     * @param {import("../sources/dataSource.js").default} foreignSource
     * @param {import("../../view/view.js").default} view
     */
    constructor(params, foreignCollector, foreignSource, view) {
        const channel = params.channel ?? "x";
        if (!(foreignSource instanceof SingleAxisLazySource)) {
            throw new Error(
                "Coordinate lookup requires a single-axis lazy side data source."
            );
        }
        if (
            foreignSource.channel !== channel ||
            foreignSource.scaleResolution !== view.getScaleResolution(channel)
        ) {
            throw new Error(
                "Coordinate lookup data must use the same positional scale and channel."
            );
        }

        const position = createPositionAccessor(
            params.fields ?? params.key,
            foreignSource
        );
        let min = 0;
        let max = 0;

        super(params, foreignCollector, {
            isForeignDataReady: () =>
                foreignCollector.completed &&
                foreignSource.isDataReadyForDomain({
                    [channel]: foreignSource.scaleResolution.getDomain(),
                }),
            requestForeignData: () =>
                foreignSource.ensureDataForDomain(
                    foreignSource.scaleResolution.getDomain()
                ),
            prepareBatch: () => {
                const loadedDomain = foreignSource.getLoadedDomain();
                if (!loadedDomain) {
                    throw new Error(
                        "Coordinate lookup data has no loaded domain."
                    );
                }
                [min, max] =
                    loadedDomain[0] <= loadedDomain[1]
                        ? loadedDomain
                        : [loadedDomain[1], loadedDomain[0]];
            },
            acceptsDatum: (datum) => {
                const value = position(datum);
                return value >= min && value <= max;
            },
        });
    }
}

/**
 * @param {string | [string, string]} fields
 * @param {SingleAxisLazySource} foreignSource
 * @returns {(datum: import("../flowNode.js").Datum) => number}
 */
function createPositionAccessor(fields, foreignSource) {
    if (typeof fields === "string") {
        const accessor = field(fields);
        return (datum) => +accessor(datum);
    } else if (fields.length == 2) {
        const scale = foreignSource.scaleResolution.getScale();
        const genome = "genome" in scale ? scale.genome() : undefined;
        if (!genome) {
            throw new Error(
                "A chrom/pos coordinate lookup requires a locus scale."
            );
        }

        const chromAccessor = field(fields[0]);
        const posAccessor = field(fields[1]);
        return (datum) =>
            genome.toContinuous(chromAccessor(datum), +posAccessor(datum));
    } else {
        throw new Error(
            "Coordinate lookup requires one continuous field or chrom/pos fields."
        );
    }
}
