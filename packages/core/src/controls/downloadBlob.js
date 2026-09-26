/**
 * @param {Document} doc
 * @param {Blob} blob
 * @param {string} filename
 */
export default function downloadBlob(doc, blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    doc.body.append(link);
    try {
        link.click();
    } finally {
        link.remove();
        // Keep the URL alive until the browser has started the download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
