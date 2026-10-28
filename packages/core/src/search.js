import { getViewRuntime } from "./view/viewRuntime.js";
import { getEncodingSearchFields } from "./encoder/metadataChannels.js";
import { isDataReady } from "./data/dataReadiness.js";
import { copyDatum } from "./data/copyDatum.js";
import { isContinuous, isDiscrete } from "vega-scale";

/**
 * Non-mutating lookup over currently loaded encoding.search records. Returned
 * rows are bounded; input scanning is synchronous and does not fetch data.
 * @param {import("./types/embedApi.js").ViewApi} views
 * @returns {import("./types/search.js").DatumSearch}
 */
export function createDatumSearch(views) {
    const runtime = getViewRuntime(views);

    /** @param {import("./types/embedApi.js").ViewHandle} [scope] */
    function sources(scope) {
        runtime.ensureActive();
        const root = scope ? runtime.getView(scope) : runtime.getRoot();
        /** @type {{unit: import("./view/unitView.js").default, fields: string[], source: import("./types/search.js").SearchSource}[]} */
        const result = [];
        root.visit((view) => {
            const handle = runtime.getHandle(view);
            if (handle.type !== "unit") return;
            const unit = /** @type {import("./view/unitView.js").default} */ (
                view
            );
            const fields = getEncodingSearchFields(unit.getEncoding()) ?? [];
            if (!fields.length) {
                if (scope && root === view)
                    throw new Error(
                        "The requested unit view does not declare searchable fields."
                    );
                return;
            }
            const collector = unit.getCollector();
            result.push({
                unit,
                fields,
                source: {
                    view: handle,
                    dataRevision: collector?.dataRevision ?? null,
                    readiness:
                        collector && isDataReady(collector)
                            ? "ready"
                            : "pending",
                    scan: "unscanned",
                    rowsExamined: 0,
                    coverage: "loaded",
                },
            });
        });
        return result;
    }

    return {
        findDatums(query, options) {
            if (typeof query !== "string" || !query.length)
                throw new Error("Query must be a non-empty string.");
            validateLimit(options?.limit);
            const mode = options.mode ?? "exact";
            if (mode !== "exact" && mode !== "prefix")
                throw new Error("Mode must be exact or prefix.");
            if (options.target !== undefined && options.target !== "zoomable")
                throw new Error("Target must be zoomable when provided.");
            if (
                options.field !== undefined &&
                (typeof options.field !== "string" || !options.field.length)
            )
                throw new Error(
                    "Field must be a non-empty declared search field."
                );
            const entries = sources(options.view);
            if (
                options.field &&
                !entries.some(({ fields }) => fields.includes(options.field))
            ) {
                throw new Error(
                    "The requested scope does not search the field " +
                        options.field +
                        "."
                );
            }
            const collator = new Intl.Collator("en", {
                usage: "search",
                sensitivity: "base",
            });
            /** @type {import("./types/search.js").DatumSearchMatch[]} */
            const matches = [];
            const result = {
                matches,
                truncated: false,
                sources: entries.map(({ source }) => source),
            };
            for (const entry of entries) {
                if (options.field && !entry.fields.includes(options.field))
                    entry.source.scan = "excluded";
            }
            for (const { unit, fields, source } of entries) {
                if (
                    source.scan === "excluded" ||
                    source.readiness === "pending"
                )
                    continue;
                source.scan = "partial";
                const accessors = unit.getSearchAccessors();
                const project = createTargetProjector(unit);
                for (const [facetId, data] of unit.getCollector()
                    .facetBatches) {
                    for (const datum of data) {
                        source.rowsExamined++;
                        const matchedFields = fields.filter((field, index) => {
                            if (options.field && field !== options.field)
                                return false;
                            const value = accessors[index](datum);
                            if (value === null || value === undefined)
                                return false;
                            const text = String(value);
                            return (
                                collator.compare(
                                    mode === "prefix"
                                        ? text.slice(0, query.length)
                                        : text,
                                    query
                                ) === 0
                            );
                        });
                        if (!matchedFields.length) continue;
                        const projected = project(datum);
                        if (
                            options.target &&
                            !projected.targets.some((target) => target.zoomable)
                        )
                            continue;
                        if (matches.length === options.limit) {
                            result.truncated = true;
                            return result;
                        }
                        matches.push({
                            view: source.view,
                            datum: copyDatum(datum),
                            fields: matchedFields,
                            facetId:
                                facetId === undefined
                                    ? undefined
                                    : structuredClone(facetId),
                            ...projected,
                        });
                    }
                }
                source.scan = "complete";
            }
            return result;
        },

        listSearchableViews(options = {}) {
            const limit = options.exampleLimit ?? 3;
            validateLimit(limit);
            return sources(options.view).map(({ unit, fields, source }) => {
                const encoding = unit.getEncoding();
                const definitions = Array.isArray(encoding.search)
                    ? encoding.search
                    : [encoding.search];
                const metadata = fields.map((field, index) => ({
                    field,
                    description: describe(definitions[index].description),
                    examples: /** @type {string[]} */ ([]),
                }));
                const dataFields = new Set();
                if (source.readiness === "ready" && limit > 0) {
                    const accessors = unit.getSearchAccessors();
                    source.scan = "complete";
                    for (const datum of unit.getCollector().getData()) {
                        source.rowsExamined++;
                        for (const field of Object.keys(datum))
                            if (!field.startsWith("_")) dataFields.add(field);
                        metadata.forEach((info, index) => {
                            if (info.examples.length === limit) return;
                            const value = accessors[index](datum);
                            if (
                                value !== null &&
                                value !== undefined &&
                                !info.examples.includes(String(value))
                            )
                                info.examples.push(String(value));
                        });
                        if (
                            metadata.every(
                                (info) => info.examples.length === limit
                            )
                        ) {
                            source.scan = "partial";
                            break;
                        }
                    }
                }
                return {
                    view: source.view,
                    title: unit.getTitleText() ?? unit.explicitName ?? "view",
                    description: describe(unit.spec.description),
                    fields: metadata,
                    dataFields: Array.from(dataFields),
                    source,
                };
            });
        },
    };
}

/** @param {number} limit */
function validateLimit(limit) {
    if (!Number.isSafeInteger(limit) || limit < 0)
        throw new Error("Limit must be a nonnegative safe integer.");
}

/** @param {string | string[] | undefined} value */
function describe(value) {
    return Array.isArray(value) ? value.join(" ") : value;
}

/**
 * Prepare encoding access once per view, not per scanned row. Numeric interval
 * targets require both endpoints; locus points represent one base.
 * @param {import("./view/unitView.js").default} unit
 * @returns {(datum: import("./data/flowNode.js").Datum) => Pick<import("./types/search.js").DatumSearchMatch, "targets" | "targetIssues">}
 */
function createTargetProjector(unit) {
    /** @type {{channel: "x" | "y", reason: "unsupported-projection" | "invalid-position"}[]} */
    const unsupported = [];
    /** @type {{channel: "x" | "y", accessor: import("./types/encoder.js").Accessor, accessor2: import("./types/encoder.js").Accessor | undefined, resolution: import("./scales/scaleResolution.js").default, extent: number, kind: "locus" | "numeric"}[]} */
    const projectors = [];
    for (const channel of /** @type {const} */ (["x", "y"])) {
        const encoder = unit.mark.encoders[channel];
        if (!encoder) continue;
        const secondary = channel === "x" ? "x2" : "y2";
        const encoder2 = unit.getEncoding()[secondary]
            ? unit.mark.encoders[secondary]
            : undefined;
        const accessor = encoder.branches[0].accessor;
        const accessor2 = encoder2?.branches[0].accessor;
        const resolution = unit.getScaleResolution(channel);
        const type = resolution?.getScale().type;
        if (
            encoder.branches.length !== 1 ||
            (encoder2 && encoder2.branches.length !== 1) ||
            accessor.constant ||
            !accessor.scaleChannel ||
            !resolution ||
            (type !== "locus" &&
                (!isContinuous(type) || isDiscrete(type) || !accessor2)) ||
            (accessor2 && (accessor2.constant || !accessor2.scaleChannel))
        ) {
            unsupported.push({ channel, reason: "unsupported-projection" });
            continue;
        }
        const extent =
            type === "locus"
                ? resolution
                      .getAssembly()
                      .contigs.reduce((sum, contig) => sum + contig.size, 0)
                : Infinity;
        projectors.push({
            channel,
            accessor,
            accessor2,
            resolution,
            extent,
            kind: /** @type {"locus" | "numeric"} */ (
                type === "locus" ? "locus" : "numeric"
            ),
        });
    }
    return (datum) => {
        /** @type {import("./types/search.js").DatumSearchTarget[]} */
        const targets = [];
        const targetIssues = unsupported.map((issue) => ({ ...issue }));
        for (const {
            channel,
            accessor,
            accessor2,
            resolution,
            extent,
            kind,
        } of projectors) {
            const rawA = accessor(datum);
            const rawB = accessor2 ? accessor2(datum) : Number(rawA) + 1;
            const a =
                rawA === null || rawA === undefined || rawA === ""
                    ? NaN
                    : Number(rawA);
            const b =
                rawB === null || rawB === undefined || rawB === ""
                    ? NaN
                    : Number(rawB);
            const interval = /** @type {[number, number]} */ ([
                Math.min(a, b),
                Math.max(a, b),
            ]);
            if (
                !Number.isFinite(a) ||
                !Number.isFinite(b) ||
                a === b ||
                (kind === "locus" && (interval[0] < 0 || interval[1] > extent))
            ) {
                targetIssues.push({ channel, reason: "invalid-position" });
            } else {
                targets.push({
                    kind,
                    channel,
                    scale: resolution,
                    interval,
                    zoomable: resolution.isZoomable(),
                });
            }
        }
        return { targets, targetIssues };
    };
}
