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
import { FieldName } from "./view";

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
    type?: "csv" | "tsv" | "dsv" | "json" | "topojson";
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

export type DataFormat = CsvDataFormat | DsvDataFormat | JsonDataFormat;

export type DataFormatType = "json" | "csv" | "tsv" | "dsv";

export type DataSource = UrlData | InlineData | NamedData | DynamicData;

export type Data = DataSource | Generator;

export type InlineDataset =
    | number[]
    | string[]
    | boolean[]
    | object[]
    | string
    | object;

export type DynamicDataset = () => object[];

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
     * An URL from which to load the data set. Use the `format.type` property
     * to ensure the loaded data is correctly parsed.
     */
    url: string;
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

export interface DynamicData extends DataBase {
    /**
     * The View class has `getDynamicData()` methods that provides the data.
     * This is intended for internal use such as axis ticks/labels.
     */
    dynamicSource: boolean;
}

export function isUrlData(data: Partial<Data>): data is UrlData {
    return !!data["url"];
}

export function isInlineData(data: Partial<Data>): data is InlineData {
    return !!data["values"];
}

export function isNamedData(data: Partial<Data>): data is NamedData {
    return (
        !!data["name"] &&
        !isUrlData(data) &&
        !isInlineData(data) &&
        !isGenerator(data) &&
        isDynamicData(data)
    );
}

export function isGenerator(data: Partial<Data>): data is Generator {
    return data && isSequenceGenerator(data);
}

export function isSequenceGenerator(
    data: Partial<Data>
): data is SequenceGenerator {
    return !!data["sequence"];
}
export function isDynamicData(data: Partial<Data>): data is DynamicData {
    return !!data["dynamicSource"];
}

export type DataSourceType = "raw" | "main" | "row" | "column" | "lookup";

export const MAIN: "main" = "main";
export const RAW: "raw" = "raw";

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
