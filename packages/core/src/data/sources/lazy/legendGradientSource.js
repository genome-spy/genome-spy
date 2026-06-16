import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { tickCount, tickFormat, tickValues } from "../../../scale/ticks.js";
import { findLegendScaleResolution } from "./legendEntriesSource.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const DEFAULT_SAMPLE_COUNT = 64;
const DEFAULT_TICK_COUNT = 5;

/**
 * @param {import("../../../types/encoder.js").VegaScale} scale
 * @returns {import("../../../types/encoder.js").VegaScale}
 */
function createNormalizedScale(scale) {
    const normalizedScale =
        "copy" in scale && typeof scale.copy == "function"
            ? scale.copy()
            : scale;
    normalizedScale.range([0, 1]);
    return normalizedScale;
}

/**
 * @param {number} start
 * @param {number} stop
 * @returns {(position: number) => number}
 */
function createLinearPositionInverter(start, stop) {
    return (position) => start + (stop - start) * position;
}

class LegendGradientBaseSource extends DataSource {
    /** @type {import("../../../spec/channel.js").Scalar[] | undefined} */
    #domain = undefined;

    /**
     * @param {import("../../../spec/data.js").LegendGradientData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = params;
        this.scaleResolution = findLegendScaleResolution(view, params.channel);
        if (!this.scaleResolution) {
            throw new Error(
                `The gradient legend data source cannot find a resolved scale for channel "${params.channel}".`
            );
        }

        const publish = () => this.#publishData();
        this.scaleResolution.addEventListener("domain", publish);
        this.view.registerDisposer(() =>
            this.scaleResolution.removeEventListener("domain", publish)
        );
    }

    async load() {
        this.#domain = undefined;
        this.#publishData();
    }

    #publishData() {
        const domain = this.scaleResolution.getDomain();

        if (!this.#domain || !shallowArrayEquals(domain, this.#domain)) {
            const start = Number(domain[0]);
            const stop = Number(domain.at(-1));
            if (!Number.isFinite(start) || !Number.isFinite(stop)) {
                throw new Error(
                    "Gradient legends require a finite numeric scale domain."
                );
            }

            this.#domain = domain.slice();
            this.reset();
            this.beginBatch({ type: "file" });
            this.publishData(start, stop);
            this.complete();
        }
    }

    /**
     * @param {number} start
     * @param {number} stop
     */
    publishData(start, stop) {
        throw new Error(
            "Gradient legend data source must implement publishData."
        );
    }
}

export default class LegendGradientSource extends LegendGradientBaseSource {
    get label() {
        return "legendGradientSource";
    }

    /**
     * @param {number} start
     * @param {number} stop
     */
    publishData(start, stop) {
        const count = this.params.count ?? DEFAULT_SAMPLE_COUNT;
        const positionScale = createNormalizedScale(
            this.scaleResolution.getScale()
        );
        const invertPosition =
            "invert" in positionScale &&
            typeof positionScale.invert == "function"
                ? (/** @type {number} */ position) =>
                      /** @type {number} */ (positionScale.invert(position))
                : createLinearPositionInverter(start, stop);

        for (let index = 0; index < count; index++) {
            const position0 = index / count;
            const position1 = (index + 1) / count;
            const position = (index + 0.5) / count;
            this._propagate({
                position0,
                position1,
                position,
                value: invertPosition(position),
                _legendGradientIndex: index,
            });
        }
    }
}

class LegendGradientTicksSource extends LegendGradientBaseSource {
    get label() {
        return "legendGradientTicksSource";
    }

    /**
     * @param {number} start
     * @param {number} stop
     */
    publishData(start, stop) {
        const scale = this.scaleResolution.getScale();
        const positionScale = createNormalizedScale(scale);
        const requestedCount = this.params.count ?? DEFAULT_TICK_COUNT;
        const count = tickCount(scale, requestedCount, undefined);
        const format = tickFormat(scale, requestedCount);

        for (const value of tickValues(scale, count)) {
            this._propagate({
                value,
                position: positionScale(value),
                label: format(value),
            });
        }
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").LegendGradientData}
 */
function isLegendGradientSource(params) {
    return params?.type == "legendGradient";
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").LegendGradientTicksData}
 */
function isLegendGradientTicksSource(params) {
    return params?.type == "legendGradientTicks";
}

registerBuiltInLazyDataSource(isLegendGradientSource, LegendGradientSource);
registerBuiltInLazyDataSource(
    isLegendGradientTicksSource,
    LegendGradientTicksSource
);
