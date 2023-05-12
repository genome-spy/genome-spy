import DataSource from "../dataSource";

/**
 * Base class for data sources that listen a domain and propagate data dynamically.
 */
export default class SingleAxisDynamicSource extends DataSource {
    /**
     * @param {import("../../../view/view").default} view
     * @param {import("../../../spec/channel").PrimaryPositionalChannel} channel
     */
    constructor(view, channel) {
        super();

        this.view = view;

        if (channel !== "x" && channel !== "y") {
            throw new Error(`Invalid channel: ${channel}. Must be "x" or "y"`);
        }

        /** @type {import("../../../spec/channel").PrimaryPositionalChannel}  */
        this.channel = channel;

        this.scaleResolution = this.view.getScaleResolution(channel);
        if (!this.scaleResolution) {
            throw new Error(
                `No scale resolution found for channel "${channel}".`
            );
        }

        this.scaleResolution.addEventListener("domain", (event) => {
            this.onDomainChanged(
                event.scaleResolution.getDomain(),
                /** @type {import("../../../spec/genome").ChromosomalLocus[]} */ (
                    event.scaleResolution.getComplexDomain()
                )
            );
        });
    }

    /**
     * Returns the length of the axis in pixels. Chooses the smallest of the views.
     * They should all be the same, but some exotic configuration might break that assumption.
     */
    getAxisLength() {
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

    /**
     * Convenience getter for genome.
     */
    get genome() {
        return this.scaleResolution.getGenome();
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     * @param {import("../../../spec/genome").ChromosomalLocus[]} complexDomain Chrom/Pos domain
     */
    async onDomainChanged(domain, complexDomain) {
        // Override me
    }

    /**
     * TODO: Get rid of this method.
     * Rendering should be requested by the collector.
     */
    requestRender() {
        // An awfully hacky way.
        this.scaleResolution.members[0].view.context.animator.requestRender();
    }

    async load() {
        // TODO: Fetch data for the initial domain
        this.reset();
        this.complete();
    }

    /**
     *
     * @param {import("../../flowNode").Datum[]} data
     */
    publishData(data) {
        this.reset();
        this.beginBatch({ type: "file" });

        for (const d of data) {
            this._propagate(d);
        }

        this.complete();
        this.requestRender();
    }
}