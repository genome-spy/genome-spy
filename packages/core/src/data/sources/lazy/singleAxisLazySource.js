import UnitView from "../../../view/unitView.js";
import DataSource from "../dataSource.js";

/**
 * @typedef {Partial<Record<import("../../../spec/channel.js").PrimaryPositionalChannel, number[]>>} DataReadinessRequest
 */

/**
 * @typedef {{isDataReadyForDomain: (request: DataReadinessRequest) => boolean}} DataReadinessCheckable
 */

/**
 * Base class for data sources that listen a domain and propagate data lazily.
 *
 * @abstract
 * @implements {DataReadinessCheckable}
 */
export default class SingleAxisLazySource extends DataSource {
    /**
     * Has to be resolved before any data can be requested upon domain changes.
     * @protected
     */
    initializedPromise = Promise.resolve();

    /**
     * @type {number[] | undefined}
     * @protected
     */
    _lastLoadedDomain;

    /**
     * @param {import("../../../view/view.js").default} view
     * @param {import("../../../spec/channel.js").PrimaryPositionalChannel} channel
     */
    constructor(view, channel) {
        super(view);

        if (!channel) {
            throw new Error(
                `No channel has been specified for the lazy data source. Must be either "x" or "y".`
            );
        } else if (channel !== "x" && channel !== "y") {
            throw new Error(
                `Invalid channel specified for the lazy data source: ${channel}. Must be either "x" or "y"`
            );
        }

        /** @type {import("../../../spec/channel.js").PrimaryPositionalChannel}  */
        this.channel = channel;

        this.scaleResolution = this.view.getScaleResolution(channel);
        if (!this.scaleResolution) {
            const sentences = [
                `The lazy data source cannot find a resolved scale for channel "${channel}".`,
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
                    /** @type {import("../../../spec/genome.js").ChromosomalLocus[]} */
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
     * Convenience getter for genome.
     *
     * @protected
     */
    get genome() {
        const scale = this.scaleResolution.getScale();
        if ("genome" in scale) {
            const genome = scale.genome();
            if (genome) {
                return genome;
            }
        }
        throw new Error("No genome has been defined!");
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     * @param {import("../../../spec/genome.js").ChromosomalLocus[]} complexDomain Chrom/Pos domain
     * @abstract
     */
    onDomainChanged(domain, complexDomain) {
        // Override me
    }

    /**
     * TODO: Get rid of this method.
     * Rendering should be requested by the collector.
     *
     * @protected
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
     * Resets the data flow and propagates the data, which should be an array of data chunks.
     * A chunk is an ordinary array of data objects. Typically all data objects are stored
     * in a single chunk, but sometimes they may be split into multiple chunks, e.g., one per
     * chromosome.
     *
     * @param {import("../../flowNode.js").Datum[][]} chunks An array of data chunks.
     * @protected
     */
    publishData(chunks) {
        this._lastLoadedDomain = Array.from(this.scaleResolution.getDomain());
        this.reset();
        this.beginBatch({ type: "file" });

        for (const data of chunks) {
            for (const d of data) {
                this._propagate(d);
            }
        }

        this.complete();
    }

    /**
     * @param {DataReadinessRequest} request
     * @returns {boolean}
     */
    isDataReadyForDomain(request) {
        const domain = request[this.channel];
        if (!domain || !this._lastLoadedDomain) {
            return false;
        }

        const [min, max] =
            domain[0] <= domain[1] ? domain : [domain[1], domain[0]];
        const [loadedMin, loadedMax] =
            this._lastLoadedDomain[0] <= this._lastLoadedDomain[1]
                ? this._lastLoadedDomain
                : [this._lastLoadedDomain[1], this._lastLoadedDomain[0]];
        return min >= loadedMin && max <= loadedMax;
    }
}
