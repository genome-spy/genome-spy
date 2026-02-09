import {
    activateExprRefProps,
    withoutExprRef,
} from "../../../paramRuntime/paramUtils.js";
import addBaseUrl from "../../../utils/addBaseUrl.js";
import SingleAxisWindowedSource from "./singleAxisWindowedSource.js";

export default class BigBedSource extends SingleAxisWindowedSource {
    /** @type {import("@gmod/bed").default} */
    parser;

    /** @type {import("@gmod/bbi").BigBed} */
    bbi;

    /** @type {(chrom: string, fields: { start: number, end: number, rest?: string }) => Record<string, any>} */
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

        const activatedParams = activateExprRefProps(
            view.paramRuntime,
            paramsWithDefaults,
            (props) => {
                if (props.includes("url")) {
                    this.#initialize().then(() => this.reloadLastDomain());
                } else if (props.includes("windowSize")) {
                    this.reloadLastDomain();
                }
            }
        );

        super(view, activatedParams.channel);

        this.params = activatedParams;

        if (!this.params.url) {
            throw new Error("No URL provided for BigBedSource");
        }

        this.setupDebouncing(this.params);

        this.#initialize();
    }

    get label() {
        return "bigBedSource";
    }

    #initialize() {
        this.initializedPromise = new Promise((resolve, reject) => {
            Promise.all([
                import("@gmod/bed"),
                import("@gmod/bbi"),
                import("generic-filehandle2"),
            ]).then(([bed, { BigBed }, { RemoteFile }]) => {
                const BED = bed.default;

                this.bbi = new BigBed({
                    filehandle: new RemoteFile(
                        addBaseUrl(
                            withoutExprRef(this.params.url),
                            this.view.getBaseUrl()
                        )
                    ),
                });

                this.setLoadingStatus("loading");
                this.bbi
                    .getHeader()
                    .then(async (header) => {
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

                        this.setLoadingStatus("complete");
                        resolve();
                    })
                    .catch((e) => {
                        // Load empty data
                        this.load();
                        this.setLoadingStatus(
                            "error",
                            `${withoutExprRef(this.params.url)}: ${e.message}`
                        );
                        reject(e);
                    });
            });
        });

        return this.initializedPromise;
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
 * An optimized parser for Hautaniemi Lab's Methylation project, where
 * we have hundreds of columns having small integers (0-100). This is over 5x
 * faster than @gmod/bed's parser.
 *
 * Techniques used:
 *
 * 1. Avoid generating garbage by parsing integers directly from the string,
 *    i.e., without splitting the line into an array of strings.
 * 2. Use a template object to avoid hidden class changes after each property
 *    assignment. Avoids garbage generation.
 * 3. Generate and compile code that uses constants to access object properties,
 *    avoiding Map lookups during assignment.
 * 4. Input chrom, startPos, and endPos as parameters so that @gmod/bbi's
 *    output doesn't first need to be converted to a string just to be parsed
 *    again.
 *
 * This parser doesn't support arrays, etc. at the moment. This could, however,
 * be extended into a fully-featured parser.
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

    const templateFields = fields.map(
        (field) =>
            `${JSON.stringify(field.name)}: ${
                field.isNumeric ? "0" : "emptyString"
            }`
    );

    /**
     * Make a template object with all fields to avoid the JavaScript VM's
     * hidden class to be changed after each property assignment. Transitions
     * between hidden classes generate plenty of garbage to be collected.
     *
     * Ideally, the parsed values would be assigned directly in this function,
     * but for some reason, it results in abysmally slow performance on Chrome,
     * but not on Firefox, where it would be super fast.
     */
    const makeTemplate = new Function(`
        const emptyString = "";
        return function makeTemplate(chrom, chromStart, chromEnd) {
            return {
                chrom,
                chromStart,
                chromEnd,
                ${templateFields.join(",\n")}
            }
        };`)();

    /*
     * Generate setter code that uses constant field names to access the
     * object's properties. This avoids Map lookups and allows for efficient
     * machine code to be generated by the VM.
     */
    const fieldParsers = fields.map((field) => {
        const type = field.type;
        const name = JSON.stringify(field.name);

        if (["ubyte", "int", "uint"].includes(type)) {
            return `d[${name}] = parseInt();`;
        } else if (field.isNumeric) {
            return `d[${name}] = Number(parseString());`;
        } else if (["char", "string", "lstring"].includes(type)) {
            return `d[${name}] = parseString();`;
        } else {
            throw new Error("Unsupported type: " + type);
            // TODO: Implement them
        }
    });

    /*
     * Split the field parsers into chunks to avoid creating so large
     * functions that the JavaScript VM would decline to optimize it.
     * Not sure if this is really necessary, but the added cost is minimal.
     */
    const chunckedFieldParsers = chunk(fieldParsers, 50).map((chunk, i) =>
        Function(
            "parseInt",
            "parseString",
            `return function parseFieldChunk${i}(d) {
            ${chunk.join("\n")}
        }`
        )(parseInt, parseString)
    );

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

        currentObject = makeTemplate(chrom, chromStart, chromEnd);

        for (const parser of chunckedFieldParsers) {
            parser(currentObject);
        }

        return currentObject;
    }

    return parseLine;
}

/**
 * @param {T[]} arr
 * @param {number} size
 * @template T
 */
function chunk(arr, size) {
    // https://www.30secondsofcode.org/js/s/split-array-into-chunks/
    return Array.from({ length: Math.ceil(arr.length / size) }, (_v, i) =>
        arr.slice(i * size, i * size + size)
    );
}
