import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('public/vendor/kit', {recursive:true});
await build({entryPoints:['visuals-src/buzzer-demo/BuzzerDemo.jsx'],bundle:true,minify:true,jsx:'automatic',format:'esm',target:['chrome110','safari16.4','firefox115'],outfile:'public/vendor/buzzer-demo.js',legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}});
await writeFile('public/vendor/BUZZER-DEMO-LICENSE.txt', await readFile('visuals-src/stageshow/LICENSE','utf8') + '\n' + await readFile('node_modules/react/LICENSE','utf8') + '\n' + await readFile('node_modules/react-dom/LICENSE','utf8'));
// Separate unchanged kit CSS from authored CSS for the rehearsal inspector.
const css = await readFile('public/vendor/buzzer-demo.css','utf8');
const split = css.indexOf('.buzzer-demo{');
if (split < 0) throw new Error('Demo CSS boundary not found');
await writeFile('public/vendor/kit/stageshow.css', css.slice(0,split));
await writeFile('public/vendor/buzzer-demo.css', css.slice(split));
