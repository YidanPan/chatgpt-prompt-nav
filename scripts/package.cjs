const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {version}=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
const output=path.join(root,'dist',`chatgpt-prompt-nav-v${version}.zip`);
fs.mkdirSync(path.dirname(output),{recursive:true});
// Python's standard library creates the same portable archive on Windows/Linux.
const script=`from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root=Path(sys.argv[1])
out=Path(sys.argv[2])
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for p in sorted((root/'extension').rglob('*')):
        if p.is_file(): z.write(p,'chatgpt-prompt-nav/'+p.relative_to(root/'extension').as_posix())
    for name in ['LICENSE','README.md','README.en.md']:
        z.write(root/name,'chatgpt-prompt-nav/'+name)
    for p in sorted((root/'docs').glob('*.png')):
        z.write(p,'chatgpt-prompt-nav/docs/'+p.name)
    for name in ['ACKNOWLEDGMENTS.md','CONTRIBUTING.md']:
        z.write(root/name,'chatgpt-prompt-nav/'+name)
print(out)
`;
try{execFileSync(process.platform==='win32'?'python':'python3',['-c',script,root,output],{stdio:'inherit'});}
catch(error){console.error('Packaging requires Python 3.');process.exitCode=1;}
