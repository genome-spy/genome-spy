import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

export default class BigBedSource extends SingleAxisWindowedSource {
    /** @type {import("@gmod/bed").default} */
    parser;

    /** @type {import("@gmod/bbi").BigBed} */
    bbi;

    /** @type {(chrom: string, fields: { start: number, end: number, rest: string }) => Record<string, any>} */
    parseLine;

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
                    try {
                        const fastParser = makeFastParser(this.parser);
                        this.parseLine = (chrom, f) =>
                            fastParser(chrom, f.start, f.end, f.rest);
                    } catch (e) {
                        this.parseLine = (chrom, f) =>
                            this.parser.parseLine(
                                `${chrom}\t${f.start}\t${f.end}\t${f.rest}`
                            );
                    }

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
                        features.map((f) => this.parseLine(d.chrom, f))
                    )
        );

        if (features) {
            this.publishData(features);
        }
    }
}

/**
 * A specific optimization for Hautaniemi Lab's Methylation project, where
 * we have hundreds of columns having small integers (0-100).
 * This parser avoids generating piles of garbage to be collected by the GC.
 * We don't split the line into an array of strings, but instead parse the
 * integer fields directly from the original string.
 * This parser doesn't support arrays, etc. at the moment.
 *
 * @param {import("@gmod/bed").default} bed
 */
function makeFastParser(bed) {
    // Skip the first three fields: chrom, chromStart, chromEnd
    const fields = bed.autoSql.fields.filter((field) => field.type).slice(3);

    let i = 0;
    let currentLine = "";
    let lineLength = 0;

    /** @type {Record<string, any>} */
    let currentObject = {};

    const delimiter = "\t";
    const delimiterCode = delimiter.charCodeAt(0);
    const zero = "0".charCodeAt(0);
    const minusCode = "-".charCodeAt(0);

    function parseString() {
        let end = currentLine.indexOf(delimiter, i);
        if (end < 0) {
            end = lineLength;
        }
        const str = currentLine.substring(i, end);
        i = end + 1;
        return str;
    }

    function parseInt() {
        let value = 0;

        let charCode = currentLine.charCodeAt(i);
        let sign = 1;

        if (charCode === minusCode) {
            sign = -1;
            i++;
            charCode = currentLine.charCodeAt(i);
        }

        do {
            if (charCode === delimiterCode) {
                i++;
                break;
            }
            value = value * 10 + charCode - zero;
            charCode = currentLine.charCodeAt(++i);
        } while (i < lineLength);

        return value * sign;
    }

    const fieldParsers = fields.map((field) => {
        const { name, type } = field;

        if (["ubyte", "int", "uint"].includes(type)) {
            return () => {
                currentObject[name] = parseInt();
            };
        } else if (field.isNumeric) {
            return () => {
                currentObject[name] = Number(parseString());
            };
        } else if (["char", "string", "lstring"].includes(type)) {
            return () => {
                currentObject[name] = parseString();
            };
        } else {
            throw new Error("Unsupported type: " + type);
        }
    });

    /**
     * @param {string} line
     */
    function setLine(line) {
        currentLine = line;
        lineLength = line.length;
        i = 0;
    }

    /**
     * @param {string} chrom
     * @param {number} chromStart
     * @param {number} chromEnd
     * @param {string} rest
     */
    function parseLine(chrom, chromStart, chromEnd, rest) {
        setLine(rest);

        currentObject = {
            chrom,
            chromStart,
            chromEnd,
        };

        for (let j = 0, n = fieldParsers.length; j < n; j++) {
            fieldParsers[j]();
        }

        return currentObject;
    }

    return parseLine;
}
