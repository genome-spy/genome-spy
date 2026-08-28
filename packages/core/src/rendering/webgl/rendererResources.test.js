import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const events = /** @type {string[]} */ ([]);
    const delegates = /** @type {any[]} */ ([]);
    class FakeWebGLMark {
        /** @param {any} mark */
        constructor(mark) {
            this.mark = mark;
            this.updateCount = 0;
            this.disposeCount = 0;
            delegates.push(this);
        }

        initializeGraphics() {
            events.push(this.mark.name + ":initialize");
        }

        finalizeGraphicsInitialization() {
            events.push(this.mark.name + ":finalize");
            if (this.mark.failFinalize) {
                throw new Error(this.mark.name + " failed");
            }
        }

        updateGraphicsData() {
            this.updateCount++;
        }

        deleteGraphicsData() {}

        dispose() {
            this.disposeCount++;
        }

        isReady() {
            return true;
        }

        getDebugState() {
            return {
                markUniformsAltered: false,
                vertexCount: this.updateCount,
                rangeCount: 0,
            };
        }

        /** @returns {Array<() => void>} */
        prepareRender() {
            return [];
        }

        render() {}

        setViewport() {
            return true;
        }
    }
    return {
        createTexture: vi.fn(),
        events,
        delegates,
        FakeWebGLMark,
    };
});

vi.mock("twgl.js", async (importOriginal) => ({
    ...(await importOriginal()),
    createTexture: mocks.createTexture,
}));

vi.mock("./marks/arrow.js", () => ({ default: mocks.FakeWebGLMark }));
vi.mock("./marks/link.js", () => ({ default: mocks.FakeWebGLMark }));
vi.mock("./marks/point.js", () => ({ default: mocks.FakeWebGLMark }));
vi.mock("./marks/rect.js", () => ({ default: mocks.FakeWebGLMark }));
vi.mock("./marks/rule.js", () => ({ default: mocks.FakeWebGLMark }));
vi.mock("./marks/text.js", () => ({ default: mocks.FakeWebGLMark }));

import WebGLRendererResources from "./rendererResources.js";

beforeEach(() => {
    vi.resetAllMocks();
    mocks.events.length = 0;
    mocks.delegates.length = 0;
});

test("starts every shader before finalizing any mark", () => {
    const resources = new WebGLRendererResources(createGlHelper());
    const first = createMark("first");
    const second = createMark("second");

    resources.prepareMarks([first.mark, second.mark, first.mark]);

    expect(mocks.events).toEqual([
        "first:initialize",
        "second:initialize",
        "first:finalize",
        "second:finalize",
    ]);
    resources.prepareMarks([first.mark, second.mark]);
    expect(mocks.events).toHaveLength(4);
});

test("leaves text marks pending until font metrics are ready", () => {
    const resources = new WebGLRendererResources(createGlHelper());
    const fixture = createMark("text");
    fixture.mark.getType = () => "text";
    fixture.mark.font = { metrics: undefined };

    resources.prepareMarks([fixture.mark]);
    expect(resources.getMarkEntry(fixture.mark)).toBeUndefined();

    fixture.mark.font.metrics = {};
    resources.prepareMarks([fixture.mark]);
    expect(resources.getMarkEntry(fixture.mark)).toBeDefined();
});

test("synchronizes mark data only when encoded inputs change", () => {
    const resources = new WebGLRendererResources(createGlHelper());
    const fixture = createMark("point");
    resources.prepareMarks([fixture.mark]);
    const entry = resources.getMarkEntry(fixture.mark);

    resources.synchronize([entry]);
    resources.synchronize([entry]);
    expect(mocks.delegates[0].updateCount).toBe(1);

    fixture.collector.dataRevision++;
    resources.synchronize([entry]);
    fixture.configurationRevision++;
    resources.synchronize([entry]);
    fixture.encodedDataRevision++;
    resources.synchronize([entry]);

    expect(mocks.delegates[0].updateCount).toBe(4);
});

test("shares scale-resolution subscriptions across marks", () => {
    const glHelper = createGlHelper();
    const resources = new WebGLRendererResources(glHelper);
    const resolution = createScaleResolution();
    const first = createMark("first");
    const second = createMark("second");
    for (const fixture of [first, second]) {
        fixture.mark.encoders = {
            color: {
                scale: {},
                channelDef: { field: "category", type: "nominal" },
            },
        };
        fixture.mark.unitView.getScaleResolution = () => resolution;
    }

    resources.prepareMarks([first.mark, second.mark]);

    expect(glHelper.createRangeTexture).toHaveBeenCalledOnce();
    expect(resolution.addEventListener).toHaveBeenCalledTimes(2);
    resolution.listeners.get("domain")?.();
    expect(glHelper.createRangeTexture).toHaveBeenLastCalledWith(
        resolution,
        true
    );

    first.dispose();
    expect(resolution.removeEventListener).not.toHaveBeenCalled();
    second.dispose();
    expect(resolution.removeEventListener).toHaveBeenCalledTimes(2);
});

test("disposed entries stay inactive for already compiled batches", () => {
    const resources = new WebGLRendererResources(createGlHelper());
    const fixture = createMark("point");
    resources.prepareMarks([fixture.mark]);
    const entry = resources.getMarkEntry(fixture.mark);

    fixture.dispose();

    expect(resources.isEntryActive(entry)).toBe(false);
    expect(mocks.delegates[0].disposeCount).toBe(1);
    resources.dispose();
    expect(mocks.delegates[0].disposeCount).toBe(1);
});

test("finishes other shader programs when one fails", () => {
    const resources = new WebGLRendererResources(createGlHelper());
    const failed = createMark("failed");
    failed.mark.failFinalize = true;
    const successful = createMark("successful");

    expect(() =>
        resources.prepareMarks([failed.mark, successful.mark])
    ).toThrow("failed failed");

    expect(mocks.events).toEqual([
        "failed:initialize",
        "successful:initialize",
        "failed:finalize",
        "successful:finalize",
    ]);
    expect(resources.isEntryActive(resources.getMarkEntry(failed.mark))).toBe(
        false
    );
    expect(
        resources.isEntryActive(resources.getMarkEntry(successful.mark))
    ).toBe(true);
});

test("rejects resource creation after disposal", () => {
    const glHelper = createGlHelper();
    const resources = new WebGLRendererResources(glHelper);

    resources.dispose();

    expect(() => resources.prepareMarks([])).toThrow(
        "WebGL renderer resources have been disposed."
    );
    expect(() => resources.prepareFontBitmap("font.png")).toThrow(
        "WebGL renderer resources have been disposed."
    );
});

test("deletes a font texture when disposed during loading", async () => {
    const texture = /** @type {WebGLTexture} */ ({});
    /** @type {(error?: Error) => void} */
    let finishLoading;
    mocks.createTexture.mockImplementation(
        /** @param {any} gl @param {any} options @param {(error?: Error) => void} callback */
        (gl, options, callback) => {
            finishLoading = callback;
            return texture;
        }
    );
    const glHelper = createGlHelper();
    const resources = new WebGLRendererResources(glHelper);
    const load = resources.prepareFontBitmap("font.png");
    const rejection = expect(load).rejects.toThrow(
        "WebGL renderer resources were disposed while loading a font."
    );

    resources.dispose();
    finishLoading();

    await rejection;
    expect(glHelper.gl.deleteTexture).toHaveBeenCalledOnce();
    expect(glHelper.gl.deleteTexture).toHaveBeenCalledWith(texture);
});

function createGlHelper() {
    return /** @type {any} */ ({
        gl: {
            LINEAR: 9729,
            deleteTexture: vi.fn(),
        },
        createRangeTexture: vi.fn(),
        setResourceFinalizer: vi.fn(),
    });
}

/** @param {string} name */
function createMark(name) {
    const collector = { completed: true, dataRevision: 0 };
    /** @type {(() => void)[]} */
    const disposers = [];
    const fixture = {
        collector,
        configurationRevision: 0,
        encodedDataRevision: 0,
        mark: /** @type {any} */ ({
            name,
            encoders: {},
            getType: () => "point",
            initializeRenderingRevisions: vi.fn(),
            getRenderingRevision: () => fixture.configurationRevision,
            getEncodedDataRevision: () => fixture.encodedDataRevision,
            unitView: {
                getCollector: () => collector,
                registerDisposer: (/** @type {() => void} */ disposer) =>
                    disposers.push(disposer),
            },
        }),
        dispose() {
            for (const disposer of disposers) {
                disposer();
            }
        },
    };
    return fixture;
}

function createScaleResolution() {
    /** @type {Map<string, () => void>} */
    const listeners = new Map();
    return {
        listeners,
        getScale: () => ({}),
        addEventListener: vi.fn((type, listener) =>
            listeners.set(type, listener)
        ),
        removeEventListener: vi.fn((type) => listeners.delete(type)),
    };
}
