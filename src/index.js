
import GenomeSpyApp from "./genomeSpyApp";

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("conf")) {
    initWithConfiguration(urlParams.get("conf"))

} else {
    document.body.innerText = "No configuration defined!";
}

/**
 * @param {object | string} conf configuriation object or url to json configuration
 */
async function initWithConfiguration(conf) {

    if (typeof conf == "string") {
        const url = conf;
        try {
            conf = await fetch(url).then(res => res.json());
        } catch (e) {
            throw e;
        }

        conf.baseurl = conf.baseurl || url.match(/^.*\//)[0];
    } else {
        conf.baseurl = conf.baseurl || "";
    }


    const app = new GenomeSpyApp(conf);
    app.launch();
}



