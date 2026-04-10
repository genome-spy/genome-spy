import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeneratedActionCatalog } from "./generateAgentActionCatalog.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageDir, "..");

const outputPath = path.join(
    packageDir,
    "src",
    "agent",
    "generatedActionTypes.ts"
);

/**
 * @param {import("../src/agent/types.js").AgentActionCatalogEntry[]} catalog
 * @returns {string}
 */
export function renderGeneratedActionTypes(catalog) {
    const localTypeDefinitions = [
        "type Scalar = string | number | boolean | null;",
        "",
        'type ChromosomalLocus = {',
        "    chrom: string;",
        "    pos: number;",
        "};",
        "",
        'type ViewSelector = {',
        "    scope: string[];",
        "    view: string;",
        "};",
        "",
        'type ParamSelector = {',
        "    scope: string[];",
        "    param: string;",
        "};",
        "",
        'type AttributeIdentifierType =',
        '    | "SAMPLE_ATTRIBUTE"',
        '    | "VALUE_AT_LOCUS"',
        '    | "SAMPLE_NAME"',
        '    | "VIEW_ATTRIBUTE";',
        "",
        'type AttributeIdentifier = {',
        "    type: AttributeIdentifierType;",
        "    specifier?: string | Record<string, unknown>;",
        "};",
        "",
        'type PayloadWithAttribute = {',
        "    attribute: AttributeIdentifier;",
        "};",
        "",
        'type ThresholdOperator = "lt" | "lte";',
        "",
        'type ComparisonOperatorType = "lt" | "lte" | "eq" | "gte" | "gt";',
        "",
        'type Threshold = {',
        "    operator: ThresholdOperator;",
        "    operand: number;",
        "};",
        "",
        'type SampleAttributeDef = {',
        "    scale?: unknown;",
        "};",
        "",
        'type ColumnarMetadata = Record<string, Scalar[]> & {',
        "    sample: Scalar[];",
        "};",
        "",
        'type CustomGroups = Record<string, Scalar[]>;',
        "",
        'type SetMetadata = {',
        "    columnarMetadata: ColumnarMetadata;",
        "    attributeDefs?: Record<string, SampleAttributeDef>;",
        "    replace?: boolean;",
        "};",
        "",
        'type DeriveMetadata = PayloadWithAttribute & {',
        "    name: string;",
        "    groupPath?: string;",
        "    scale?: unknown;",
        "};",
        "",
        'type AddMetadataFromSource = {',
        "    sourceId?: string;",
        "    columnIds: string[];",
        "    groupPath?: string;",
        "    replace?: boolean;",
        "};",
        "",
        'type SortBy = PayloadWithAttribute;',
        "",
        'type RetainFirstOfEach = PayloadWithAttribute;',
        "",
        "interface RetainFirstNCategories extends PayloadWithAttribute {",
        "    /** @minimum 1 */",
        "    n: number;",
        "}",
        "",
        'type RemoveUndefined = PayloadWithAttribute;',
        "",
        'type GroupCustom = PayloadWithAttribute & {',
        "    groups: CustomGroups;",
        "};",
        "",
        'type GroupByNominal = PayloadWithAttribute;',
        "",
        'type GroupToQuartiles = PayloadWithAttribute;',
        "",
        'type GroupByThresholds = PayloadWithAttribute & {',
        "    thresholds: [Threshold, ...Threshold[]];",
        "};",
        "",
        'type RemoveGroup = {',
        "    path: string[];",
        "};",
        "",
        'type FilterByQuantitative = PayloadWithAttribute & {',
        "    operator: ComparisonOperatorType;",
        "    operand: number;",
        "};",
        "",
        'type FilterByNominal = PayloadWithAttribute & {',
        "    values: unknown[];",
        "    remove?: boolean;",
        "};",
        "",
        'type RetainMatched = PayloadWithAttribute;',
        "",
        'type ParamValueLiteral = {',
        '    type: "value";',
        "    value: unknown;",
        "};",
        "",
        'type ParamValueInterval = {',
        '    type: "interval";',
        "    intervals: Partial<",
        '        Record<"x" | "y", [number, number] | [ChromosomalLocus, ChromosomalLocus] | null>',
        "    >;",
        "};",
        "",
        'type ParamValuePoint = {',
        '    type: "point";',
        "    keyFields: string[];",
        "    keys: Scalar[][];",
        "};",
        "",
        'type ParamOrigin = {',
        '    type: "datum";',
        "    view: ViewSelector;",
        "    keyField: string;",
        "    key: Scalar;",
        "    intervalSources?: Record<string, { start?: string; end?: string }>;",
        "};",
        "",
        'type PointExpandOrigin = {',
        "    view: ViewSelector;",
        "    keyTuple: Scalar[];",
        "    keyFields?: string[];",
        '    type?: "datum";',
        "};",
        "",
        'type PointExpandMatcher =',
        "    | { rule: unknown; predicate?: never }",
        "    | { predicate: unknown; rule?: never };",
        "",
        'type ParamValuePointExpand = {',
        '    type: "pointExpand";',
        '    operation: "replace" | "add" | "remove" | "toggle";',
        "    partitionBy?: string[];",
        "    origin: PointExpandOrigin;",
        "} & PointExpandMatcher;",
        "",
        'type ParamValue =',
        "    | ParamValueLiteral",
        "    | ParamValueInterval",
        "    | ParamValuePoint",
        "    | ParamValuePointExpand;",
        "",
        'type ParamProvenanceEntry = {',
        "    selector: ParamSelector;",
        "    value: ParamValue;",
        "    origin?: ParamOrigin;",
        "};",
        "",
        'type ViewSettingsSetVisibility = {',
        "    key: string;",
        "    visibility: boolean;",
        "};",
        "",
        "type ViewSettingsRestoreDefaultVisibility = string;",
        "",
    ];

    const actionTypes = catalog
        .map((entry) => `    | "${entry.actionType}"`)
        .join("\n");

    const stepVariants = catalog
        .map((entry) => {
            return [
                "    | {",
                `          actionType: "${entry.actionType}";`,
                `          payload: ${entry.payloadType};`,
                "      }",
            ].join("\n");
        })
        .join("\n");

    return [
        "/**",
        " * This file is generated. Do not edit.",
        " */",
        ...localTypeDefinitions,
        "",
        "export type AgentActionType =",
        actionTypes + ";",
        "",
        "export type AgentIntentProgramStep =",
        stepVariants + ";",
        "",
    ].join("\n");
}

/**
 * @returns {Promise<void>}
 */
export async function writeGeneratedActionTypes() {
    const catalog = await createGeneratedActionCatalog();
    const output = renderGeneratedActionTypes(catalog);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);

    console.log("Wrote " + path.relative(repoRoot, outputPath));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    await writeGeneratedActionTypes();
}
