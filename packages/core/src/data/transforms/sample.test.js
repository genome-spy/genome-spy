import SampleTransform from "./sample";
import { extent } from "d3-array";
import { createChain } from "../../view/flowBuilder";

test("SampleTransform produces roughly uniform distributions", () => {
    const size = 10;
    const n = 20;
    const rounds = 10000;

    const freqs = [];
    for (let i = 0; i < n; i++) {
        freqs[i] = 0;
    }

    const { dataSource, collector } = createChain(
        new SampleTransform({ type: "sample", size })
    );

    for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < n; i++) {
            dataSource.handle({ data: i });
        }
        dataSource.complete();

        for (const datum of collector.getData()) {
            freqs[datum.data] = freqs[datum.data] + 1;
        }

        dataSource.reset();
    }

    const e = extent(freqs);

    // Not a deterministic test! TODO: Come up with some sensical testing method
    expect(e[0]).toBeGreaterThan(4800);
    expect(e[1]).toBeLessThan(5200);
});
