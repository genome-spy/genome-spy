// A generic toy signal with high, low, and baseline ranges.
export const observations = Array.from({ length: 120 }, (_, i) => {
    const high = i >= 30 && i < 50;
    const low = i >= 80 && i < 95;
    return {
        id: "record-" + (i + 1),
        x: 5 + 10 * i,
        value: high ? 0.6 : low ? -0.8 : 0,
        state: high ? "high" : low ? "low" : "baseline",
    };
});
