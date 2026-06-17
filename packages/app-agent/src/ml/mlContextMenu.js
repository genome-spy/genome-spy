/**
 * Installs a document-level "contextmenu" capture listener that intercepts
 * right-clicks on the GenomeSpy canvas when a genomic brush is active and
 * at least one SNV is in the brushed region.
 *
 * When those conditions are met the browser context menu is suppressed and a
 * minimal `.gs-context-menu` flyout (styled by the loaded app stylesheet) is
 * shown instead.  Clicking the "Score variants with ML" item opens the
 * MlScoringDialog.
 *
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} options
 * @returns {{ destroy: () => void }} cleanup handle
 */

import { collectBrushVariants } from "./mlVariantCollector.js";
import { showMlScoringDialog } from "./mlScoringDialog.js";

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {{ baseUrl: string; fastaUrl: string }} options
 * @returns {{ destroy: () => void }}
 */
export function installMlContextMenu(agentApi, options) {
    /** @type {HTMLElement | null} */
    let activeMenu = null;

    function _removeMenu() {
        activeMenu?.remove();
        activeMenu = null;
    }

    /**
     * @param {MouseEvent} event
     */
    function _onContextMenu(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.closest("canvas")) return;

        const collection = collectBrushVariants(agentApi);
        if (!collection) return;

        event.preventDefault();
        event.stopPropagation();
        _removeMenu();

        const menu = document.createElement("ul");
        menu.className = "gs-context-menu";
        menu.style.cssText = `
            position: fixed;
            left: ${event.clientX}px;
            top: ${event.clientY}px;
            z-index: 10000;
        `;

        const item = document.createElement("li");
        item.className = "gs-context-menu-item";
        item.textContent = `Score ${collection.uniqueVariants.size} variant${collection.uniqueVariants.size !== 1 ? "s" : ""} with ML…`;
        item.addEventListener("click", () => {
            _removeMenu();
            showMlScoringDialog(agentApi, collection, options);
        });

        menu.appendChild(item);
        document.body.appendChild(menu);
        activeMenu = menu;
    }

    function _onPointerDown() {
        _removeMenu();
    }

    document.addEventListener("contextmenu", _onContextMenu, { capture: true });
    document.addEventListener("pointerdown", _onPointerDown, { capture: true });

    return {
        destroy() {
            document.removeEventListener("contextmenu", _onContextMenu, {
                capture: true,
            });
            document.removeEventListener("pointerdown", _onPointerDown, {
                capture: true,
            });
            _removeMenu();
        },
    };
}
