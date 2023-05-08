import DataSource from "../dataSource";

/**
 * Propagates the genome (chromosome) data associated with the channel.
 * Can be used to generate a genome axis or fancy background grid.
 */
export default class AxisGenomeSource extends DataSource {
    /**
     * @param {{channel: "x" | "y"}} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        super();

        this.params = params;
        this.view = view;

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
    }

    async load() {
        const chroms = this.scaleResolution.getGenome().chromosomes;

        this.reset();
        this.beginBatch({ type: "file" });

        for (const chrom of chroms) {
            this._propagate(chrom);
        }

        this.complete();
    }
}
