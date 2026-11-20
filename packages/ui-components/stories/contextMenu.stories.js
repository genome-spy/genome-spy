import { html } from "lit";
import { ref } from "lit/directives/ref.js";
import {
    faArrowDownWideShort,
    faDownload,
    faFileCode,
    faFileCsv,
    faFileImage,
    faImage,
    faList,
    faSortAlphaDown,
    faSortAlphaDownAlt,
    faTableColumns,
} from "@fortawesome/free-solid-svg-icons";
import {
    createMenuController,
    DIVIDER,
} from "@genome-spy/ui-components/contextMenu";
import "@genome-spy/ui-components/contextMenu.css";

export default {
    title: "Components/Context Menu",
    tags: ["autodocs"],
    parameters: {
        docs: {
            description: {
                component:
                    "Import `createMenuController` and `contextMenu.css`. " +
                    "Use one controller for related triggers. Pass a light DOM mount " +
                    "to pick up CSS custom properties from its ancestors. " +
                    "Open commands at a button or a right-click position. " +
                    "The story shows icons, nested submenus, and secondary actions. " +
                    "Use Right Arrow to enter a submenu and Escape to return focus.",
            },
        },
    },
};

export const Commands = {
    render() {
        /** @type {ReturnType<typeof createMenuController>} */
        let menu;
        /** @type {HTMLElement} */
        let mount;

        const setMount = (/** @type {HTMLElement | undefined} */ element) => {
            if (element) {
                mount = element;
                menu = createMenuController({ mount });
            } else {
                menu?.dismissDropdownMenu();
            }
        };

        /**
         * @param {string} label
         * @param {import("@fortawesome/free-solid-svg-icons").IconDefinition} icon
         * @returns {import("@genome-spy/ui-components/contextMenu").MenuItem}
         */
        const action = (label, icon) => ({
            label,
            icon,
            callback: () => {
                mount.querySelector("output").value = `Selected: ${label}`;
            },
        });

        /** @type {import("@genome-spy/ui-components/contextMenu").MenuOptions} */
        const options = {
            mode: "command",
            label: "Dataset actions",
            items: [
                {
                    ...action("Summary", faTableColumns),
                    ellipsisSubmenu: [action("Column details", faList)],
                },
                {
                    label: "Sort samples by name",
                    icon: faArrowDownWideShort,
                    submenu: [
                        action("A to Z", faSortAlphaDown),
                        action("Z to A", faSortAlphaDownAlt),
                    ],
                },
                DIVIDER,
                {
                    label: "Export",
                    icon: faDownload,
                    submenu: [
                        {
                            label: "Image",
                            icon: faImage,
                            submenu: [
                                action("PNG", faFileImage),
                                action("SVG", faFileCode),
                            ],
                        },
                        action("Table as CSV", faFileCsv),
                    ],
                },
            ],
        };

        return html`
            <div
                ${ref(setMount)}
                style="--gs-menu-background: var(--gs-control-background, #f6f6f6)"
            >
                <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded="false"
                    @click=${(/** @type {MouseEvent} */ event) => {
                        const button = /** @type {HTMLElement} */ (
                            event.currentTarget
                        );
                        if (menu.isDropdownOpenFor(button)) {
                            menu.dismissDropdownMenu();
                        } else {
                            menu.dropdownMenu(options, button);
                        }
                    }}
                    @contextmenu=${(/** @type {MouseEvent} */ event) =>
                        menu.contextMenu(options, event)}
                >
                    Dataset actions
                </button>
                <output></output>
            </div>
        `;
    },
};
