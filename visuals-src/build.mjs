import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
const result = await build({ entryPoints: ['visuals-src/shader-island.jsx'], bundle: true, minify: true, format: 'esm', target: ['chrome110','safari16.4','firefox115'], outfile: 'public/vendor/shader-island.js', legalComments: 'linked', metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
// Include notices for the transitive modules actually bundled, as well as the public API.
const packages = [...new Set(['@shadergradient/react', 'react', 'react-dom', '@react-three/fiber', 'three', 'three-stdlib', 'camera-controls', ...Object.keys(result.metafile.inputs).map(input => input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean)])].sort();
const licenses = [];
for (const name of packages) {
  const base = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${base}/package.json`, 'utf8'));
  let license = '';
  for (const file of ['LICENSE','LICENSE.md','LICENSE.txt','license.txt']) { try { license = await readFile(`${base}/${file}`, 'utf8'); break; } catch {} }
  // ShaderGradient's npm artifact declares MIT but omits the full license; keep authors and grant.
  if (!license && name === '@shadergradient/react') license = 'MIT License\nCopyright (c) ruucm and stone-skipper\n\nPermission is hereby granted' + (await readFile('public/vendor/liquid-glass/LICENSE', 'utf8')).split('Permission is hereby granted')[1];
  licenses.push(`===== ${name}@${pkg.version} (${pkg.license || 'see upstream'}) =====\n${license || 'See linked notices in shader-island.js.LEGAL.txt and the upstream repository.'}`);
}
await writeFile('public/vendor/VISUAL-LICENSES.txt', licenses.join('\n\n'));

const versions = Object.fromEntries(await Promise.all(packages.map(async name => [name, JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version])));
const bundleSHA256 = createHash('sha256').update(await readFile('public/vendor/shader-island.js')).digest('hex');
await writeFile('public/vendor/visual-manifest.json', JSON.stringify({ libraries: versions, liquidGlass: { repository: 'https://github.com/dashersw/liquid-glass-js', commit: '78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a' }, shaderBundleSHA256: bundleSHA256, renderer: 'isolated React island; native app unchanged' }, null, 2) + '\n');
