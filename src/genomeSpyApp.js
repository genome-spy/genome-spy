import GenomeSpy from "./genomeSpy";
import "./styles/genome-spy-app.scss";
import GenomeIntervalFormat from "./utils/genomeIntervalFormat";


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
        </div>
    </nav>

    <div class="genome-spy-container">
    </div>
</div>
`;

    return body.getElementsByClassName("genome-spy-app")[0];
}



/**
 * A simple wrapper for the GenomeSpy component.
 * Eventually this will be replaced or will transform
 * into a React or Vue based application.
 */
export default class GenomeSpyApp {
    constructor(genome, tracks) {
        // TODO: Have to figure out how the pieces should really be glued together
        const appContainer = createAppDom();

        const elem = className => appContainer.getElementsByClassName(className)[0];

        this.genomeSpy = new GenomeSpy(elem("genome-spy-container"), genome, tracks);

        this.gif = new GenomeIntervalFormat(this.genomeSpy.chromMapper);

        const searchInput = elem("search-input");

        this.genomeSpy.on("zoom", domain => {
            searchInput.value = this.gif.format(domain.intersect(this.genomeSpy.chromMapper.extent()));
        });

        searchInput.addEventListener("keypress", event => {
            if (event.keyCode == 13) {
                event.preventDefault();
                //rangeSearchHelp.style("display", "none");
                this.search(searchInput.value);
            }
        });

        this.genomeSpy.launch();
        
        searchInput.value = this.gif.format(this.genomeSpy.getVisibleInterval());
    }

    search(string) {
        // TODO: Consider moving this function to GenomeSpy

        const domainFinder = {
            search: string => this.gif.parse(string)
        };

		// Search tracks
        const interval = [domainFinder].concat(this.genomeSpy.tracks)
            .map(t => t.search(string))
            .find(i => i);

		if (interval) {
            this.genomeSpy.zoomTo(interval);
			return;
		}

		alert(`No matches found for "${string}"`);
    }

}