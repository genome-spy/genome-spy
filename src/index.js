
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

    try {
        if (typeof conf == "string") {
            const url = conf;
            try {
                conf = await fetch(url, { credentials: 'include' })
                    .then(res => {
                        if (res.ok) {
                            return res.json();
                        }
                        throw new Error(`Could not load configuration: ${conf} \nReason: ${res.status} ${res.statusText}`);
                    });
            } catch (e) {
                throw e;
            }

            conf.baseurl = conf.baseurl || url.match(/^.*\//)[0];
        } else {
            conf.baseurl = conf.baseurl || "";
        }

        const app = new GenomeSpyApp(conf);
        app.launch();

    } catch(e) {
        console.log(e);
        alert(e);
    }

}



