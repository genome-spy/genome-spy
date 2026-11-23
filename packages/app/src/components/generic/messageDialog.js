import "@genome-spy/ui-components/define/messageDialog";
import { showMessageDialog as showSharedMessageDialog } from "@genome-spy/ui-components/messageDialog";
import { appDialogOptions } from "./appDialogOptions.js";

export { default } from "@genome-spy/ui-components/messageDialog";

/** @type {typeof showSharedMessageDialog} */
export const showMessageDialog = (message, options) =>
    showSharedMessageDialog(message, appDialogOptions(options));
