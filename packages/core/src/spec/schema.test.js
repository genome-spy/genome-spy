import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";

const specDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(specDir, "..", "..");
const repoRoot = path.resolve(packageDir, "..", "..");

function createCoreSchema() {
    return createGenerator({
        path: path.join(packageDir, "src/spec/*.ts"),
        tsconfig: path.join(repoRoot, "tsconfig.json"),
        type: "CoreRootSpec",
        skipTypeCheck: true,
    }).createSchema("CoreRootSpec");
}

describe("generated core schema", () => {
    test("accepts conditional mark-property branches with their own scale", () => {
        const schema = createCoreSchema();
        const spec = JSON.parse(
            fs.readFileSync(
                path.join(
                    repoRoot,
                    "examples/docs/grammar/parameters/penguins.json"
                ),
                "utf8"
            )
        );

        // Non-obvious: this example exercises a conditional field branch inside
        // a value fallback, which must keep its own nested scale in schema output.
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });

    test("includes transform descriptions in the generated schema", () => {
        const schema = createCoreSchema();
        const aggregateParams =
            /** @type {{ properties: Record<string, { description?: string }> }} */ (
                schema.definitions.AggregateParams
            );
        const selectionFilterParams =
            /** @type {{ properties: Record<string, { description?: string }> }} */ (
                schema.definitions.SelectionFilterParams
            );

        // Non-obvious: the shared base interface should surface on concrete
        // transform definitions so docs and agents can describe the step.
        expect(aggregateParams.properties.description).toBeTruthy();
        expect(selectionFilterParams.properties.description).toBeTruthy();
    });

    test("accepts initial legend configuration and channel legend properties", () => {
        const schema = createCoreSchema();
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        const spec = {
            data: { values: [{ category: "A", value: 1 }] },
            config: {
                legend: {
                    disable: false,
                    orient: "right",
                    labelLimit: 160,
                },
                legendTrack: {
                    style: "track-bottom",
                },
            },
            mark: "point",
            encoding: {
                x: { field: "value", type: "quantitative" },
                color: {
                    field: "category",
                    type: "nominal",
                    legend: {
                        title: "Category",
                        orient: "right",
                        style: /** @type {null} */ (null),
                    },
                },
            },
        };

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });

    test("accepts ruler parameter configuration", () => {
        const schema = createCoreSchema();
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        const spec = {
            data: { values: [{ x: 1, y: 2 }] },
            params: [
                {
                    name: "cursor",
                    persist: false,
                    ruler: {
                        encodings: ["x"],
                        on: {
                            type: "mousedown",
                            filter: "event.shiftKey",
                        },
                        clear: "mouseleave",
                        extent: "auto",
                        snap: "auto",
                        display: "center",
                        mark: {
                            stroke: "black",
                            strokeWidth: 1,
                            strokeDash: [4, 2],
                            opacity: 0.8,
                            fill: "black",
                            fillOpacity: 0.05,
                            zindex: 1,
                        },
                    },
                    value: { x: 1 },
                },
            ],
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });

    test("accepts interval selection extent configuration", () => {
        const schema = createCoreSchema();
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        const spec = {
            data: { values: [{ x: 1, y: 2 }] },
            params: [
                {
                    name: "brush",
                    select: {
                        type: "interval",
                        encodings: ["x"],
                        extent: "container",
                    },
                },
            ],
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
            },
        };

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });

    test("accepts arrow mark shape parameters", () => {
        const schema = createCoreSchema();
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        const spec = {
            data: {
                values: [{ start: 8, end: 32, band: "A" }],
            },
            mark: {
                type: "arrow",
                direction: "forward",
                headShape: "triangle",
                headAngle: { expr: "45" },
                headNotchAngle: 90,
                size: { band: 0.45 },
                minSize: 1,
                stem: true,
                headWidth: 1,
                startNotch: true,
                minStemLength: { expr: "12" },
                headSpacing: 24,
                headPlacement: "inside",
                fill: "#5B8DEF",
                stroke: "black",
                strokeWidth: 1,
            },
            encoding: {
                x: { field: "start", type: "index" },
                x2: { field: "end" },
                y: { field: "band", type: "nominal" },
            },
        };

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });

    test("accepts arrow direction encoding", () => {
        const schema = createCoreSchema();
        const validate = new Ajv.default({
            allErrors: true,
            strict: false,
            allowUnionTypes: true,
        }).compile(schema);

        const spec = {
            data: {
                values: [
                    { start: 20, end: 80, direction: "+" },
                    { start: 20, end: 80, direction: "-" },
                ],
            },
            mark: "arrow",
            encoding: {
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
                y: { field: "direction", type: "nominal" },
                direction: {
                    field: "direction",
                    type: "nominal",
                    scale: {
                        domain: ["+", "-"],
                        range: ["forward", "reverse"],
                    },
                },
            },
        };

        expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(
            true
        );
    });
});
