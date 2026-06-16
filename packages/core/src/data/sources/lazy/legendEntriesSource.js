import { format as numberFormat } from "d3-format";

import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { createDiscreteLegendEntries } from "../../../view/legend/legendEntries.js";
import { isChromeView } from "../../../view/viewSelectors.js";
import DataSource from "../dataSource.js";
import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";

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

            const format = this.params.format;
            const formatter = format
                ? (
                      /** @type {import("../../../spec/channel.js").Scalar} */ value
                  ) => numberFormat(format)(Number(value))
                : undefined;

            for (const datum of createDiscreteLegendEntries(
                this.scaleResolution,
                formatter
            )) {
                this._propagate(datum);
            }

            this.complete();
        }
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
