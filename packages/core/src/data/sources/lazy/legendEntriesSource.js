import { shallowArrayEquals } from "../../../utils/arrayUtils.js";
import { createDiscreteLegendEntries } from "../../../view/legend/legendEntries.js";
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
        this.scaleResolution =
            view.dataParent?.getScaleResolution(params.channel) ??
            view.getScaleResolution(params.channel);
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

            for (const datum of createDiscreteLegendEntries(
                this.scaleResolution
            )) {
                this._propagate(datum);
            }

            this.complete();
        }
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").LegendEntriesData}
 */
function isLegendEntriesSource(params) {
    return params?.type == "legendEntries";
}

registerBuiltInLazyDataSource(isLegendEntriesSource, LegendEntriesSource);
