import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { isExprRef } from "../../../paramRuntime/paramUtils.js";
import ViewParamRuntime from "../../../paramRuntime/viewParamRuntime.js";
import {
    validTicks,
    tickValues,
    tickFormat,
    tickCount,
} from "../../../scale/ticks.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";

/**
 *
 */
export default class AxisTickSource extends SingleAxisLazySource {
    /**
     * @type {import("../../../spec/channel.js").Scalar[]}
     */
    ticks = [];

    /**
     * @type {import("../../../paramRuntime/types.js").ExprRefFunction | undefined}
     */
    #tickCountExpression;

    /**
     * @type {((axisLength: number) => void) | undefined}
     */
    #setAxisLength;

    /**
     * @param {import("../../../spec/data.js").AxisTicksData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").AxisTicksData} params */
        const paramsWithDefaults = {
            axis: {},
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        const tickCountSpec = paramsWithDefaults.axis.tickCount;
        if (isExprRef(tickCountSpec)) {
            const paramRuntime = new ViewParamRuntime(
                () => view.paramRuntime,
                (channel) => view.getScaleResolution(channel)
            );
            this.#setAxisLength = paramRuntime.allocateSetter(
                "axisLength",
                0,
                true
            );
            this.#tickCountExpression = paramRuntime.watchExpression(
                tickCountSpec.expr,
                () => {
                    void this.onDomainChanged();
                },
                {
                    scopeOwned: false,
                    registerDisposer: (disposer) =>
                        this.registerDisposer(disposer),
                }
            );
            this.registerDisposer(() => paramRuntime.dispose());
        }
    }

    get label() {
        return "axisTickSource";
    }

    async load() {
        // Force the ticks to be recalculated. This is needed because the async
        // initialization process and non-deterministic order of events.
        this.ticks = null;
        await this.onDomainChanged();
    }

    async onDomainChanged() {
        const scale = this.scaleResolution.getScale();
        const axisLength = this.scaleResolution.getAxisLength();
        const axisParams = this.params.axis;
        this.#setAxisLength?.(axisLength);

        const requestedCount = this.#tickCountExpression
            ? this.#tickCountExpression()
            : axisParams.tickCount;

        const count = tickCount(scale, requestedCount, axisParams.tickMinStep);

        const ticks = axisParams.values
            ? validTicks(scale, axisParams.values, count)
            : tickValues(scale, count);

        if (this.ticks == null || !shallowArrayEquals(ticks, this.ticks)) {
            this.ticks = ticks;

            const format = tickFormat(scale, requestedCount, axisParams.format);
            this.publishData([
                ticks.map((tick) => ({ value: tick, label: format(tick) })),
            ]);
        }
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").AxisTicksData}
 */
function isAxisTickSource(params) {
    return params?.type == "axisTicks";
}

registerBuiltInLazyDataSource(isAxisTickSource, AxisTickSource);
