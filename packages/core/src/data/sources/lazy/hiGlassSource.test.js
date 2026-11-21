import { afterEach, expect, test, vi } from "vitest";
import Collector from "../../collector.js";
import GenomeSpy from "../../../genomeSpyBase.js";
import UnitView from "../../../view/unitView.js";
import Rectangle from "../../../view/layout/rectangle.js";
import { createBroadcastingTestViewContext } from "../../../view/testUtils.js";
import HiGlassSource from "./hiGlassSource.js";
import {
    decodeTile,
    getTriangleTileWindow,
    mirrorDiagonal,
    transposeTile,
} from "./hiGlassTiles.js";

afterEach(() => vi.unstubAllGlobals());

test("triangle windows include an offscreen endpoint and key the projected tile set", () => {
    /** @type {import("./hiGlassTiles.js").HiGlassMetadata} */
    const metadata = {
        min_pos: [0, 0],
        max_pos: [32, 32],
        max_width: 32,
        max_zoom: 3,
        bins_per_dimension: 4,
        chromsizes: [["chr1", 32]],
    };
    const short = getTriangleTileWindow(metadata, [8, 16], 16, 1);
    const tall = getTriangleTileWindow(metadata, [8, 16], 16, 12);
    expect(tall.level).toBe(short.level);
    expect(tall.positions).toContainEqual([1, 3]);
    expect(short.positions).not.toContainEqual([1, 3]);
    expect(tall.key).not.toBe(short.key);
    expect(tall.positions).not.toContainEqual([3, 1]);
});

test("decodes float16 cells and mirrors the stored triangle", () => {
    const bytes = new Uint8Array([0, 60, 0, 0, 0, 126, 0, 0]);
    const values = decodeTile({ dense: bytes.toBase64(), dtype: "float16" }, 2);
    expect(Array.from(values)).toEqual([1, 0, NaN, 0]);
    expect(Array.from(transposeTile(values, 2))).toEqual([1, NaN, 0, 0]);
    mirrorDiagonal(values, 2);
    expect(Array.from(values)).toEqual([1, NaN, NaN, 0]);
});

test.each([undefined, /** @type {const} */ ("triangle")])(
    "publishes only the latest tile window after cancellation (projection %s)",
    async (projection) => {
        let domain = [0, 8];
        const scale = {
            type: "locus",
            getAxisLength: () => 2,
            getDomain: () => domain,
            getAssembly: () => ({ contigs: [{ name: "chr1", size: 8 }] }),
        };
        // Supply the view graph used by the embed API's lazy-data wait.
        const view = Object.assign(Object.create(UnitView.prototype), {
            context: createBroadcastingTestViewContext(),
            getBaseUrl: () => "",
            getScaleResolution: (/** @type {string} */ channel) =>
                projection && channel === "y" ? undefined : scale,
            layoutCoords: Rectangle.create(0, 0, 2, 2),
            getEffectiveOpacity: () => 1,
            getLayoutAncestors: () => [view],
            getPathString: () => "test",
            isVisible: () => true,
            /** @param {(view: UnitView) => void} visitor */
            visit: (visitor) => visitor(view),
        });
        const source = new HiGlassSource(
            {
                type: "higlass",
                url: "https://tiles.example/",
                tileset: "test",
                projection,
            },
            view
        );
        const collector = new Collector({ type: "collect" });
        source.addChild(collector);
        view.flowHandle = { collector, dataSource: source };
        const engine = Object.assign(Object.create(GenomeSpy.prototype), {
            viewRoot: view,
        });

        const coarse = Promise.withResolvers();
        const fine = Promise.withResolvers();
        const fetch = vi.fn(
            /** @param {URL} url @param {RequestInit} _options */
            (url, _options) => {
                const id = url.searchParams.get("d");
                if (id === "test.0.0.0") return coarse.promise;
                if (id === "test.2.0.0") return fine.promise;
                expect(id).toBe("test");
                return Promise.resolve(
                    Response.json({
                        test: {
                            min_pos: [0, 0],
                            max_pos: [8, 8],
                            max_width: 8,
                            max_zoom: 2,
                            bins_per_dimension: 2,
                            chromsizes: [["chr1", 8]],
                        },
                    })
                );
            }
        );
        const dense = new Uint8Array(
            new Float32Array([1, 0, 2, 3]).buffer
        ).toBase64();
        vi.stubGlobal("fetch", fetch);

        try {
            await source.load();
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
            domain = [0, 2];
            source.ensureViewportData();
            await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
            expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
            const ready = vi.fn();
            const visibleData = engine
                .awaitVisibleLazyData(AbortSignal.timeout(2000))
                .then(ready);
            await Promise.resolve();
            expect(ready).not.toHaveBeenCalled();
            const ids = fetch.mock.calls[2][0].searchParams.getAll("d");
            expect(ids).toEqual(
                projection ? ["test.2.0.0", "test.2.0.1"] : ["test.2.0.0"]
            );
            fine.resolve(
                Response.json(
                    Object.fromEntries(
                        ids.map((id) => [id, { dense, dtype: "float32" }])
                    )
                )
            );
            await visibleData;
            expect(source.isDataReadyForDomain({})).toBe(true);
            const revision = collector.dataRevision;
            coarse.resolve(
                Response.json({ "test.0.0.0": { dense, dtype: "float32" } })
            );
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(collector.dataRevision).toBe(revision);
            const [tile] = collector.getData();
            expect(tile.dimensions.column.step).toBe(1);
            expect(Array.from(tile.fields.value)).toEqual([1, 2, 2, 3]);
        } finally {
            source.dispose();
        }
    }
);
