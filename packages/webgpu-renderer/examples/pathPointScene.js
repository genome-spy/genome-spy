import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { indexScale } from "../src/scales/index.js";
import { ordinalScale } from "../src/scales/ordinal.js";
import { DEFAULT_SPARSE_PATH_ATLAS_OPTIONS } from "../src/symbols/sparsePathAtlasLayout.js";

export const PATHS = [
    "M0-1A1 1 0 1 1 0 1A1 1 0 1 1 0-1Z",
    "M-1-1H1V1H-1Z",
    "M-.35-1H.35V-.35H1V.35H.35V1H-.35V.35H-1V-.35H-.35Z",
    "M0-1L1 0 0 1-1 0Z",
    "M0-1L1 1H-1Z",
    "M-1-1L1 0-1 1Z",
    "M-1-1H1L0 1Z",
    "M1-1V1L-1 0Z",
    "M-.2-1H.2V1H-.2Z",
    "M-1-.2H1V.2H-1Z",
    "M-.85-1L0-.15.85-1 1-.85.15 0 1 .85.85 1 0 .15-.85 1-1 .85-.15 0-1-.85Z",
    "M-.25-1H.25V-.25H1V.25H.25V1H-.25V.25H-1V-.25H-.25Z",
    "M0-1 .24-.32.95-.31.38.12.59.81 0 .4-.59.81-.38.12-.95-.31-.24-.32Z",
    "M0-.85C-.9-1-1 .15-.65.5L0 1 .65.5C1 .15.9-1 0-.85Z",
    "M-1-1H1V1H-1ZM-.5-.5H.5V.5H-.5Z",
    "M-1-.7H.3V.7H-1ZM-.3-1H1V1H-.3Z",
];

export const PATH_POINT_ATLAS_OPTIONS = DEFAULT_SPARSE_PATH_ATLAS_OPTIONS;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ backend?: "wgsl" | "msdfgen" }} [options]
 * @returns {Promise<() => void>}
 */
export default async function runPathPointScene(canvas, options = {}) {
    const backend = options.backend ?? "wgsl";
    const markDefinition =
        backend === "msdfgen"
            ? (await import("../tests/oracles/msdfgen/pathPointMark.js"))
                  .comparisonPathPointMark
            : pointMark;
    const renderer = await createExampleRenderer(canvas);
    const columns = PATHS.length;
    const rows = 6;
    const count = columns * rows;
    const maximumPointDiameter = 60;
    const x = new Uint32Array(count);
    const y = new Uint32Array(count);
    const size = new Float32Array(count);
    const angle = new Float32Array(count);
    const strokeWidth = new Float32Array(count);
    const shape = new Uint32Array(count);
    const fill = new Uint32Array(count);
    const palette = [
        [0.2, 0.45, 0.85, 1.0],
        [0.95, 0.55, 0.2, 1.0],
        [0.25, 0.75, 0.4, 1.0],
        [0.85, 0.25, 0.5, 1.0],
        [0.65, 0.6, 0.2, 1.0],
    ];

    for (let i = 0; i < count; i++) {
        const column = i % columns;
        const row = Math.floor(i / columns);
        const xFraction = column / (columns - 1);
        const yFraction = row / Math.max(1, rows - 1);
        x[i] = column;
        y[i] = row;
        size[i] = xFraction ** 2 * maximumPointDiameter ** 2;
        angle[i] = yFraction * 45;
        strokeWidth[i] = yFraction * 4;
        shape[i] = column % PATHS.length;
        fill[i] = column % palette.length;
    }

    const pathConfig =
        backend === "msdfgen"
            ? {
                  paths: PATHS,
                  atlasBackend: "wasm",
                  atlasOptions: {
                      ...PATH_POINT_ATLAS_OPTIONS,
                      normalizationSpan: 2,
                  },
              }
            : { shapes: PATHS };
    const { series, scales } = renderer.createMark(markDefinition, {
        count,
        ...pathConfig,
        channels: {
            x: {
                data: x,
                type: "u32",
                scale: indexScale({
                    domain: [0, columns],
                    paddingInner: 0.1,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            y: {
                data: y,
                type: "u32",
                scale: indexScale({
                    domain: [0, rows],
                    paddingInner: 0.1,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            size: { data: size, type: "f32" },
            shape: { data: shape, type: "u32" },
            fill: {
                data: fill,
                type: "u32",
                inputComponents: 1,
                scale: ordinalScale({
                    domain: Array.from({ length: palette.length }, (_, i) => i),
                    range: palette,
                }),
            },
            stroke: { value: [0.0, 0.0, 0.0, 1.0] },
            strokeWidth: { data: strokeWidth, type: "f32" },
            angle: { data: angle, type: "f32" },
        },
    });

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([0, width]);
        scales.y.setRange([0, height]);
    };
    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    series.replace({ x, y, size, shape, fill, strokeWidth, angle }, count);
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
