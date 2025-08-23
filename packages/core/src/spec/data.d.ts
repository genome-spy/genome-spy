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
import { FieldName, PrimaryPositionalChannel } from "./channel.js";
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
     * If no extension is detected, `"json"` will be used by default.
     */
    type?: DataFormatType;
}

export interface CsvDataFormat extends DataFormatBase {
    type?: "csv" | "tsv";
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

/**
 * Other data format, such as `"fasta"`
 */
export interface OtherDataFormat {
    type: string;
}

export type DataFormat =
    | CsvDataFormat
    | DsvDataFormat
    | JsonDataFormat
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
     * If the type is `"csv"` or `"tsv"`, the list is expected to be a table with a single column named `file`.
     *
     * __Default value:__ `"txt"`
     */
    type?: "json" | "csv" | "tsv";
}

export interface UrlData extends DataBase {
    /**
     * An URL or an array of URLs from which to load the data set.
     * Use the `format.type` property to ensure the loaded data is correctly parsed.
     */
    url: string | string[] | ExprRef | UrlList;
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
    lazy: LazyDataParams;
}

export type LazyDataParams =
    | AxisTicksData
    | AxisGenomeData
    | AxisMeasureData
    | IndexedFastaData
    | BigWigData
    | BigBedData
    | BamData
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

export interface AxisMeasureData {
    type: "axisMeasure";

    /**
     * Which channel's scale domain to monitor.
     *
     * __Default value:__ `"x"`
     */
    channel?: PrimaryPositionalChannel;

    /**
     * Optional min measure size in pixels.
     * It has to be big enough to fit the measure/span label.
     * The measure size in pixels will vary between this minimum value and
     * 10 times this value, when it switches to the next smaller span value.
     *
     * __Default value:__ `50`
     */
    minMeasureSize?: number;

    /**
     * Optional value of threshold to hide measure.
     * If measure size in domain units (e.g. DNA bases) is less than or equal
     * to this threshold, hide the measure to avoid "flickering" caused
     * by rounding.
     * The measure is not really necessary at this zoom level,
     * as the axis ticks are filling that need.
     *
     * __Default value:__ `10`
     */
    hideMeasureThreshold?: number;

    /**
     * Optional multiplier value which can be used to create a different set
     * of measures from the powers of 10: 1, 100, 1000, etc.
     * e.g. : 5, 500, 5000 for multiplierValue = 5
     *
     * __Default value:__ `1`
     */
    multiplierValue?: number;

    /**
     * Optional positioning of the measure on the current axis scale domain:
     * 'left', 'center' or 'right'
     * For "y" channel axes, these values can be:
     * 'bottom', 'center' or 'top'
     *
     * __Default value:__ `center`
     */
    alignMeasure?: string;
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
     * URL of the fasta file.
     */
    url: string;

    /**
     * URL of the index file.
     *
     * __Default value:__ `url` + `".fai"`.
     */
    indexUrl?: string;

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
     * URL of the BigWig file.
     */
    url: string | ExprRef;

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
     * URL of the BigBed file.
     */
    url: string | ExprRef;

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
     * URL of the BigBed file.
     */
    url: string;

    /**
     * URL of the index file.
     *
     * __Default value:__ `url` + `".bai"`.
     */
    indexUrl?: string;

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
     * Url of the bgzip compressed file.
     */
    url: string;

    /**
     * Url of the tabix index file.
     *
     * __Default value:__ `url` + `".tbi"`.
     */
    indexUrl?: string;

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

export interface Gff3Data extends TabixData {
    type: "gff3";
}

export interface VcfData extends TabixData {
    type: "vcf";
}
