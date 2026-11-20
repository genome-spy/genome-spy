/**
 * Give App dialogs a themed mount outside the embedded App by default.
 *
 * @template {import("@genome-spy/ui-components/dialog").DialogOptions} T
 * @param {T} [options]
 */
export function appDialogOptions(options) {
    if (options?.mount) {
        return options;
    }

    let mount = /** @type {HTMLElement | null} */ (
        document.body.querySelector(":scope > .gs-app-dialogs")
    );
    if (!mount) {
        mount = document.createElement("div");
        mount.className = "gs-app-dialogs gs-app-theme";
        document.body.append(mount);
    }
    return { ...options, mount };
}
