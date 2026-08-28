import Mark from "../../marks/mark.js";
import {
    ClipOptions,
    GlobalRenderingOptions,
    RenderingOptions,
} from "../../types/rendering.js";

export type WebGLMarkRenderingOptions = RenderingOptions &
    GlobalRenderingOptions & {
        skipViewportSetup?: boolean;
    };

export interface WebGLMarkDebugState {
    markUniformsAltered: boolean;
    vertexCount?: number;
    allocatedVertices?: number;
    rangeCount: number;
}

export interface WebGLMark {
    mark: Mark;
    initializeGraphics(): void;
    finalizeGraphicsInitialization(): void;
    updateGraphicsData(): void;
    deleteGraphicsData(): void;
    dispose(): void;
    isReady(): boolean;
    getDebugState(): WebGLMarkDebugState;
    prepareRender(options: WebGLMarkRenderingOptions): Array<() => void>;
    render(options: WebGLMarkRenderingOptions): (() => void) | undefined;
    setViewport(
        canvasSize: { width: number; height: number },
        dpr: number,
        coords: import("../../view/layout/rectangle.js").default,
        clip?: ClipOptions,
        cullClip?: ClipOptions,
        pixelOffset?: number
    ): boolean;
}
