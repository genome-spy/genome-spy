import { html } from "lit";
import { ref } from "lit/directives/ref.js";
import {
    faArrowDownWideShort,
    faDownload,
    faEllipsisV,
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
import "@genome-spy/ui-components/form.css";
import { renderIcon } from "../src/icon.js";
import "./theming.css";
import "./sequenceDesignerMenu.css";
import sequenceDesignerMenuCss from "./sequenceDesignerMenu.css?raw";

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
                    "Commands shows icons, nested submenus, and secondary actions. " +
                    "Use Right Arrow to enter a submenu. Controls uses native form fields with Tab navigation.",
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

export const Controls = {
    parameters: {
        docs: {
            description: {
                story:
                    "Pass a Lit template as an item's `customContent`. Changes apply as you make them. " +
                    "Tab moves from the checkbox to the select, then closes the popup and moves to Reset display settings. " +
                    "Escape closes the popup and returns focus to Display settings.",
            },
        },
    },
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

        const defaults = { showLabels: true, colorBy: "state" };
        const settings = { ...defaults };
        const describeSettings = () =>
            `Sample labels ${settings.showLabels ? "shown" : "hidden"}. Color by ${settings.colorBy}.`;
        const updateStatus = () => {
            mount.querySelector("output").value = describeSettings();
        };

        /** @param {MouseEvent} event */
        const openSettings = (event) => {
            const button = /** @type {HTMLElement} */ (event.currentTarget);
            if (menu.isDropdownOpenFor(button)) {
                menu.dismissDropdownMenu();
                return;
            }

            menu.dropdownMenu(
                {
                    label: "Display settings",
                    mode: "controls",
                    items: [
                        {
                            customContent: html`
                                <label>
                                    <input
                                        type="checkbox"
                                        .checked=${settings.showLabels}
                                        @change=${(
                                            /** @type {Event} */ event
                                        ) => {
                                            const input =
                                                /** @type {HTMLInputElement} */ (
                                                    event.currentTarget
                                                );
                                            settings.showLabels = input.checked;
                                            updateStatus();
                                        }}
                                    />
                                    Show sample labels
                                </label>
                            `,
                        },
                        {
                            customContent: html`
                                <label>
                                    Color by
                                    <select
                                        .value=${settings.colorBy}
                                        @change=${(
                                            /** @type {Event} */ event
                                        ) => {
                                            const select =
                                                /** @type {HTMLSelectElement} */ (
                                                    event.currentTarget
                                                );
                                            settings.colorBy = select.value;
                                            updateStatus();
                                        }}
                                    >
                                        <option value="state">State</option>
                                        <option value="sample">Sample</option>
                                    </select>
                                </label>
                            `,
                        },
                    ],
                },
                button
            );
        };

        return html`
            <div
                ${ref(setMount)}
                style="--gs-menu-background: var(--gs-control-background, #f6f6f6)"
            >
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded="false"
                    @click=${openSettings}
                >
                    Display settings
                </button>
                <button
                    type="button"
                    @click=${() => {
                        Object.assign(settings, defaults);
                        updateStatus();
                    }}
                >
                    Reset display settings
                </button>
                <p><output>${describeSettings()}</output></p>
            </div>
        `;
    },
};

export const SequenceDesigner = {
    parameters: {
        docs: {
            description: {
                story:
                    "The Sequence Designer palette applies to the menu mounted in the same themed container as the trigger. " +
                    "The stylesheet sets the popup border, inset rows, and colors for hover and disabled items.",
            },
        },
    },
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

        /** @param {string} label */
        const action = (label) => ({
            label,
            callback: () => {
                mount.querySelector("output").value = `Selected: ${label}`;
            },
        });

        /** @param {MouseEvent} event */
        const openMenu = (event) => {
            const trigger = /** @type {HTMLElement} */ (event.currentTarget);
            if (menu.isDropdownOpenFor(trigger)) {
                menu.dismissDropdownMenu();
            } else {
                menu.dropdownMenu(
                    {
                        label: "Session actions",
                        mode: "command",
                        items: [
                            action("New session"),
                            { label: "Reset" },
                            action("Replace sequence"),
                            action("Debug"),
                        ],
                    },
                    trigger,
                    "bottom-end"
                );
            }
        };

        return html`
            <div
                ${ref(setMount)}
                class="sequence-designer-menu-theme"
                style="display: flex; align-items: center; justify-content: flex-end; gap: 0.75em; max-width: 20rem"
            >
                <output></output>
                <span class="gs-form">
                    <button
                        type="button"
                        class="sequence-designer-menu-trigger"
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded="false"
                        @click=${openMenu}
                    >
                        ${renderIcon(faEllipsisV)}
                    </button>
                </span>
            </div>
            <details class="theme-code">
                <summary>Sequence Designer theme CSS</summary>
                <pre><code>${sequenceDesignerMenuCss.trim()}</code></pre>
            </details>
        `;
    },
};
