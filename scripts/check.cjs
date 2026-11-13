const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(manifest.version,pkg.version);
assert.equal(manifest.manifest_version,3);
assert.ok(!manifest.permissions?.length);
for(const file of manifest.content_scripts.flatMap(s=>s.js)) {
  execFileSync(process.execPath,['--check',path.join(root,'extension',file)],{stdio:'inherit'});
}
for(const file of Object.values(manifest.icons))assert.ok(fs.existsSync(path.join(root,'extension',file)));
console.log('PASS: manifest, version, icons and JavaScript syntax');
