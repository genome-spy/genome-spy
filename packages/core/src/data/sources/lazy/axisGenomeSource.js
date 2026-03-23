import { registerBuiltInLazyDataSource } from "./lazyDataSourceRegistry.js";
import SingleAxisLazySource from "./singleAxisLazySource.js";

/**
 * Propagates the genome (chromosome) data associated with the channel.
 * Can be used to generate a genome axis or fancy background grid.
 */
export default class AxisGenomeSource extends SingleAxisLazySource {
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
        this.publishData([this.genome.chromosomes]);
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
