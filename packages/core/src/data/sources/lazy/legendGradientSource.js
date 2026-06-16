import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import createScale from "../../../scale/scale.js";
import { tickCount, tickFormat, tickValues } from "../../../scale/ticks.js";
import { findLegendScaleResolution } from "./legendEntriesSource.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const DEFAULT_SAMPLE_COUNT = 64;
const DEFAULT_TICK_COUNT = 5;

/**
 * @typedef {((value: number) => number) & { invert: (position: number) => number }} NormalizedPositionScale
 */

/**
 * @param {import("../../../types/encoder.js").VegaScale} scale
 * @param {number} start
 * @param {number} stop
 * @returns {NormalizedPositionScale}
 */
function createNormalizedScale(scale, start, stop) {
    const props =
        /** @type {{ props?: import("../../../spec/scale.js").Scale }} */ (
            scale
        ).props;
    const type = props?.type;

    if (type) {
        const positionScale = createScale({
            type,
            domain: [start, stop],
            range: [0, 1],
            zero: false,
            nice: false,
        });
        if (
            "invert" in positionScale &&
            typeof positionScale.invert == "function"
        ) {
            return /** @type {NormalizedPositionScale} */ (positionScale);
        }
    }

    if (
        "copy" in scale &&
        typeof scale.copy == "function" &&
        "invert" in scale &&
        typeof scale.invert == "function"
    ) {
        const normalizedScale = scale.copy();
        normalizedScale.range([0, 1]);
        return /** @type {NormalizedPositionScale} */ (normalizedScale);
    } else {
        return createLinearPositionScale(start, stop);
    }
}

/**
 * @param {number} start
 * @param {number} stop
 * @returns {(position: number) => number}
 */
function createLinearPositionInverter(start, stop) {
    return (position) => start + (stop - start) * position;
}

/**
 * @param {number} start
 * @param {number} stop
 * @returns {NormalizedPositionScale}
 */
function createLinearPositionScale(start, stop) {
    const scale = /** @type {NormalizedPositionScale} */ (
        (/** @type {number} */ value) => (value - start) / (stop - start)
    );
    scale.invert = createLinearPositionInverter(start, stop);
    return scale;
}

/**
 * @param {number[]} domain
 * @returns {[number, number]}
 */
function extendThresholdDomain(domain) {
    const start = domain[0];
    const stop = domain.at(-1);
    const span = stop - start;
    const count = domain.length - 1;
    const adjust = count ? span / count : 0.1;

    return [start - adjust, stop + adjust];
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
        const scale = this.scaleResolution.getScale();
        if (scale.type == "threshold") {
            this.#publishThresholdGradient();
            return;
        }

        const count = this.params.count ?? DEFAULT_SAMPLE_COUNT;
        const positionScale = createNormalizedScale(scale, start, stop);
        const invertPosition = (/** @type {number} */ position) =>
            positionScale.invert(position);

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

    #publishThresholdGradient() {
        const domain = this.scaleResolution.getDomain().map(Number);
        const [start, stop] = extendThresholdDomain(domain);
        const positionScale = createLinearPositionScale(start, stop);
        const extendedDomain = [start, ...domain, stop];

        for (let index = 0; index < extendedDomain.length - 1; index++) {
            const value0 = extendedDomain[index];
            const value1 = extendedDomain[index + 1];
            const value = (value0 + value1) / 2;
            this._propagate({
                position0: positionScale(value0),
                position1: positionScale(value1),
                position: positionScale(value),
                value,
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
        const positionExtent =
            scale.type == "threshold"
                ? extendThresholdDomain(
                      this.scaleResolution.getDomain().map(Number)
                  )
                : [start, stop];
        const positionScale = createNormalizedScale(
            scale,
            positionExtent[0],
            positionExtent[1]
        );
        const requestedCount = this.params.count ?? DEFAULT_TICK_COUNT;
        const count = tickCount(scale, requestedCount, undefined);
        const format = tickFormat(scale, requestedCount);

        for (const value of tickValues(scale, count)) {
            const label = format(value);
            if (!label) {
                continue;
            }

            this._propagate({
                value,
                position: positionScale(value),
                label,
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
