import type {
    MarkConfig,
    MarkHandle,
    MarkType,
    Renderer,
    RendererOptions,
    ScaleDef,
} from "./index.js";

export { RendererError } from "./index.js";

export type CompatibilityRenderer = Omit<Renderer, "createMark"> & {
    createMark<T extends MarkType>(type: T, config: MarkConfig<T>): MarkHandle;
};

export function createRenderer(
    canvas: HTMLCanvasElement,
    options?: RendererOptions
): Promise<CompatibilityRenderer>;

export function setDebugResourcesEnabled(enabled: boolean): void;

export function registerScaleDef(
    name: string,
    definition: Omit<ScaleDef, "type"> & { type?: string }
): void;
