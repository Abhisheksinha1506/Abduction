import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// Small dependency-free packager for these known modules. The output is playable
// directly from disk: all game scripts, artwork, styles and audio are embedded.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['config','collision','sim','render','progression','audio','app'];
let bundle='const __modules = {};\n';
for(const name of names){
  let code=await readFile(path.join(root,'dist',`${name}.js`),'utf8');
  const exports=[...code.matchAll(/export\s+(?:function|class|const|let)\s+(\w+)/g)].map(match=>match[1]);
  code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)\.js['"];?/g,(_,symbols,dependency)=>`const {${symbols}} = __modules[${JSON.stringify(dependency)}];`);
  code=code.replace(/\bexport\s+(?=(?:function|class|const|let)\s)/g,'');
  if(/^import\s/m.test(code))throw new Error(`Unbundled import in ${name}`);
  bundle+=`\n__modules[${JSON.stringify(name)}] = (() => {\n${code}\nreturn {${exports.join(',')}};\n})();\n`;
}
new vm.Script(bundle,{filename:'standalone-game.js'});
// The font URL itself contains semicolons. Remove its entire import line,
// otherwise a partial URL corrupts the first CSS rule and all theme variables.
const css=(await readFile(path.join(root,'dist','styles.css'),'utf8')).replace(/^@import[^\r\n]*\r?\n/,'');
let html=await readFile(path.join(root,'dist','index.html'),'utf8');
// A replacement callback inserts source literally. Replacement strings interpret
// dollar-sign sequences in game messages as substitution commands.
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>${css}</style>`)
  .replace('<script type="module" src="app.js"></script>',()=>`<script>\n${bundle.replace(/<\/script/gi,'<\\/script')}\n</script>`);
const embedded=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!embedded)throw new Error('The standalone script was not embedded.');
new vm.Script(embedded,{filename:'Abduction-Midnight-Harvest.html'});
await mkdir(path.join(root,'release'),{recursive:true});
const output=path.join(root,'release','Abduction-Midnight-Harvest.html');
await writeFile(output,html);
console.log(`Standalone game: ${output}\n${Buffer.byteLength(html).toLocaleString()} bytes; no external runtime assets.`);
