import { afterEach, expect, test, vi } from "vitest";
import { annotateSpecError, getSpecErrorLocation } from "./specError.js";
import {
    createHeadlessEngine,
    createHeadlessViewContext,
} from "../genomeSpy/headlessBootstrap.js";
import { getEncoderAccessors } from "../encoder/encoder.js";

afterEach(() => vi.unstubAllGlobals());

test("preserves the responsible error through wrappers and handles unrelated causes", () => {
    const location = { origin: "encoding", path: ["field"] };
    const cause = new Error("missing field");
    expect(annotateSpecError(cause, location)).toBe(cause);
    const wrapper = new Error("cannot parse data", { cause });
    annotateSpecError(wrapper, { origin: "data" });
    expect(getSpecErrorLocation(wrapper)).toBe(location);
    expect(
        getSpecErrorLocation(new Error("error", { cause: "text" }))
    ).toBeUndefined();
    const cycle = new Error("cycle");
    cycle.cause = cycle;
    expect(getSpecErrorLocation(cycle)).toBeUndefined();
});

/**
 * @param {object} declaration
 * @param {boolean} [wrapRoot]
 */
function locatedContext(declaration, wrapRoot = false) {
    const context = createHeadlessViewContext({
        viewFactoryOptions: { wrapRoot },
    });
    context.getSpecOrigin = (fragment) =>
        fragment === declaration ? "declaration" : undefined;
    return context;
}

test.each(["point", "rect", "rule", "text"])(
    "locates a missing inherited field after %s normalization",
    async (mark) => {
        const declaration = {
            field: "missing",
            type: /** @type {const} */ ("nominal"),
        };
        const spec = {
            data: { values: [{ present: 1 }] },
            encoding: { x: declaration },
            layer: [{ mark: /** @type {"point"} */ (mark) }],
        };
        await expect(
            createHeadlessEngine(spec, { context: locatedContext(declaration) })
        ).rejects.toSatisfy((error) => {
            expect(error.message).toContain(
                'Invalid field "missing". Available fields or properties: present'
            );
            expect(getSpecErrorLocation(error)).toEqual({
                origin: "declaration",
                path: ["field"],
            });
            return true;
        });
    }
);

test("locates a copied conditional color field", async () => {
    const condition = {
        param: "selected",
        field: "missing",
        type: /** @type {const} */ ("quantitative"),
    };
    const spec = {
        data: { values: [{ present: 1 }] },
        params: [{ name: "selected", select: /** @type {const} */ ("point") }],
        mark: /** @type {const} */ ("point"),
        encoding: { color: { condition, value: "gray" } },
    };
    await expect(
        createHeadlessEngine(spec, { context: locatedContext(condition) })
    ).rejects.toSatisfy((error) => {
        expect(getSpecErrorLocation(error)).toEqual({
            origin: "declaration",
            path: ["field"],
        });
        return true;
    });
});

test.each(["offset", "text endpoint"])(
    "preserves field origins in normalized %s encodings",
    async (kind) => {
        const declaration = {
            field: "missing",
            type: "index",
            scale: { domain: [0, 10] },
        };
        const spec = /** @type {import("../spec/root.js").RootSpec} */ ({
            data: { values: [] },
            mark: kind === "offset" ? "rect" : "text",
            encoding:
                kind === "offset"
                    ? {
                          x: {
                              field: "group",
                              type: "nominal",
                              scale: { domain: ["a"] },
                          },
                          xOffset: { ...declaration, type: "nominal" },
                      }
                    : {
                          x: {
                              datum: 1,
                              type: "index",
                              scale: { domain: [0, 10] },
                          },
                          x2: declaration,
                      },
        });
        const source = kind === "offset" ? spec.encoding.xOffset : declaration;
        const { view } = await createHeadlessEngine(spec, {
            context: locatedContext(source),
        });
        const unit = /** @type {import("../view/unitView.js").default} */ (
            view
        );
        const encoder =
            unit.mark.encoders[kind === "offset" ? "xOffset" : "x2"];
        expect(() => getEncoderAccessors(encoder)[0]({ group: "a" })).toThrow(
            expect.objectContaining({
                specLocation: { origin: "declaration", path: ["field"] },
            })
        );
        view.disposeSubtree();
    }
);

test.each([
    { expr: "missing + 1" },
    { expr: "missing + span(domain('x'))" },
    { expr: "missing + 1", transition: { type: "lerp" } },
    { expr: "missing + 1", debounce: 10 },
    { expr: "1 +" },
    { expr: "notAFunction(1)" },
])("locates named parameter expression errors: %j", async (definition) => {
    const param = { name: "derived", ...definition };
    const spec = {
        params: [param],
        mark: /** @type {const} */ ("point"),
        encoding: {
            x: {
                datum: 1,
                type: /** @type {const} */ ("quantitative"),
                scale: { domain: [0, 10] },
            },
        },
    };
    await expect(
        createHeadlessEngine(
            /** @type {import("../spec/root.js").RootSpec} */ (spec),
            { context: locatedContext(param) }
        )
    ).rejects.toSatisfy((error) => {
        expect(error.message).toContain(
            definition.expr.startsWith("missing")
                ? 'Unknown variable "missing"'
                : "Invalid expression"
        );
        expect(getSpecErrorLocation(error)).toEqual({
            origin: "declaration",
            path: ["expr"],
        });
        return true;
    });
});

test.each(
    ["missing + 1", "1 +"].flatMap((expr) =>
        [
            "encoding value",
            "encoding expr",
            "formula",
            "filter",
            "domain",
            "range",
            "url",
            "width",
            "cursor",
            "title",
            "point property",
            "axis ticks",
            "view axis ticks",
        ].map((kind) => ({ kind, expr }))
    )
)("locates an invalid $kind expression: $expr", async ({ kind, expr }) => {
    const declaration = { expr };
    /** @type {any} */
    const spec = {
        data: { values: [{ present: 1 }] },
        mark: "point",
        encoding: { x: { field: "present", type: "quantitative" } },
    };
    if (kind === "encoding value") spec.encoding.color = { value: declaration };
    if (kind === "encoding expr") {
        spec.encoding.color = Object.assign(declaration, {
            type: "nominal",
            scale: null,
        });
    }
    if (kind === "formula" || kind === "filter") {
        Object.assign(declaration, {
            type: kind,
            ...(kind === "formula" ? { as: "derived" } : {}),
        });
        spec.transform = [declaration];
    }
    if (kind === "domain") spec.encoding.x.scale = { domain: [0, declaration] };
    if (kind === "range")
        spec.encoding.size = {
            field: "present",
            type: "quantitative",
            scale: { range: [0, declaration] },
        };
    if (kind === "url") spec.data = { url: declaration };
    if (kind === "width") spec.width = declaration;
    if (kind === "cursor") spec.cursor = declaration;
    if (kind === "title") spec.title = { text: declaration };
    if (kind === "point property")
        spec.mark = { type: "point", semanticZoomFraction: declaration };
    if (kind === "axis ticks")
        spec.encoding.x.axis = { tickCount: declaration };
    if (kind === "view axis ticks")
        spec.axes = { x: { tickCount: declaration } };
    await expect(
        createHeadlessEngine(spec, {
            context: locatedContext(declaration, kind.includes("axis ticks")),
        }).then(({ view }) => {
            // Cursor/title expressions bind when the UI requests their values.
            try {
                if (kind === "cursor") view.getCursor();
                if (kind === "title") view.getTitleText();
            } finally {
                view.disposeSubtree();
            }
        })
    ).rejects.toSatisfy((error) => {
        expect(getSpecErrorLocation(error)).toEqual({
            origin: "declaration",
            path: ["expr"],
        });
        return true;
    });
});

test("reports a downstream field location separately from the URL source origin", async () => {
    vi.stubGlobal("fetch", async () => new Response("present\n1\n"));
    const declaration = {
        field: "missing",
        type: /** @type {const} */ ("quantitative"),
    };
    const spec = {
        data: { url: "data.csv" },
        mark: /** @type {const} */ ("point"),
        encoding: { x: declaration },
    };
    const context = locatedContext(declaration);
    context.getSpecOrigin = (fragment) =>
        fragment === declaration
            ? "encoding"
            : fragment === spec.data
              ? "data"
              : undefined;
    const { view } = await createHeadlessEngine(spec, { context });
    const registry = context.dataFlow.loadingStatusRegistry;
    const entry = registry
        .getSnapshot()
        .find((entry) => entry.origin === "data");
    expect(entry).toMatchObject({
        status: "error",
        errorPhase: "processing",
        errorLocation: { origin: "encoding", path: ["field"] },
    });
    // Public snapshots and events must not let one observer alter another's location.
    /** @type {string[]} */ (entry.errorLocation.path)[0] = "url";
    expect(
        registry.getSnapshot().find((entry) => entry.origin === "data")
            .errorLocation.path
    ).toEqual(["field"]);
    registry.subscribe((change) => {
        if (change.type === "update" && change.entry.errorLocation)
            /** @type {string[]} */ (change.entry.errorLocation.path)[0] =
                "url";
    });
    registry.setSource(
        view.flowHandle.dataSource,
        "error",
        entry.message,
        "processing",
        { origin: "encoding", path: ["field"] }
    );
    expect(
        registry.getSnapshot().find((entry) => entry.origin === "data")
            .errorLocation.path
    ).toEqual(["field"]);
    registry.setSource(view.flowHandle.dataSource, "complete");
    expect(
        registry.getSnapshot().find((entry) => entry.origin === "data")
            .errorLocation
    ).toBeUndefined();
    view.disposeSubtree();
});

test("does not validate datum fields in expressions or require an origin hook", async () => {
    const { view } = await createHeadlessEngine({
        data: { values: [{ present: 1 }] },
        mark: "point",
        encoding: {
            color: {
                expr: "isValid(datum.missing) ? 'red' : 'gray'",
                type: "nominal",
                scale: null,
            },
        },
    });
    view.disposeSubtree();
});
