import {
    createRenderer,
    type MarkDefinition,
} from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linkMark } from "@genome-spy/webgpu-renderer/marks/link";
import { rectMark } from "@genome-spy/webgpu-renderer/marks/rect";
import { ruleMark } from "@genome-spy/webgpu-renderer/marks/rule";
import { textMark } from "@genome-spy/webgpu-renderer/marks/text";
import { bandScale } from "@genome-spy/webgpu-renderer/scales/band";
import { identityScale } from "@genome-spy/webgpu-renderer/scales/identity";
import { indexScale } from "@genome-spy/webgpu-renderer/scales/index";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";
import { logScale } from "@genome-spy/webgpu-renderer/scales/log";
import { ordinalScale } from "@genome-spy/webgpu-renderer/scales/ordinal";
import { powScale } from "@genome-spy/webgpu-renderer/scales/pow";
import { quantizeScale } from "@genome-spy/webgpu-renderer/scales/quantize";
import { sqrtScale } from "@genome-spy/webgpu-renderer/scales/sqrt";
import { symlogScale } from "@genome-spy/webgpu-renderer/scales/symlog";
import { thresholdScale } from "@genome-spy/webgpu-renderer/scales/threshold";

export const builtInMarks = [
    pointMark,
    rectMark,
    ruleMark,
    linkMark,
    textMark,
] as const;

export const configuredScales = [
    linearScale(),
    identityScale(),
    bandScale(),
    indexScale(),
    ordinalScale(),
    thresholdScale(),
    logScale(),
    powScale(),
    sqrtScale(),
    symlogScale(),
    quantizeScale(),
] as const;

export async function createPointExample(
    canvas: HTMLCanvasElement
): Promise<void> {
    const renderer = await createRenderer(canvas);
    const points = renderer.createMark(pointMark, {
        channels: {
            x: {
                data: new Float32Array([0, 1]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 100] }),
            },
            y: {
                data: new Float32Array([1, 0]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [100, 0] }),
            },
        },
    });
    points.series.replace({
        x: new Float32Array([0.25, 0.75]),
        y: new Float32Array([0.75, 0.25]),
    });

    const labels = renderer.createMark(textMark, {
        channels: {
            text: { data: ["0.00000"] },
            x: { data: new Float32Array([0]), scale: identityScale() },
            y: { data: new Float32Array([0]), scale: identityScale() },
        },
    });
    labels.series.replace({
        text: ["-1.0", "1.0"],
        x: new Float32Array([0, 100]),
        y: new Float32Array([50, 50]),
    });

    renderer.render({
        clearColor: [1, 1, 1, 1],
        draws: [
            {
                mark: points,
                viewport: { x: 0, y: 0, width: 100, height: 100 },
                scissor: { x: 10, y: 10, width: 80, height: 80 },
                firstInstance: 0,
                instanceCount: 2,
            },
            { mark: labels },
        ],
    });
}

type CustomConfig = { radius: number };

declare const customMark: MarkDefinition<CustomConfig>;

export async function createCustomExample(
    canvas: HTMLCanvasElement
): Promise<void> {
    const renderer = await createRenderer(canvas);
    renderer.createMark(customMark, { radius: 4 });
}
