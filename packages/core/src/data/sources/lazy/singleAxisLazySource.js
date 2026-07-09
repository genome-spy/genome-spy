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
     * Domain/layout listeners are registered lazily in activate(), not in the
     * constructor. The view hierarchy can compute layout while initialization
     * is still waiting for fonts, and eager lazy loading would let data reach
     * text marks before their font metrics are available.
     */
    #listening = false;

    /** @type {() => void} */
    #fireDomainChanged;

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
            if (!isUnitViewLike(this.view)) {
                sentences.push(
                    `Make sure the view has a "shared" scale resolution as it is not a unit view.`
                );
            }

            throw new Error(sentences.join(" "));
        }

        this.#fireDomainChanged = () => {
            if (!this.disposed && this.view.isVisible()) {
                // Axis-only sources may use resolutions that expose only a
                // numeric domain. Genomic sources receive the complex
                // chromosome/position domain when it is available.
                this.#requestCurrentDomainData(
                    this.scaleResolution.getDomain()
                );
            }
        };
    }

    /**
     * Starts reacting to domain and layout changes. This is called by the
     * shared data-source loading lifecycle after fonts and graphics
     * initialization are ready for incoming data.
     */
    activate() {
        if (this.#listening) {
            return;
        }

        this.#listening = true;
        this.scaleResolution.addEventListener(
            "domain",
            this.#fireDomainChanged
        );
        this.registerDisposer(() =>
            this.scaleResolution.removeEventListener(
                "domain",
                this.#fireDomainChanged
            )
        );
        this.view.context.addBroadcastListener(
            "layoutComputed",
            this.#fireDomainChanged
        );
        this.registerDisposer(() =>
            this.view.context.removeBroadcastListener(
                "layoutComputed",
                this.#fireDomainChanged
            )
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
     * Reloads the current domain when downstream transforms repropagate and no
     * collector is available upstream to replay stored data.
     */
    repropagate() {
        this.requestDataForDomain(this.scaleResolution.getDomain());
    }

    /**
     * Requests data for the specified domain when the source does not have it.
     *
     * @param {number[]} domain
     */
    ensureDataForDomain(domain) {
        if (!this.isDataReadyForDomain({ [this.channel]: domain })) {
            this.requestDataForDomain(domain);
        }
    }

    /**
     * Requests data for the specified domain.
     *
     * @param {number[]} domain
     */
    requestDataForDomain(domain) {
        this.#requestCurrentDomainData(domain);
    }

    /**
     * @param {number[]} domain
     */
    #requestCurrentDomainData(domain) {
        const complexDomain =
            "getComplexDomain" in this.scaleResolution
                ? this.scaleResolution.getComplexDomain()
                : undefined;
        this.onDomainChanged(
            domain,
            /** @type {import("../../../spec/genome.js").ChromosomalLocus[]} */
            (complexDomain)
        );
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

/**
 * Unit views expose `getMarkType()`, while container and helper views do not.
 *
 * @param {import("../../../view/view.js").default} view
 * @returns {view is import("../../../view/unitView.js").default}
 */
function isUnitViewLike(view) {
    return typeof (/** @type {any} */ (view).getMarkType) == "function";
}
