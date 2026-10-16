// Prepared synthetic signal: a gain, a loss, and neutral observations.
export const observations = Array.from({ length: 120 }, (_, i) => {
    const gain = i >= 30 && i < 50;
    const loss = i >= 80 && i < 95;
    return {
        id: "bin-" + (i + 1),
        positionKb: 5 + 10 * i,
        log2Ratio: gain ? 0.6 : loss ? -0.8 : 0,
        state: gain ? "gain" : loss ? "loss" : "neutral",
    };
});
