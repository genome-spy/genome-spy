/** Validate and detach a retained categorical rank window.
 * @param {import("../../index.d.ts").ScaleViewport | null} value
 * @returns {import("../../index.d.ts").ScaleViewport | null}
 */
export function normalizeScaleViewport(value) {
    if (value === null) return null;
    const { interval, gapRanks } = value;
    if (
        !Array.isArray(interval) ||
        interval.length !== 2 ||
        !interval.every(Number.isFinite) ||
        interval[1] < interval[0] ||
        (!gapRanks && interval[0] === interval[1]) ||
        (gapRanks &&
            (gapRanks.length !== 2 ||
                !gapRanks.every(Number.isFinite) ||
                gapRanks[1] < gapRanks[0]))
    )
        throw new Error(
            "A band viewport requires a finite increasing interval and optional gap ranks."
        );
    return {
        interval: [interval[0], interval[1]],
        ...(gapRanks
            ? {
                  gapRanks: /** @type {[number, number]} */ ([
                      gapRanks[0],
                      gapRanks[1],
                  ]),
              }
            : {}),
    };
}
