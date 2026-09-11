import { Datum } from "../data/flowNode.js";
import { IntervalSelection } from "./selectionTypes.js";

/** A mark and datum resolved from an internal picking identifier. */
export interface InternalMarkHit {
    mark: import("../marks/mark.js").default;
    datum: Datum;
    uniqueId: number;
}

/** Native canvas input passed through the internal interaction boundary. */
export interface NativeInteractionEvent {
    sourceEvent: Event;
    point: import("../view/layout/point.js").default;
    preventViewDefault: () => void;
}

/** Mark input passed through the internal interaction boundary. */
export interface MarkInteractionEvent {
    sourceEvent: MouseEvent;
    point: import("../view/layout/point.js").default;
    hit: InternalMarkHit;
}

/** Typed interaction methods consumed by the view mutation API. */
export interface InteractionApi {
    subscribeNativeEvent: (
        type: string,
        listener: (event: NativeInteractionEvent) => void
    ) => () => void;
    subscribeMarkEvent: (
        view: import("../view/view.js").default,
        type: string,
        listener: (event: MarkInteractionEvent) => void
    ) => () => void;
    subscribeHover: (
        view: import("../view/view.js").default,
        listener: (hit: InternalMarkHit | undefined) => void
    ) => () => void;
    pick: (
        point: { x: number; y: number },
        scopeView?: import("../view/view.js").default
    ) => Promise<
        | { status: "hit"; hit: InternalMarkHit }
        | { status: "empty" }
        | { status: "invalidated" }
    >;
}

/** Interaction host registered for an interval selection declaration. */
export interface IntervalSelectionControllerApi {
    contains: (point: { x: number; y: number }) => boolean;
    subscribeCommit: (
        listener: (selection: IntervalSelection) => void
    ) => () => void;
    clear: () => void;
}
