import { isNumber } from "vega-util";

import { shallowArrayEqualsWithAccessors } from "@genome-spy/core/utils/arrayUtils";
import DataSource from "../dataSource";
import smoothstep from "@genome-spy/core/utils/smoothstep";
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

        /** @type {TickDatum[]} */
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

    #updateTickData() {
        const scale = this.scaleResolution.getScale();

        const oldTicks = this.ticks;
        const newTicks = generateTicks(
            this.axisProps,
            scale,
            this.#getAxisLength(),
            oldTicks
        );

        // If generateTicks returned a new array...
        if (newTicks !== oldTicks) {
            this.ticks = newTicks;

            this.reset();
            this.beginBatch({ type: "file" });

            for (const tick of this.ticks) {
                this._propagate(tick);
            }

            this.complete();
        }
    }

    async load() {
        this.#updateTickData();
    }
}

/**
 * @param {import("@genome-spy/core/spec/axis").Axis} axisProps
 * @param {any} scale
 * @param {number} axisLength Length of axis in pixels
 * @param {TickDatum[]} [oldTicks] Reuse the old data if the tick values are identical
 * @returns {TickDatum[]}
 *
 * @typedef {object} TickDatum
 * @prop {number} value
 * @prop {string} label
 */
function generateTicks(axisProps, scale, axisLength, oldTicks = []) {
    /**
     * Make ticks more dense in small plots
     *
     * @param {number} length
     */
    const tickSpacing = (length) => 25 + 60 * smoothstep(100, 700, length);

    let count = isNumber(axisProps.tickCount)
        ? axisProps.tickCount
        : Math.round(axisLength / tickSpacing(axisLength));

    count = tickCount(scale, count, axisProps.tickMinStep);

    const values = axisProps.values
        ? validTicks(scale, axisProps.values, count)
        : tickValues(scale, count);

    if (
        shallowArrayEqualsWithAccessors(
            values,
            oldTicks,
            (v) => v,
            (d) => d.value
        )
    ) {
        return oldTicks;
    } else {
        const format = tickFormat(scale, count, axisProps.format);

        return values.map((x) => ({ value: x, label: format(x) }));
    }
}
