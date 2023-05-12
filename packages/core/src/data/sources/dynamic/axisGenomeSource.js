import SingleAxisDynamicSource from "./singleAxisDynamicSource";

/**
 * Propagates the genome (chromosome) data associated with the channel.
 * Can be used to generate a genome axis or fancy background grid.
 */
export default class AxisGenomeSource extends SingleAxisDynamicSource {
    /**
     * @param {import("../../../spec/data").AxisGenomeData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        super(view, params.channel);
    }

    async load() {
        this.publishData(this.genome.chromosomes);
    }
}
