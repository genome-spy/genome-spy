import { format as numberFormat } from "d3-format";

import { tickFormat, tickValues, validTicks } from "../../../scale/ticks.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { createDiscreteLegendEntries } from "../../../view/legend/legendEntries.js";
import { isChromeView } from "../../../view/viewSelectors.js";
import Suspension from "../../../utils/suspension.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const DEFAULT_QUANTITATIVE_ENTRY_COUNT = 5;
const LEGEND_SYMBOL_SIZE_FIELD = "_legendSymbolSize";
const LEGEND_STROKE_WIDTH_FIELD = "_legendStrokeWidth";

export default class LegendEntriesSource extends DataSource {
    /** @type {import("../../../spec/channel.js").Scalar[] | undefined} */
    #domain = undefined;

    #rangeUpdatePending = false;

    #rangeUpdateSuspension = new Suspension(() =>
        this.#flushPendingRangeUpdate()
    );

    /**
     * @param {import("../../../spec/data.js").LegendEntriesData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view);

        this.params = params;
        this.scaleResolution = findLegendScaleResolution(view, params.channel);
        if (!this.scaleResolution) {
            throw new Error(
                `The legend entries data source cannot find a resolved scale for channel "${params.channel}".`
            );
        }

        const publish = () => this.#publishEntries();
        this.scaleResolution.addEventListener("domain", publish);
        if (params.channel == "size") {
            const publishSizeEntries = () => {
                if (this.#deferRangeUpdateIfSuspended()) {
                    return;
                }

                this.#domain = undefined;
                this.#publishEntries();
            };
            this.scaleResolution.addEventListener("range", publishSizeEntries);
            this.view.registerDisposer(() =>
                this.scaleResolution.removeEventListener(
                    "range",
                    publishSizeEntries
                )
            );
        }
        this.view.registerDisposer(() =>
            this.scaleResolution.removeEventListener("domain", publish)
        );
    }

    get label() {
        return "legendEntriesSource";
    }

    async load() {
        if (this.#deferRangeUpdateIfSuspended()) {
            return;
        }

        this.#domain = undefined;
        this.#publishEntries();
    }

    /**
     * Defers size-entry updates caused by scale range changes. The live scale
     * still updates marks; only the layout helper fields are republished later.
     *
     * @returns {() => void}
     */
    suspendRangeUpdates() {
        if (this.params.channel != "size") {
            return () => undefined;
        }

        return this.#rangeUpdateSuspension.suspend();
    }

    #deferRangeUpdateIfSuspended() {
        if (
            this.params.channel != "size" ||
            !this.#rangeUpdateSuspension.active ||
            !this.#domain
        ) {
            return false;
        }

        this.#rangeUpdatePending = true;
        return true;
    }

    #flushPendingRangeUpdate() {
        if (this.#rangeUpdatePending) {
            this.#rangeUpdatePending = false;
            this.#domain = undefined;
            this.#publishEntries();
        }
    }

    #publishEntries() {
        const domain = this.scaleResolution.getDomain();

        if (!this.#domain || !shallowArrayEquals(domain, this.#domain)) {
            this.#domain = domain.slice();
            this.reset();
            this.beginBatch({ type: "file" });

            for (const datum of this.#createEntries()) {
                this._propagate(datum);
            }

            this.complete();
        }
    }

    #createEntries() {
        const entries =
            this.params.dataType == "quantitative"
                ? this.#createQuantitativeEntries()
                : this.#createDiscreteEntries();

        if (this.params.channel == "size") {
            const scale = this.scaleResolution.getScale();
            for (const entry of entries) {
                if (this.params.sizeMode == "strokeWidth") {
                    /** @type {Record<string, any>} */ (entry)[
                        LEGEND_STROKE_WIDTH_FIELD
                    ] = scale(entry.value);
                } else {
                    /** @type {Record<string, any>} */ (entry)[
                        LEGEND_SYMBOL_SIZE_FIELD
                    ] = scale(entry.value);
                }
            }
        }

        return entries;
    }

    #createDiscreteEntries() {
        const format = this.params.format;
        const formatter = format
            ? (
                  /** @type {import("../../../spec/channel.js").Scalar} */ value
              ) => numberFormat(format)(Number(value))
            : undefined;

        const entries = createDiscreteLegendEntries(
            this.scaleResolution,
            formatter
        );

        if (!this.params.values) {
            return entries;
        }

        const entriesByValue = new Map(
            entries.map((entry) => [entry.value, entry])
        );

        return this.params.values.flatMap((value) =>
            entriesByValue.has(value) ? [entriesByValue.get(value)] : []
        );
    }

    #createQuantitativeEntries() {
        const scale = this.scaleResolution.getScale();
        const count = this.params.count ?? DEFAULT_QUANTITATIVE_ENTRY_COUNT;
        const format = tickFormat(scale, count, this.params.format);
        const values = this.params.values
            ? validTicks(scale, this.params.values, count)
            : tickValues(scale, count);

        return values.map((value, index) => ({
            value,
            label: format(value),
            _legendIndex: index,
        }));
    }
}

/**
 * @param {import("../../../view/view.js").default} view
 * @param {import("../../../spec/channel.js").ChannelWithScale} channel
 */
export function findLegendScaleResolution(view, channel) {
    let parent = view.dataParent;
    while (parent && isChromeView(parent)) {
        parent = parent.dataParent;
    }

    return (
        parent?.getScaleResolution(channel) ?? view.getScaleResolution(channel)
    );
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").LegendEntriesData}
 */
function isLegendEntriesSource(params) {
    return params?.type == "legendEntries";
}

registerBuiltInLazyDataSource(isLegendEntriesSource, LegendEntriesSource);
