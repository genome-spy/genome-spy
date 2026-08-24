/**
 * Private performance instrumentation used by the interaction benchmark.
 *
 * The profiler is activated only by the benchmark page. Runtime code asks for
 * the profiler through a shared symbol so the renderer package can contribute
 * counters without importing Core or exposing a production API.
 */
const profilerKey = Symbol.for("genome-spy.performance-profiler");

/**
 * @typedef {object} PerformanceProfiler
 * @property {boolean} enabled
 * @property {(renderer: string, kind?: string) => void} beginFrame
 * @property {() => void} endFrame
 * @property {(name: string, duration: number) => void} addPhase
 * @property {(name: string, value?: number) => void} addCount
 * @property {() => PerformanceSnapshot} snapshot
 * @property {() => void} reset
 */

/**
 * @typedef {object} PerformanceSnapshot
 * @property {boolean} enabled
 * @property {object[]} frames
 * @property {Record<string, number>} phaseTotals
 * @property {Record<string, number>} countTotals
 */

/**
 * @returns {PerformanceProfiler | undefined}
 */
export function getPerformanceProfiler() {
    const globalObject = /** @type {Record<symbol, unknown>} */ (globalThis);
    return /** @type {PerformanceProfiler | undefined} */ (
        globalObject[profilerKey]
    );
}

/**
 * Starts the private profiler used by the browser benchmark.
 *
 * @returns {PerformanceProfiler}
 */
export function startPerformanceProfiler() {
    const profiler = createPerformanceProfiler();
    const globalObject = /** @type {Record<symbol, unknown>} */ (globalThis);
    globalObject[profilerKey] = profiler;
    return profiler;
}

/** @returns {PerformanceProfiler} */
function createPerformanceProfiler() {
    /** @type {{renderer: string, kind: string, start: number, end?: number, phases: Record<string, number>, counts: Record<string, number>}[]} */
    let frames = [];
    /** @type {Record<string, number>} */
    let phaseTotals = {};
    /** @type {Record<string, number>} */
    let countTotals = {};
    /** @type {{renderer: string, kind: string, start: number, end?: number, phases: Record<string, number>, counts: Record<string, number>} | undefined} */
    let currentFrame;

    /** @param {string} name @param {number} duration */
    const addPhase = (name, duration) => {
        if (!Number.isFinite(duration) || duration < 0) {
            return;
        }
        phaseTotals[name] = (phaseTotals[name] ?? 0) + duration;
        if (currentFrame) {
            currentFrame.phases[name] =
                (currentFrame.phases[name] ?? 0) + duration;
        }
    };

    /** @param {string} name @param {number} [value] */
    const addCount = (name, value = 1) => {
        if (!Number.isFinite(value)) {
            return;
        }
        countTotals[name] = (countTotals[name] ?? 0) + value;
        if (currentFrame) {
            currentFrame.counts[name] =
                (currentFrame.counts[name] ?? 0) + value;
        }
    };

    return {
        enabled: true,

        beginFrame(renderer, kind = "render") {
            if (currentFrame) {
                currentFrame.end = performance.now();
                frames.push(currentFrame);
            }
            currentFrame = {
                renderer,
                kind,
                start: performance.now(),
                phases: {},
                counts: {},
            };
        },

        endFrame() {
            if (!currentFrame) {
                return;
            }
            currentFrame.end = performance.now();
            frames.push(currentFrame);
            currentFrame = undefined;
        },

        addPhase,
        addCount,

        snapshot() {
            const completedFrames = frames.map((frame) => ({
                ...frame,
                duration: (frame.end ?? performance.now()) - frame.start,
            }));
            return {
                enabled: true,
                frames: completedFrames,
                phaseTotals: { ...phaseTotals },
                countTotals: { ...countTotals },
            };
        },

        reset() {
            frames = [];
            phaseTotals = {};
            countTotals = {};
            currentFrame = undefined;
        },
    };
}

/**
 * Measures a synchronous operation when profiling is enabled.
 *
 * @template T
 * @param {string} name
 * @param {() => T} callback
 * @returns {T}
 */
export function measurePerformance(name, callback) {
    const profiler = getPerformanceProfiler();
    if (!profiler?.enabled) {
        return callback();
    }
    const start = performance.now();
    try {
        return callback();
    } finally {
        profiler.addPhase(name, performance.now() - start);
    }
}

/**
 * Adds a counter without allocating when profiling is disabled.
 *
 * @param {string} name
 * @param {number} [value]
 */
export function countPerformance(name, value) {
    getPerformanceProfiler()?.addCount(name, value);
}
