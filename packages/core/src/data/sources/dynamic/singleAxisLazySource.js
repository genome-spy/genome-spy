import UnitView from "../../../view/unitView.js";
import DataSource from "../dataSource.js";
import { reconfigureScales } from "../../../view/scaleResolution.js";

/**
 * Base class for data sources that listen a domain and propagate data lazily.
 */
export default class SingleAxisLazySource extends DataSource {
    /**
     * @param {import("../../../view/view").default} view
     * @param {import("../../../spec/channel").PrimaryPositionalChannel} channel
     */
    constructor(view, channel) {
        super();

        this.view = view;

        if (!channel) {
            throw new Error(
                `No channel has been specified for the dynamic data source. Must be either "x" or "y".`
            );
        } else if (channel !== "x" && channel !== "y") {
            throw new Error(
                `Invalid channel specified for the dynamic data source: ${channel}. Must be either "x" or "y"`
            );
        }

        /** @type {import("../../../spec/channel").PrimaryPositionalChannel}  */
        this.channel = channel;

        this.scaleResolution = this.view.getScaleResolution(channel);
        if (!this.scaleResolution) {
            const sentences = [
                `The dynamic data source cannot find a resolved scale for channel "${channel}".`,
            ];
            if (!(this.view instanceof UnitView)) {
                sentences.push(
                    `Make sure the view has a "shared" scale resolution as it is not a unit view.`
                );
            }

            throw new Error(sentences.join(" "));
        }

        const fireDomainChanged = () => {
            if (this.view.isVisible()) {
                this.onDomainChanged(
                    this.scaleResolution.getDomain(),
                    /** @type {import("../../../spec/genome").ChromosomalLocus[]} */
                    (this.scaleResolution.getComplexDomain())
                );
            }
        };

        this.scaleResolution.addEventListener("domain", fireDomainChanged);
        this.view.context.addBroadcastListener(
            "layoutComputed",
            fireDomainChanged
        );
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
        this.view.context.animator.requestRender();
    }

    async load() {
        // Dummy initialization cycle. TODO: Figure out why this is needed.
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

        reconfigureScales(this.view);

        this.requestRender();
    }
}
