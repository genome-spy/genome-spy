import GenomeSpy from "./genomeSpy";
import "./styles/genome-spy-app.scss";
import GenomeIntervalFormat from "./genome/genomeIntervalFormat";

import { icon } from '@fortawesome/fontawesome-svg-core'
import { faUndo } from '@fortawesome/free-solid-svg-icons'


function createAppDom() {
    const body = document.body;
    body.style.margin = 0;
    body.style.padding = 0;

    body.innerHTML = `
<div class="genome-spy-app">
    <nav class="toolbar">
        <div class="title">
            GenomeSpy
        </div>
        <div class="search">
            <input type="text" class="search-input" />
            <div class="search-help"></div>
        </div>
    </nav>

    <div class="genome-spy-container">
    </div>
</div>
`;

    return body.getElementsByClassName("genome-spy-app")[0];
}

const rangeSearchHelp = `<p>Focus to a specific range. Examples:</p>
    <ul>
        <li>chr8:21,445,873-24,623,697</li>
        <li>chr4:166,014,727-chr15:23,731,397</li>
    </ul>`;


/**
 * A simple wrapper for the GenomeSpy component.
 * Eventually this will be replaced or will transform
 * into a React or Vue based application.
 */
export default class GenomeSpyApp {
    /**
     * 
     * @param {Object} config
     */
    constructor(config) {
        // TODO: Have to figure out how the pieces should really be glued together
        const appContainer = createAppDom();

        const elem = className => /** @type {HTMLElement} */(appContainer.getElementsByClassName(className)[0]);

        this.genomeSpy = new GenomeSpy(elem("genome-spy-container"), config);

        this.gif = new GenomeIntervalFormat(this.genomeSpy.genome);

        // TODO: Use WebComponents, for example: https://lit-element.polymer-project.org/

        /** @type {HTMLInputElement} */
        this.toolbar = elem("toolbar");

        /** @type {HTMLInputElement} */
        this.searchInput = elem("search-input");

        /** @type {HTMLElement} */
        this.searchHelp = elem("search-help");

        this.genomeSpy.on("zoom", domain => {
            this.searchInput.value = this.gif.format(domain.intersect(this.genomeSpy.chromMapper.extent()));
        });

        // TODO: Create a component or something for the search field

        this.searchHelp.addEventListener("transitionend", event => {
            if (!this.searchHelp.classList.contains("visible")) {
                this.searchHelp.style.visibility = "hidden";
            }
        });

        this.searchInput.addEventListener("focus", event => {
            // TODO: Remove duplicate helps in case of duplicate tracks
            this.searchHelp.innerHTML = [
                rangeSearchHelp,
                ...this.genomeSpy.tracks.map(t => t.searchHelp())
            ].join("");

            this.searchInput.select();

            this.searchHelp.style.width = this.searchInput.offsetWidth + "px";
            this.searchHelp.style.top = this.toolbar.offsetHeight + "px";

            this.searchHelp.classList.add("visible");
            this.searchHelp.style.visibility = "visible";
        });

        this.searchInput.addEventListener("blur", event => {
            this.searchHelp.classList.remove("visible");
        })

        this.searchInput.addEventListener("keydown", event => {
            if (event.keyCode == 13) {
                event.preventDefault();
                
                this.search(this.searchInput.value)
                    .then(() => {
                        this.searchInput.focus();
                        this.searchInput.select();
                    })
                    .catch(reason => alert(reason));

            } else if (event.keyCode == 27) {
                this.searchInput.setSelectionRange(0, 0);
                this.searchInput.blur();

            } else {
                event.stopPropagation();
            }
            
        });

        // TODO: Implement a centralized shortcut handler
        document.addEventListener("keydown", event => {
            if (event.key == "f") {
                event.preventDefault();
                this.searchInput.focus();
            }
        });

        elem("genome-spy-container").addEventListener("click", event => {
            this.searchInput.blur();
        });


        // The following adds a dependency to specific kinds of tracks.
        // Maybe the tracks should be given means to add buttons to applications...
        const backButton = document.createElement("button");
        backButton.classList.add("tool-btn");
        backButton.classList.add("backtrack-samples");
        backButton.title = "Backtrack samples (⌫)";
        backButton.appendChild(icon(faUndo).node[0]);
        backButton.addEventListener("click",
            () => this.genomeSpy.tracks.filter(track => track.backtrackSamples)[0].backtrackSamples()); // Ugh, hack

        this.toolbar.appendChild(backButton);

    }

    async launch() {
        await this.genomeSpy.launch();

        this.searchInput.value = this.gif.format(this.genomeSpy.getViewportDomain());

    }

    /**
     * Does a search and zooms into a matching interval.
     * Returns a promise that resolves when the search and transition to the
     * matching interval is complete.
     * 
     * @param {string} string the search string
     * @returns A promise
     */
    search(string) {
        // TODO: Consider moving this function to GenomeSpy

        const domainFinder = {
            search: string => this.gif.parse(string)
        };

        // Search tracks
        const interval = [domainFinder].concat(this.genomeSpy.tracks)
            .map(t => t.search(string))
            .find(i => i);

        return new Promise((resolve, reject) => {
            if (interval) {
                this.genomeSpy.zoomTo(interval)
                    .then(() => resolve());

            } else {
                reject(`No matches found for "${string}"`);
            }
        });
    }

}