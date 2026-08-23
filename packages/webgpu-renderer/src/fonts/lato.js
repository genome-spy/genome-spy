import latoRegular from "./Lato-Regular.json" with { type: "json" };
import latoRegularBitmap from "./Lato-Regular.png";
import getMetrics from "./bmFontMetrics.js";
import { registerFont } from "./fontRegistry.js";

registerFont({
    family: "Lato",
    style: "normal",
    weight: 400,
    metrics: getMetrics(latoRegular),
    bitmap: latoRegularBitmap,
    defaultFont: true,
});
