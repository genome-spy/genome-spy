/* global window, performance */

/** Install browser-local measurement callbacks. */
export function install() {
    const s = window.costScene;
    const series = (phase) => ({
        text: s.strings[phase],
        x: s.x,
        y: s.y,
        uniqueId: s.ids,
    });
    window.cpuSample = async function (mode, phase) {
        await s.renderer.device.queue.onSubmittedWorkDone();
        let temporary;
        const start = performance.now();
        switch (mode) {
            case "create":
                temporary = s.renderer.createMark(
                    s.textMark,
                    s.config(s.strings[phase])
                );
                break;
            case "replace":
                s.mark.series.replace(series(phase));
                break;
            case "repaint":
                s.renderer.render({
                    items: [{ mark: s.mark }],
                    clearColor: { r: 0, g: 0, b: 0, a: 0 },
                });
                break;
            case "layout":
                s.lastLayout = s.buildOutlineTextLayout(
                    s.strings[phase],
                    s.font,
                    { fontSize: s.spec.size, letterSpacing: s.spacing }
                );
                break;
            case "lookup":
                s.lastLookup = s.buildTextGlyphLookup(s.lastLayout);
                break;
            default:
                throw Error(mode);
        }
        const cpu = performance.now() - start;
        const drainStart = performance.now();
        await s.renderer.device.queue.onSubmittedWorkDone();
        const queue = performance.now() - drainStart;
        if (temporary) s.renderer.destroyMark(temporary.markId);
        return { cpu, queue };
    };
}
/** @param {boolean} enable */
export function profiler(enable) {
    const key = Symbol.for("genome-spy.performance-profiler");
    if (!enable) {
        delete globalThis[key];
        return;
    }
    const state = { counts: {}, phases: {} };
    window.costProfile = state;
    globalThis[key] = {
        enabled: true,
        addCount(name, value = 1) {
            state.counts[name] = (state.counts[name] ?? 0) + value;
        },
        addPhase(name, value) {
            state.phases[name] = (state.phases[name] ?? 0) + value;
        },
    };
}
