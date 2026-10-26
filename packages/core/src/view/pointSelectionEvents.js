import {
    createEventPredicate,
    getEventFilterLocation,
} from "../utils/interactionConfig.js";

/**
 * Share point-selection event normalization between marks and legend entries.
 * @param {import("./view.js").default} view
 * @param {import("../spec/parameter.js").PointSelectionConfig} select
 * @param {import("../spec/parameter.js").SelectionConfig | undefined} source
 * @param {(event: import("../utils/interaction.js").default) => void} onSelect
 * @param {(event: import("../utils/interaction.js").default, isHoverExit: boolean) => void} onClear
 */
export function registerPointSelectionEvents(
    view,
    select,
    source,
    onSelect,
    onClear
) {
    const on = /** @type {import("../spec/parameter.js").EventConfig} */ (
        select.on
    );
    const clear =
        /** @type {import("../spec/parameter.js").EventConfig | undefined} */ (
            select.clear
        );
    const matches = createEventPredicate(
        on,
        getEventFilterLocation(view.paramRuntime, source, "on")
    );
    const matchesClear = createEventPredicate(
        clear,
        getEventFilterLocation(view.paramRuntime, source, "clear")
    );
    const hover = ["mouseover", "pointerover"].includes(on.type);

    view.addInteractionListener(hover ? "mousemove" : on.type, (event) => {
        if (matches(event.proxiedMouseEvent)) onSelect(event);
    });
    if (on.type === "wheel" || clear?.type === "wheel") {
        view.addInteractionListener("wheelclaimprobe", (event) => {
            if (
                event.wheelIntent !== "scroll" &&
                ((on.type === "wheel" && matches(event.proxiedMouseEvent)) ||
                    (clear?.type === "wheel" &&
                        matchesClear(event.proxiedMouseEvent)))
            ) {
                event.claimWheel(view, { smooth: false });
            }
        });
    }
    if (hover) {
        view.addInteractionListener("mouseleave", (event) => {
            if (!event.pointedViews.has(view)) onClear(event, true);
        });
    }
    if (clear && !(hover && clear.type === "mouseleave")) {
        view.addInteractionListener(clear.type, (event) => {
            if (matchesClear(event.proxiedMouseEvent)) onClear(event, false);
        });
    }
}
