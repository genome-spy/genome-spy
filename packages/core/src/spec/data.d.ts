/*!
 * Adapted from
 * https://github.com/vega/vega-lite/blob/master/src/data.ts
 *
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * BSD-3-Clause License: https://github.com/vega/vega-lite/blob/master/LICENSE
 */

/*
 * Constants and utilities for data.
 */
import { Axis } from "./axis.js";
import { FieldName, PrimaryPositionalChannel, Scalar } from "./channel.js";
import { ExprRef } from "./parameter.js";

export type ParseValue =
    | null
    | string
    | "string"
    | "boolean"
    | "date"
    | "number";

export interface Parse {
    [field: string]: ParseValue;
}

export interface DataFormatBase {
    /**
     * If set to `null`, disable type inference based on the spec and only use type inference based on the data.
     * Alternatively, a parsing directive object can be provided for explicit data types. Each property of the object corresponds to a field name, and the value to the desired data type (one of `"number"`, `"boolean"`, `"date"`, or null (do not parse the field)).
     * For example, `"parse": {"modified_on": "date"}` parses the `modified_on` field in each input record a Date value.
     *
     * For `"date"`, we parse data based using Javascript's [`Date.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse).
     * For Specific date formats can be provided (e.g., `{foo: "date:'%m%d%Y'"}`), using the [d3-time-format syntax](https://github.com/d3/d3-time-format#locale_format). UTC date format parsing is supported similarly (e.g., `{foo: "utc:'%m%d%Y'"}`). See more about [UTC time](https://vega.github.io/vega-lite/docs/timeunit.html#utc)
     */
    parse?: Parse | null;

    /**
     * Type of input data: `"json"`, `"csv"`, `"tsv"`, `"dsv"`.
     *
     * __Default value:__  The default format type is determined by the extension of the file URL.
     * Compression suffixes such as `.gz` are ignored during inference.
     * If no extension is detected, `"json"` will be used by default.
     */
    type?: DataFormatType;
}

export interface CsvDataFormat extends DataFormatBase {
    type?: "csv" | "tsv";

    /**
     * Optional ordered list of field names for headerless CSV or TSV input.
     * When provided, the first row is interpreted as data rather than a header row.
     */
    columns?: string[];
}

export interface DsvDataFormat extends DataFormatBase {
    type?: "dsv";

    /**
     * The delimiter between records. The delimiter must be a single character (i.e., a single 16-bit code unit); so, ASCII delimiters are fine, but emoji delimiters are not.
     *
     * @minLength 1
     * @maxLength 1
     */
    delimiter: string;

    /**
     * Optional ordered list of field names for headerless delimiter-separated input.
     * When provided, the first row is interpreted as data rather than a header row.
     */
    columns?: string[];
}

export interface JsonDataFormat extends DataFormatBase {
    type?: "json";

    /**
     * The JSON property containing the desired data.
     * This parameter can be used when the loaded JSON file may have surrounding structure or meta-data.
     * For example `"property": "values.features"` is equivalent to retrieving `json.values.features`
     * from the loaded JSON object.
     */
    property?: string;
}

export interface BedDataFormat extends DataFormatBase {
    type: "bed";
}

export interface BedpeDataFormat extends DataFormatBase {
    type: "bedpe";

    /**
     * Optional ordered list of field names for headerless BEDPE input.
     * If omitted, BEDPE fields are resolved from the default BEDPE column
     * order or from a matching header row when present.
     */
    columns?: string[];
}

/**
 * Other data format, such as `"fasta"`
 */
export interface OtherDataFormat extends DataFormatBase {
    type: string;
}

export type DataFormat =
    | CsvDataFormat
    | DsvDataFormat
    | JsonDataFormat
    | BedDataFormat
    | BedpeDataFormat
    | OtherDataFormat;

export type DataFormatType = "json" | "csv" | "tsv" | "dsv" | string;

export type DataSource =
    | UrlData
    | InlineData
    | NamedData
    | DynamicCallbackData
    | LazyData;

export type Data = DataSource | Generator;

export type InlineDataset =
    | number[]
    | string[]
    | boolean[]
    | object[]
    | string
    | object;

export interface DataBase {
    /**
     * A description of the data source. Can be used for documentation and to
     * explain the role of the data in the visualization.
     */
    description?: string;

    /**
     * An object that specifies the format for parsing the data.
     */
    format?: DataFormat;

    /**
     * Provide a placeholder name and bind data at runtime.
     */
    name?: string;
}

export interface UrlList {
    /**
     * A URL that returns a list of URLs to load the data set.
     * The URLs in the list can be absolute or relative to the URL of the list.
     */
    urlsFromFile: string;

    /**
     * The format of the data in the list.
     * If the type is `"json"`, the list is expected to be an array of strings.
     * If the type is `"csv"` or `"tsv"`, the list is expected to be a table with a single column named `url`.
     *
     * __Default value:__ `"txt"`
     */
    type?: "json" | "csv" | "tsv";
}

export interface UrlDescriptor {
    /**
     * URL of the data file. Relative URLs are resolved against the view base
     * URL.
     */
    url: string;

    /**
     * URL of the index file for indexed formats such as Tabix, BAM, and
     * indexed FASTA. Relative URLs are resolved against the view base URL.
     * Ignored by sources that do not use an index.
     */
    indexUrl?: string;

    /**
     * Fields attached to each datum loaded from this URL. A field must not
     * conflict with a field loaded from the data file.
     */
    fields?: Record<string, Scalar>;
}

export interface UrlTemplate {
    /**
     * URL template. The value from `values` is substituted for the placeholder
     * named by `field`, for example `{sample}`.
     */
    template: string;

    /**
     * Values used for template expansion. Duplicate resolved URLs are loaded
     * once. An ExprRef can reference reactive parameters such as
     * `visibleSamples`.
     */
    values: Scalar[] | ExprRef;

    /**
     * Field name used as the template placeholder and as the datum field
     * attached to loaded rows.
     */
    field: FieldName;

    /**
     * Maximum number of distinct resolved values to load. Expansion fails when
     * the limit is exceeded.
     */
    maxValues?: number;
}

export interface IndexUrlTemplate {
    /**
     * URL template for index files. Uses the same values and field placeholder
     * as the `url` template.
     */
    template: string;
}

export type UrlSourceRef =
    | string
    | string[]
    | ExprRef
    | UrlList
    | UrlDescriptor
    | UrlDescriptor[]
    | UrlTemplate;

export type SingleUrlSourceRef = string | ExprRef | UrlDescriptor | UrlTemplate;

export type MultiUrlSourceRef =
    | string
    | string[]
    | ExprRef
    | UrlDescriptor
    | UrlDescriptor[]
    | UrlTemplate;

export type IndexUrlSourceRef = string | ExprRef | IndexUrlTemplate;

export interface UrlData extends DataBase {
    /**
     * An URL, a list of URLs, or a URL expansion definition from which to load
     * the data set.
     *
     * A URL template can expand values from an ExprRef and attach the expanded
     * value as a field to loaded rows.
     *
     * Gzip-compressed resources are decompressed transparently when the URL,
     * MIME type, or payload indicates gzip content. Use the `format.type`
     * property to ensure the loaded data is correctly parsed.
     */
    url: UrlSourceRef;
}

export interface InlineData extends DataBase {
    /**
     * The full data set, included inline. This can be an array of objects or primitive values, an object, or a string.
     * Arrays of primitive values are ingested as objects with a `data` property. Strings are parsed according to the specified format type.
     */
    values: InlineDataset;
}

export interface NamedData extends DataBase {
    /**
     * Provide a placeholder name and bind data at runtime.
     */
    name: string;
}

export interface DynamicCallbackData extends DataBase {
    /**
     * The View class has `getDynamicData()` methods that provides the data.
     * This is intended for internal use.
     */
    dynamicCallbackSource: boolean;
}

export type Generator = SequenceGenerator;

export interface GeneratorBase {
    /**
     * A description of the data source. Can be used for documentation and to
     * explain the role of the generated data in the visualization.
     */
    description?: string;

    /**
     * Provide a placeholder name and bind data at runtime.
     */
    name?: string;
}

export interface SequenceGenerator extends GeneratorBase {
    /**
     * Generate a sequence of numbers.
     */
    sequence: SequenceParams;
}

export interface SequenceParams {
    /**
     * The starting value of the sequence (inclusive).
     */
    start: number | ExprRef;
    /**
     * The ending value of the sequence (exclusive).
     */
    stop: number | ExprRef;
    /**
     * The step value between sequence entries.
     *
     * __Default value:__ `1`
     */
    step?: number | ExprRef;

    /**
     * The name of the generated sequence field.
     *
     * __Default value:__ `"data"`
     */
    as?: FieldName | ExprRef;
}

export interface LazyData {
    /**
     * A description of the data source. Can be used for documentation and to
     * explain the role of the lazy data in the visualization.
     */
    description?: string;

    lazy: LazyDataParams;
}

export type LazyDataParams =
    | AxisTicksData
    | AxisGenomeData
    | IndexedFastaData
    | BigWigData
    | BigBedData
    | BamData
    | TabixTsvData
    | Gff3Data
    | VcfData;

export interface DebouncedData {
    /**
     * Debounce time for data updates, in milliseconds. Debouncing prevents
     * excessive data updates when the user is zooming or panning around.
     *
     * __Default value:__ `200`
     */
    debounce?: number | ExprRef;

    /**
     * Debounce time for scale-domain driven data updates, in milliseconds.
     *
     * __Default value:__ `200`
     */
    debounceDomainChange?: number | ExprRef;

    /**
     * The debounce mode for data updates. If set to `"domain"`, domain change
     * events (panning and zooming) will be debounced. If set to `"window"`,
     * the data fetches initiated by the changes to the visible window (or tile)
     * will be debounced.  If your data is small, the `"window"` is better as
     * it will start fetching data while the user is still panning around,
     * resulting in a shorter perceived latency.
     *
     * __Default value:__ `"window"`
     *
     */
    debounceMode?: "domain" | "window";
}

export interface AxisTicksData {
    type: "axisTicks";

    /** Optional axis properties */
    axis?: Axis;

    /** Which channel's scale domain to listen to */
    channel: PrimaryPositionalChannel;
}

export interface AxisGenomeData {
    type: "axisGenome";

    /** Which channel's scale domain to use */
    channel: PrimaryPositionalChannel;
}

export interface IndexedFastaData extends DebouncedData {
    type: "indexedFasta";

    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * URL of the fasta file. URL templates must resolve to one URL.
     */
    url: SingleUrlSourceRef;

    /**
     * URL of the index file.
     * When `url` is a template, this can be an index URL template using the
     * same placeholder and values.
     *
     * __Default value:__ `url` + `".fai"`.
     */
    indexUrl?: IndexUrlSourceRef;

    /**
     * Size of each chunk when fetching the fasta file. Data is only fetched
     * when the length of the visible domain smaller than the window size.
     *
     * __Default value:__ `7000`
     */
    windowSize?: number;
}

export interface BigWigData extends DebouncedData {
    type: "bigwig";

    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * URL of the BigWig file. URL templates and URL descriptor arrays load
     * multiple BigWig files and attach descriptor fields to loaded rows.
     */
    url: MultiUrlSourceRef;

    /**
     * The approximate minimum width of each data bin, in pixels.
     *
     * __Default value:__ `2`
     */
    pixelsPerBin?: number | ExprRef;
}

export interface BigBedData extends DebouncedData {
    type: "bigbed";

    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * URL of the BigBed file. URL templates and URL descriptor arrays load
     * multiple BigBed files and attach descriptor fields to loaded rows.
     */
    url: MultiUrlSourceRef;

    /**
     * Size of each chunk when fetching the BigBed file. Data is only fetched
     * when the length of the visible domain smaller than the window size.
     *
     * __Default value:__ `1000000`
     */
    windowSize?: number | ExprRef;
}

export interface BamData extends DebouncedData {
    type: "bam";

    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * URL of the BAM file. URL templates must resolve to one URL.
     */
    url: SingleUrlSourceRef;

    /**
     * URL of the index file.
     * When `url` is a template, this can be an index URL template using the
     * same placeholder and values.
     *
     * __Default value:__ `url` + `".bai"`.
     */
    indexUrl?: IndexUrlSourceRef;

    /**
     * Size of each chunk when fetching the BigBed file. Data is only fetched
     * when the length of the visible domain smaller than the window size.
     *
     * __Default value:__ `10000`
     */
    windowSize?: number;
}

export interface TabixData extends DebouncedData {
    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * URL of the bgzip-compressed file. URL templates and URL descriptor
     * arrays load multiple files and attach descriptor fields to loaded rows.
     */
    url: MultiUrlSourceRef;

    /**
     * URL of the tabix index file.
     * When `url` is a template, this can be an index URL template using the
     * same placeholder and values.
     *
     * __Default value:__ `url` + `".tbi"`.
     */
    indexUrl?: IndexUrlSourceRef;

    /**
     * Add a `chr` (boolean) or custom (string) prefix to the chromosome names
     * in the Tabix file.
     *
     * __Default value:__ `false`
     */
    addChrPrefix?: boolean | string;

    /**
     * Size of each chunk when fetching the Tabix file. Data is only fetched
     * when the length of the visible domain smaller than the window size.
     *
     * __Default value:__ `30000000`
     */
    windowSize?: number;
}

export interface TabixTsvData extends TabixData {
    type: "tabix";

    /**
     * Ordered list of field names for headerless tabix TSV input.
     * If omitted, the source tries to read a commented header line from the
     * tabix file header or the first row of a plain TSV header.
     */
    columns?: string[];

    /**
     * Optional type parsing for TSV fields. When omitted, field types are
     * inferred automatically. Set to `null` to disable spec-based type
     * inference and rely on data inference, or provide a field-to-type map to
     * override selected columns.
     *
     * __Default value:__ `"auto"`
     */
    parse?: Parse | null;
}

export interface Gff3Data extends TabixData {
    type: "gff3";
}

export interface VcfData extends TabixData {
    type: "vcf";
}

/**
 * Testing-only lazy data source. Not intended for production use.
 */
