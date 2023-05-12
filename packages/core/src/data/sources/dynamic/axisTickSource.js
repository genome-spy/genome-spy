import { isNumber } from "vega-util";

import { shallowArrayEquals } from "../../../utils/arrayUtils";
import smoothstep from "../../../utils/smoothstep";
import {
    validTicks,
    tickValues,
    tickFormat,
    tickCount,
} from "../../../scale/ticks";
import SingleAxisDynamicSource from "./singleAxisDynamicSource";

/**
 *
 */
export default class AxisTickSource extends SingleAxisDynamicSource {
    /**
     * @type {import("../../../spec/channel").Scalar[]}
     */
    ticks = [];

    /**
     * @param {import("../../../spec/data").AxisTicksData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").AxisTicksData} params */
        const paramsWithDefaults = {
            axis: {},
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = params;

        // Now this depends on a "private" method of the view.
        // TODO: Figure out a cleaner way to monitor changes in view coords.
        this.scaleResolution.members[0]?.view._addBroadcastHandler(
            "layoutComputed",
            () => this.onDomainChanged()
        );
    }

    async onDomainChanged() {
        // Note, although this function is async, it is not awaited. Data are updated
        // synchronously to ensure that the new ticks are available before the next frame is drawn.

        const scale = this.scaleResolution.getScale();
        const axisParams = this.params.axis;
        const axisLength = this.getAxisLength();

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

        if (!shallowArrayEquals(ticks, this.ticks)) {
            this.ticks = ticks;

            const format = tickFormat(scale, requestedCount, axisParams.format);
            this.publishData(
                ticks.map((tick) => ({ value: tick, label: format(tick) }))
            );
        }
    }

    async load() {
        this.publishData([]); // TODO: Figure out why this is needed.
        this.onDomainChanged();
    }
}
