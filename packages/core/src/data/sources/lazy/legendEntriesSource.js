import { format as numberFormat } from "d3-format";

import { tickFormat, tickValues } from "../../../scale/ticks.js";
import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { createDiscreteLegendEntries } from "../../../view/legend/legendEntries.js";
import { isChromeView } from "../../../view/viewSelectors.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

const DEFAULT_QUANTITATIVE_ENTRY_COUNT = 5;

export default class LegendEntriesSource extends DataSource {
    /** @type {import("../../../spec/channel.js").Scalar[] | undefined} */
    #domain = undefined;

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
        this.view.registerDisposer(() =>
            this.scaleResolution.removeEventListener("domain", publish)
        );
    }

    get label() {
        return "legendEntriesSource";
    }

    async load() {
        this.#domain = undefined;
        this.#publishEntries();
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
        if (this.params.dataType == "quantitative") {
            return this.#createQuantitativeEntries();
        } else {
            const format = this.params.format;
            const formatter = format
                ? (
                      /** @type {import("../../../spec/channel.js").Scalar} */ value
                  ) => numberFormat(format)(Number(value))
                : undefined;

            return createDiscreteLegendEntries(this.scaleResolution, formatter);
        }
    }

    #createQuantitativeEntries() {
        const scale = this.scaleResolution.getScale();
        const count = this.params.count ?? DEFAULT_QUANTITATIVE_ENTRY_COUNT;
        const format = tickFormat(scale, count, this.params.format);

        return tickValues(scale, count).map((value, index) => ({
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
