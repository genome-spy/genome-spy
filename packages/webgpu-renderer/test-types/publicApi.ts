import {
    createRenderer,
    type MarkDefinition,
} from "@genome-spy/webgpu-renderer";
import { pointMark } from "@genome-spy/webgpu-renderer/marks/point";
import { linearScale } from "@genome-spy/webgpu-renderer/scales/linear";

export async function createPointExample(
    canvas: HTMLCanvasElement
): Promise<void> {
    const renderer = await createRenderer(canvas);
    renderer.createMark(pointMark, {
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
}

type CustomConfig = { radius: number };

declare const customMark: MarkDefinition<CustomConfig>;

export async function createCustomExample(
    canvas: HTMLCanvasElement
): Promise<void> {
    const renderer = await createRenderer(canvas);
    renderer.createMark(customMark, { radius: 4 });
}
