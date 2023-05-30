import { RemoteFile } from "generic-filehandle";
import { TabixIndexedFile } from "@gmod/tabix";
import gff from "@gmod/gff";

import SingleAxisDynamicSource from "./singleAxisDynamicSource";
import windowedMixin from "./windowedMixin";
import { debounce } from "../../../utils/debounce";
import addBaseUrl from "@genome-spy/core/utils/addBaseUrl";

export default class TabixSource extends windowedMixin(
    SingleAxisDynamicSource
) {
    /** Keep track of the order of the requests */
    lastRequestId = 0;

    /** @type {TabixIndexedFile} */
    tbiIndex;

    /**
     * @param {import("../../../spec/data").TabixData} params
     * @param {import("../../../view/view").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data").TabixData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 10_000_000,
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for TabixSource");
        }

        if (
            this.params.parser === "gff3" ||
            this.params.url.includes(".gff3")
        ) {
            //
        } else {
            throw new Error(
                "No parser defined for TabixSource. Cannot infer parser from file extension."
            );
        }

        const withBase = (/** @type {string} */ uri) =>
            new RemoteFile(addBaseUrl(uri, this.view.getBaseUrl()));

        this.tbiIndex = new TabixIndexedFile({
            filehandle: withBase(this.params.url),
            tbiFilehandle: withBase(
                this.params.indexUrl ?? this.params.url + ".tbi"
            ),
        });

        this.doDebouncedRequest = debounce(
            this.doRequest.bind(this),
            200,
            false
        );
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} domain Linearized domain
     */
    async onDomainChanged(domain) {
        const windowSize = this.params.windowSize;

        if (domain[1] - domain[0] > windowSize) {
            return;
        }

        const quantizedInterval = this.quantizeInterval(domain, windowSize);

        if (this.checkAndUpdateLastInterval(quantizedInterval)) {
            this.doDebouncedRequest(quantizedInterval);
        }
    }

    /**
     * Listen to the domain change event and update data when the covered windows change.
     *
     * @param {number[]} interval linearized domain
     */
    async doRequest(interval) {
        const featureResponse = await this.getFeatures(interval);

        // Discard late responses
        if (featureResponse.requestId < this.lastRequestId) {
            return;
        }

        this.publishData(featureResponse.features);
    }

    /**
     *
     * @param {number[]} interval
     */
    async getFeatures(interval) {
        let requestId = ++this.lastRequestId;

        // TODO: Abort previous requests
        const abortController = new AbortController();

        const discreteChromosomeIntervals =
            this.genome.continuousToDiscreteChromosomeIntervals(interval);

        // TODO: Error handling
        const featuresWithChrom = await Promise.all(
            discreteChromosomeIntervals.map(async (d) => {
                /** @type {string[]} */
                const lines = [];

                await this.tbiIndex.getLines(d.chrom, d.startPos, d.endPos, {
                    lineCallback: (line) => {
                        lines.push(line);
                    },
                    signal: abortController.signal,
                });

                // Hmm. It's silly that we have to first collect individual lines and then join them.
                // eslint-disable-next-line no-sync
                const features = gff.parseStringSync(lines.join("\n"), {
                    parseSequences: false,
                });

                return features;
            })
        );

        return {
            requestId,
            abort: () => abortController.abort(),
            features: featuresWithChrom.flat(), // TODO: Use batches, not flat
        };
    }
}
