import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

export default class BigBedSource extends SingleAxisWindowedSource {
    /** @type {import("@gmod/bed").default} */
    parser;

    /** @type {import("@gmod/bbi").BigBed} */
    bbi;

    /**
     * @param {import("../../../spec/data.js").BigBedData} params
     * @param {import("../../../view/view.js").default} view
     */
    constructor(params, view) {
        /** @type {import("../../../spec/data.js").BigBedData} */
        const paramsWithDefaults = {
            channel: "x",
            windowSize: 1000000,
            debounce: 200,
            debounceMode: "window",
            ...params,
        };

        super(view, paramsWithDefaults.channel);

        this.params = paramsWithDefaults;

        if (!this.params.url) {
            throw new Error("No URL provided for BigBedSource");
        }

        this.setupDebouncing(this.params);

        this.initializedPromise = new Promise((resolve) => {
            Promise.all([
                import("@gmod/bed"),
                import("@gmod/bbi"),
                import("generic-filehandle"),
            ]).then(([bed, { BigBed }, { RemoteFile }]) => {
                const BED = bed.default;

                this.bbi = new BigBed({
                    filehandle: new RemoteFile(
                        addBaseUrl(this.params.url, this.view.getBaseUrl())
                    ),
                });

                this.bbi.getHeader().then(async (header) => {
                    // @ts-ignore TODO: Fix
                    this.parser = new BED({ autoSql: header.autoSql });

                    resolve();
                });
            });
        });
    }

    /**
     * @param {number[]} interval linearized domain
     */
    async loadInterval(interval) {
        const features = await this.discretizeAndLoad(
            interval,
            async (d, signal) =>
                this.bbi
                    .getFeatures(d.chrom, d.startPos, d.endPos, {
                        signal,
                    })
                    .then((features) =>
                        features.map((f) =>
                            this.parser.parseLine(
                                `${d.chrom}\t${f.start}\t${f.end}\t${f.rest}`,
                                { uniqueId: f.uniqueId }
                            )
                        )
                    )
        );

        if (features) {
            this.publishData(features);
        }
    }
}
