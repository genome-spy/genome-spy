/**
 * Small controller for dialog page state. Rendering and button construction
 * stay in the dialog because they are usually domain-specific.
 */
export default class DialogWizardController {
    /**
     * @param {import("lit").ReactiveControllerHost & { _page: number }} host
     * @param {WizardPage[]} pages
     */
    constructor(host, pages) {
        this.host = host;
        this.pages = pages;
        host.addController(this);
    }

    hostConnected() {}

    hostDisconnected() {}

    get currentPage() {
        const page = this.pages[this.host._page];
        if (!page) {
            throw new Error("Invalid wizard page.");
        }
        return page;
    }

    get isFirstPage() {
        return this.host._page === 0;
    }

    get isLastPage() {
        return this.host._page === this.pages.length - 1;
    }

    reset() {
        this.host._page = 0;
    }

    canAdvance() {
        return this.currentPage.canAdvance?.() ?? true;
    }

    /**
     * @param {-1 | 1} direction
     * @returns {boolean} True when the dialog should stay open.
     */
    advance(direction) {
        if (direction > 0) {
            const shouldContinue = this.currentPage.onAdvance?.() ?? true;
            if (!shouldContinue) {
                return false;
            }
        }

        const newPage = this.host._page + direction;
        if (newPage < 0 || newPage >= this.pages.length) {
            return true;
        }

        this.host._page = newPage;
        return true;
    }
}

/**
 * @typedef {{
 *  render: () => import("lit").TemplateResult<1>,
 *  canAdvance?: () => boolean,
 *  onAdvance?: () => boolean,
 * }} WizardPage
 */
