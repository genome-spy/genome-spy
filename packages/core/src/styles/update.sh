#!/bin/sh
# Build helper: minify genome-spy.css (strip leading whitespace) and embed into a JS module

CSS_IN=genome-spy.css
JS_OUT=genome-spy.css.js

if [ ! -f "$CSS_IN" ]; then
	echo "Missing $CSS_IN in $(pwd)"
	exit 1
fi


echo "const css = \`" > "$JS_OUT"
sed -E 's/^[[:space:]]+//' "$CSS_IN" >> "$JS_OUT"
echo "\`;" >> "$JS_OUT"
echo "export default css;" >> "$JS_OUT"
