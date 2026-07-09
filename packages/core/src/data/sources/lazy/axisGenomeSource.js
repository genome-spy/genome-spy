import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";

/**
 * Propagates the genome (chromosome) data associated with the channel.
 * Can be used to generate a genome axis or fancy background grid.
 */
export default class AxisGenomeSource extends SingleAxisLazySource {
    #loaded = false;

    /**
     * @param {import("../../../spec/data.js").AxisGenomeData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        super(view, params.channel);
    }

    get label() {
        return "axisGenomeSource";
    }

    async load() {
        this.#loaded = true;
        this.publishData([this.genome.chromosomes]);
    }

    /**
     * @param {number[]} _domain
     */
    requestDataForDomain(_domain) {
        void this.load();
    }

    /**
     * @param {import("./singleAxisLazySource.js").DataReadinessRequest} _request
     */
    isDataReadyForDomain(_request) {
        return this.#loaded;
    }
}

/**
 * @param {import("../../../spec/data.js").LazyDataParams} params
 * @returns {params is import("../../../spec/data.js").AxisGenomeData}
 */
function isAxisGenomeSource(params) {
    return params?.type == "axisGenome";
}

registerBuiltInLazyDataSource(isAxisGenomeSource, AxisGenomeSource);
