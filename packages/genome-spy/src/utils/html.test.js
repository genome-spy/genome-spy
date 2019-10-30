import * as html from "./html";

test("Escape HTML", () => {
    expect(html.escapeHtml('< "x" & "y" >'))
        .toEqual('&lt; &quot;x&quot; &amp; &quot;y&quot; &gt;');
});

test("Decode HTML", () => {
    expect(html.decodeHtml('&lt; &quot;x&quot; &amp; &quot;y&quot; &gt;'))
        .toEqual('< "x" & "y" >');
})