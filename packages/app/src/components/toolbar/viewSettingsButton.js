import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFileUpload, faSlidersH } from "@fortawesome/free-solid-svg-icons";
import { LitElement, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { ref, createRef } from "lit/directives/ref.js";
import { visitAddressableViews } from "@genome-spy/core/view/viewSelectors.js";
import { subscribeTo } from "../../state/subscribeTo.js";
import { queryDependency } from "../../utils/dependency.js";
import { nestPaths } from "../../utils/nestPaths.js";
import {
    dismissDropdownMenu,
    dropdownMenu,
    isDropdownOpenFor,
} from "../../utils/ui/contextMenu.js";
import createBindingInputs from "@genome-spy/core/utils/inputBinding.js";
import { isVariableParameter } from "@genome-spy/core/paramRuntime/paramUtils.js";
import SubscriptionController from "../generic/subscriptionController.js";
import { MetadataView } from "../../sampleView/metadata/metadataView.js";
import { showUploadMetadataDialog } from "../../sampleView/metadata/uploadMetadataDialog.js";
import { MetadataSourceMenuController } from "../../sampleView/metadata/metadataSourceMenu.js";
import { isVisibilityConfigurable } from "../../configurableVisibilityUtils.js";

class ViewSettingsButton extends LitElement {
    /** @type {import("../../app.js").default} */
    #app;

    /** @type {import("../../utils/nestPaths.js").NestedItem<View>} */
    #nestedPaths;

    /** @type {View | null} */
    #hoveredView = null;

    #buttonRef = createRef();

    #metadataSourceMenuController = new MetadataSourceMenuController();

    /**
     * @typedef {import("@genome-spy/core/view/view.js").default} View
     */
    constructor() {
        super();
        this.subscriptionController = new SubscriptionController(this);
        this.style.display = "none";
    }

    connectedCallback() {
        super.connectedCallback();

        this.dispatchEvent(
            queryDependency(
                "app",
                (/** @type {import("../../app.js").default} */ app) => {
                    this.#app = app;
                }
            )
        );

        this.subscriptionController.addUnsubscribeCallback(
            subscribeTo(
                this.#app.store,
                (state) => state.lifecycle,
                () => this.#handleLifecycle()
            )
        );

        this.subscriptionController.addUnsubscribeCallback(
            subscribeTo(
                this.#app.store,
                (state) => state.viewSettings,
                () => this.requestUpdate()
            )
        );
        this.#handleLifecycle();
    }

    disconnectedCallback() {
        this.#clearMenu();
        super.disconnectedCallback();
    }

    createRenderRoot() {
        return this;
    }

    #handleLifecycle() {
        const { appInitialized } = this.#app.store.getState().lifecycle;
        this.#clearMenu();
        if (appInitialized) {
            this.#updateNestedPaths();
            this.requestUpdate();
            this.style.display = this.#nestedPaths ? "block" : "none";
        }
    }

    #clearMenu() {
        if (isDropdownOpenFor(this.#buttonRef.value)) dismissDropdownMenu();
        if (this.#hoveredView) this.#clearHoverHighlight();
    }

    /**
     * @param {UIEvent} event
     * @param {View} view
     * @param {boolean} radio
     */
    #handleVisibilityClick(event, view, radio) {
        const checked = /** @type {HTMLInputElement} */ (event.target).checked;
        event.stopPropagation();
        if (radio && !checked) return;
        this.#app.viewVisibility.setOverride(
            view,
            radio || checked !== view.isVisibleInSpec() ? checked : undefined
        );

        this.#clearHoverHighlight();
        this.requestUpdate();
        void this.#showDropdown();
    }

    #clearHoverHighlight() {
        this.#hoveredView = null;
        this.#app.genomeSpy.viewRoot.context.highlightView(null);
    }

    #handleResetClick() {
        this.#app.viewVisibility.restoreChoices(undefined);
        // Update checkboxes
        void this.#showDropdown();
    }

    #updateNestedPaths() {
        const viewRoot = this.#app.genomeSpy.viewRoot;
        if (!viewRoot) {
            return;
        }

        /** @type {View[]} */
        const nodes = [];

        visitAddressableViews(viewRoot, (view) => {
            nodes.push(view);
        });

        // Do some flattening to the hierarchy, filter some levels out
        const paths = nodes
            .filter(isIncluded)
            .map((view) =>
                [...view.getDataAncestors()]
                    .filter(
                        (ancestor) =>
                            ancestor === viewRoot || isIncluded(ancestor)
                    )
                    .reverse()
            );

        if (!paths.length) {
            this.#nestedPaths = undefined;
            return;
        }

        this.#nestedPaths = nestPaths(paths);
    }

    #makeToggles() {
        const viewRoot = this.#app.genomeSpy.viewRoot;
        if (!viewRoot || !this.#nestedPaths) return [];

        const { keys, radioGroups } = this.#app.viewVisibility;

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        /**
         * @param { import("../../utils/nestPaths.js").NestedItem<View>} item
         * @param {number} [depth]
         */
        const nestedItemToHtml = (/** */ item, depth = -1) => {
            const view = item.item;
            const checked =
                view.visibilityIsExpression || view.isLocallyVisible();
            const selectorKey = keys.get(view);
            const radioGroup = radioGroups.get(selectorKey);
            const isRadioGroup = Boolean(
                radioGroup && radioGroup.members.length > 1
            );

            /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
            const submenuItems = [];

            if (view !== viewRoot && hasVariableBindings(view)) {
                submenuItems.push(...createParameterSubmenuItems(view, true));
            }

            if (view instanceof MetadataView) {
                if (submenuItems.length) {
                    submenuItems.push({ type: "divider" });
                }
                submenuItems.push(
                    {
                        label: "Sample metadata",
                        type: "header",
                    },
                    { type: "divider" },
                    {
                        label: "Upload custom metadata",
                        icon: faFileUpload,
                        callback: () => this.#showUploadMetadataDialog(),
                    }
                );
            }

            /**
             * @type {(() => import("../../utils/ui/contextMenu.js").MenuItem[] | Promise<import("../../utils/ui/contextMenu.js").MenuItem[]>) | undefined}
             */
            let submenuOpener;

            if (view instanceof MetadataView) {
                const staticSubmenuItems = submenuItems.slice();
                submenuOpener = async () => {
                    const importAction =
                        await this.#metadataSourceMenuController.createImportMenuItem(
                            this.#app.getSampleView(),
                            this.#app.intentPipeline
                        );
                    if (importAction) {
                        return [...staticSubmenuItems, importAction];
                    } else {
                        return staticSubmenuItems;
                    }
                };
            } else if (submenuItems.length) {
                submenuOpener = () => submenuItems;
            }

            if (depth >= 0) {
                const title = view.getTitleText() ?? view.name ?? "";
                const label =
                    !checked && item.children.length > 0
                        ? title + "..."
                        : title;
                const template = view.visibilityIsExpression
                    ? undefined
                    : html` <label
                          class="checkbox"
                          @mouseover=${(/** @type {MouseEvent} */ event) =>
                              this.#handleViewHover(event, view)}
                          @mouseout=${(/** @type {MouseEvent} */ event) =>
                              this.#handleViewHover(event, view)}
                      >
                          <input
                              data-control-key=${`${selectorKey ?? title}:visibility`}
                              style=${`margin-left: ${depth * 1.5}em;`}
                              type=${isRadioGroup ? "radio" : "checkbox"}
                              name=${isRadioGroup ? radioGroup.groupKey : nothing}
                              ?disabled=${
                                  !selectorKey ||
                                  !isVisibilityConfigurable(view)
                              }
                              .checked=${live(checked)}
                              @change=${(/** @type {UIEvent} */ event) =>
                                  this.#handleVisibilityClick(
                                      event,
                                      view,
                                      isRadioGroup
                                  )}
                          />${label}
                      </label>`;

                items.push({
                    label: title,
                    key: selectorKey ?? title,
                    customContent: template,
                    submenu: submenuOpener,
                });
            }

            if (checked) {
                depth++;
                for (const child of item.children) {
                    nestedItemToHtml(child, depth);
                }
            }
        };

        const startDepth =
            this.#nestedPaths.children.length ||
            !this.#nestedPaths.item.explicitName
                ? -1
                : 0;
        nestedItemToHtml(this.#nestedPaths, startDepth);

        return items;
    }

    #showDropdown() {
        this.#updateNestedPaths();
        const viewRoot = this.#app.genomeSpy.viewRoot;
        const visibilityItems = this.#makeToggles();

        /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
        const items = [];

        if (viewRoot && hasVariableBindings(viewRoot)) {
            items.push({
                label: "Parameters",
                submenu: () => createParameterSubmenuItems(viewRoot, false),
            });
        }

        if (visibilityItems.length) {
            if (items.length) {
                items.push({ type: "divider" });
            }

            items.push(
                { label: "View visibility", type: "header" },
                {
                    label: "Restore defaults",
                    callback: this.#app.viewVisibility.hasChoices
                        ? () => this.#handleResetClick()
                        : undefined,
                },
                { type: "divider" },
                ...visibilityItems
            );
        }

        dropdownMenu(
            { items, mode: "controls", label: "View settings" },
            this.#buttonRef.value,
            "bottom-start"
        );
    }

    #handleDropdownClick() {
        if (isDropdownOpenFor(this.#buttonRef.value)) {
            dismissDropdownMenu();
        } else {
            this.#showDropdown();
        }
    }

    render() {
        // TODO: Highlight the button when the dropdown is open.
        return html`
            <div class="dropdown bookmark-dropdown">
                <button
                    ${ref(this.#buttonRef)}
                    class="tool-btn"
                    title="View settings"
                    aria-haspopup="dialog"
                    aria-expanded="false"
                    @click=${this.#handleDropdownClick.bind(this)}
                >
                    ${icon(faSlidersH).node[0]}
                </button>
            </div>
        `;
    }

    /**
     * @param {MouseEvent} event
     * @param {View} view
     */
    #handleViewHover(event, view) {
        if (event.type == "mouseover") {
            this.#hoveredView = view;
            this.#app.genomeSpy.viewRoot.context.highlightView(view);
        } else {
            if (this.#hoveredView === view) {
                this.#hoveredView = null;
            }
            this.#app.genomeSpy.viewRoot.context.highlightView(null);
        }
    }

    #showUploadMetadataDialog() {
        const sampleView = this.#app.getSampleView();
        if (!sampleView) {
            throw new Error("Cannot upload metadata without SampleView");
        } else {
            showUploadMetadataDialog(
                sampleView,
                this.closest(".genome-spy-app")
            );
        }
    }
}

const hasVariableBindings = (/** @type {View} */ view) =>
    [...view.paramRuntime.paramConfigs.values()].some(
        (param) => isVariableParameter(param) && param.bind
    );

/**
 * @param {View} view
 * @param {boolean} includeHeader
 * @returns {import("../../utils/ui/contextMenu.js").MenuItem[]}
 */
const createParameterSubmenuItems = (view, includeHeader) => {
    /** @type {import("../../utils/ui/contextMenu.js").MenuItem[]} */
    const items = [];

    if (includeHeader) {
        items.push(
            { label: "Parameters", type: "header" },
            { type: "divider" }
        );
    }

    items.push({
        customContent: html`<div class="gs-input-binding">
            ${createBindingInputs(view.paramRuntime)}
        </div>`,
    });

    return items;
};

const isIncluded = (/** @type {View} */ view) =>
    (isVisibilityConfigurable(view) && Boolean(view.explicitName)) ||
    hasVariableBindings(view) ||
    view instanceof MetadataView;

customElements.define("genome-spy-view-visibility", ViewSettingsButton);
