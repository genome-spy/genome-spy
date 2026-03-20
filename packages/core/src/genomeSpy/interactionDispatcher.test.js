import { describe, expect, it, vi } from "vitest";
import Point from "../view/layout/point.js";
import InteractionDispatcher from "./interactionDispatcher.js";

describe("InteractionDispatcher", () => {
    it("dispatches legacy interaction events through the view root", () => {
        const propagateInteractionEvent = vi.fn((event) => {
            event.target = /** @type {any} */ ({ name: "unit" });
            event.stopPropagation();
            event.claimWheel();
        });

        const dispatcher = new InteractionDispatcher({
            viewRoot: /** @type {any} */ ({ propagateInteractionEvent }),
        });

        const interaction = dispatcher.dispatch(new Point(1, 2), {
            type: "wheelclaimprobe",
        });

        expect(propagateInteractionEvent).toHaveBeenCalledTimes(1);
        expect(interaction.stopped).toBe(true);
        expect(interaction.wheelClaimed).toBe(true);
        expect(interaction.target).toEqual({ name: "unit" });
    });
});
