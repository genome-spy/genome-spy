#!/bin/sh
echo "const css = \`" > genome-spy.css.js
sass genome-spy.scss >> genome-spy.css.js
echo "\`;" >> genome-spy.css.js 
echo "export default css;" >> genome-spy.css.js 

