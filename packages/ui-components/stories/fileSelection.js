/** @param {import("@genome-spy/ui-components/filePicker").FilesChosenEvent} event */
export function showSelectedFiles(event) {
    const picker = /** @type {HTMLElement} */ (event.currentTarget);
    const output = /** @type {HTMLOutputElement} */ (picker.nextElementSibling);
    output.value = Array.from(event.detail.files, (file) => file.name).join(
        ", "
    );
}
