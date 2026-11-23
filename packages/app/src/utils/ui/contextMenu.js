import { createMenuController } from "@genome-spy/ui-components/contextMenu";
import "@genome-spy/ui-components/contextMenu.css";
import {
    FREEZE_INTERACTION_CLASS_NAME,
    SUPPRESS_TOOLTIP_CLASS_NAME,
} from "@genome-spy/core/utils/ui/tooltip.js";

export { DIVIDER } from "@genome-spy/ui-components/contextMenu";

/** @typedef {import("@genome-spy/ui-components/contextMenu").MenuItem} MenuItem */

export const {
    contextMenu,
    dropdownMenu,
    isContextMenuOpen,
    isDropdownOpenFor,
    dismissDropdownMenu,
} = createMenuController({
    onOpen() {
        const { classList } = document.body;
        const classes = [
            SUPPRESS_TOOLTIP_CLASS_NAME,
            FREEZE_INTERACTION_CLASS_NAME,
        ].filter((className) => !classList.contains(className));
        classList.add(...classes);
        return () => classList.remove(...classes);
    },
});
