import * as dialog from "@genome-spy/ui-components/dialog";
import { appDialogOptions } from "./appDialogOptions.js";

export { default } from "@genome-spy/ui-components/dialog";
export * from "@genome-spy/ui-components/dialog";

/** @type {typeof dialog.showDialog} */
export const showDialog = (tagName, configure, options) =>
    dialog.showDialog(tagName, configure, appDialogOptions(options));

/** @type {typeof dialog.showDialogAndMap} */
export const showDialogAndMap = (tagName, configure, map, options) =>
    dialog.showDialogAndMap(tagName, configure, map, appDialogOptions(options));

/** @type {typeof dialog.showDialogOk} */
export const showDialogOk = (tagName, configure, options) =>
    dialog.showDialogOk(tagName, configure, appDialogOptions(options));

/** @type {typeof dialog.showDialogWithElement} */
export const showDialogWithElement = (tagName, configure, options) =>
    dialog.showDialogWithElement(tagName, configure, appDialogOptions(options));
