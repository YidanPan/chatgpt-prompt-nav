const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const extension=path.join(root,'extension');
async function createContext(options={}) {
  const work=path.join(root,'.test-work');fs.mkdirSync(work,{recursive:true});
  const profile=fs.mkdtempSync(path.join(work,'profile-'));
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launchPersistentContext(profile,{
    ...(executablePath?{executablePath}:{channel:'chromium'}),headless:true,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    ...options
  });
}
const artifact=name=>{const dir=path.join(root,'artifacts');fs.mkdirSync(dir,{recursive:true});return path.join(dir,name);};
module.exports={root,extension,createContext,artifact};
