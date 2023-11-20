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

    async load() {
        this.publishData(this.genome.chromosomes);
    }
}
