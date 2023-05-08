import { isNumber } from "vega-util";

import { shallowArrayEquals } from "../../../utils/arrayUtils";
import DataSource from "../dataSource";
import smoothstep from "../../../utils/smoothstep";
import {
    validTicks,
    tickValues,
    tickFormat,
    tickCount,
} from "../../../scale/ticks";

/**
 *
 */
export default class AxisTickSource extends DataSource {
    /**
     * @param {import("../../../spec/data").AxisTicksData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        super();

        this.params = params;
        this.axisProps = params.axis ?? {};
        this.view = view;

        /** @type {import("../../../utils/domainArray").scalar[]} */
        this.ticks = [];

        this.channel = this.params.channel;
        if (this.channel !== "x" && this.channel !== "y") {
            throw new Error(
                `Invalid channel: ${this.channel}. Must be "x" or "y"`
            );
        }

        this.scaleResolution = this.view.getScaleResolution(this.channel);
        if (!this.scaleResolution) {
            throw new Error(
                `No scale resolution found for channel "${this.channel}".`
            );
        }

        this.scaleResolution.addEventListener("domain", () => {
            this.#updateTickData();
        });

        // Now this depends on a "private" method of the view.
        // TODO: Figure out a cleaner way to monitor changes in view coords.
        this.scaleResolution.members[0]?.view._addBroadcastHandler(
            "layoutComputed",
            () => {
                this.#updateTickData();
            }
        );
    }

    /**
     * Returns the length of the axis in pixels. Chooses the smallest of the views.
     * They should all be the same, but some exotic configuration might break that assumption.
     */
    #getAxisLength() {
        const lengths = this.scaleResolution.members
            .map(
                (m) =>
                    m.view.coords?.[this.channel === "x" ? "width" : "height"]
            )
            .filter((len) => len > 0);

        return lengths.length
            ? lengths.reduce((a, b) => Math.min(a, b), 10000)
            : 0;
    }

    /**
     * Recalculates ticks, propagates if necessary.
     */
    #updateTickData() {
        const scale = this.scaleResolution.getScale();
        const axisProps = this.axisProps;
        const axisLength = this.#getAxisLength();

        /**
         * Make ticks more dense in small plots
         *
         * @param {number} length
         */
        const tickSpacing = (length) => 25 + 60 * smoothstep(100, 700, length);

        const requestedCount = isNumber(axisProps.tickCount)
            ? axisProps.tickCount
            : Math.round(axisLength / tickSpacing(axisLength));

        const count = tickCount(scale, requestedCount, axisProps.tickMinStep);

        const ticks = axisProps.values
            ? validTicks(scale, axisProps.values, count)
            : tickValues(scale, count);

        if (!shallowArrayEquals(ticks, this.ticks)) {
            this.ticks = ticks;

            const format = tickFormat(
                scale,
                requestedCount,
                this.axisProps.format
            );

            this.reset();
            this.beginBatch({ type: "file" });

            for (const tick of ticks) {
                this._propagate({ value: tick, label: format(tick) });
            }

            this.complete();
        }
    }

    async load() {
        this.#updateTickData();
    }
}
