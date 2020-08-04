import ReservoirSampler from "./reservoirSampler";

import { extent } from "d3-array";

test("ReservoirSampler produces roughly uniform distributions", () => {
    const size = 10;
    const n = 20;
    const rounds = 10000;

    const freqs = [];
    for (let i = 0; i < n; i++) {
        freqs[i] = 0;
    }

    for (let r = 0; r < rounds; r++) {
        const sampler = new ReservoirSampler(size);

        for (let i = 0; i < n; i++) {
            sampler.ingest(i);
        }

        for (const a of sampler.getSamples()) {
            freqs[a] = freqs[a] + 1;
        }
    }

    const e = extent(freqs);

    // Not a deterministic test! TODO: Come up with some sensical testing method
    expect(e[0]).toBeGreaterThan(4800);
    expect(e[1]).toBeLessThan(5200);
});
