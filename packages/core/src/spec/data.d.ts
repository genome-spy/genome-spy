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
import { Axis } from "./axis";
import { FieldName, PrimaryPositionalChannel } from "./channel";

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
    | DynamicData;

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

export interface UrlData extends DataBase {
    /**
     * An URL or an array of URLs from which to load the data set.
     * Use the `format.type` property to ensure the loaded data is correctly parsed.
     */
    url: string | string[];
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
    start: number;
    /**
     * The ending value of the sequence (exclusive).
     */
    stop: number;
    /**
     * The step value between sequence entries.
     *
     * __Default value:__ `1`
     */
    step?: number;

    /**
     * The name of the generated sequence field.
     *
     * __Default value:__ `"data"`
     */
    as?: FieldName;
}

export interface DynamicData {
    dynamic: DynamicDataParams;
}

export type DynamicDataParams = AxisTicksData | AxisGenomeData;

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
