import { isNumber } from "vega-util";

import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import smoothstep from "../../../utils/smoothstep.js";
import {
    validTicks,
    tickValues,
    tickFormat,
    tickCount,
} from "../../../scale/ticks.js";
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

        this.params = params;
    }

    get label() {
        return "axisTickSource";
    }

    async load() {
        // Force the ticks to be recalculated. This is needed because the async
        // initialization process and non-deterministic order of events.
        this.ticks = null;
        this.onDomainChanged();
    }

    onDomainChanged() {
        // Note, although this function is async, it is not awaited. Data are updated
        // synchronously to ensure that the new ticks are available before the next frame is drawn.

        const scale = this.scaleResolution.getScale();
        const axisLength = this.scaleResolution.getAxisLength();
        const axisParams = this.params.axis;

        /**
         * Make ticks more dense in small plots.
         * TODO: Make configurable
         *
         * @param {number} length
         */
        const tickSpacing = (length) => 25 + 60 * smoothstep(100, 700, length);

        const requestedCount = isNumber(axisParams.tickCount)
            ? axisParams.tickCount
            : Math.round(axisLength / tickSpacing(axisLength));

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
