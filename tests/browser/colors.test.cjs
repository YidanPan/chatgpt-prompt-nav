const {createContext,artifact}=require('./helper.cjs');
const assert=require('node:assert/strict');
const html=`<!doctype html><html class="light"><meta charset="utf-8"><style>html,body{margin:0;height:100%}main{height:100vh;overflow:auto}article{height:600px;padding:50px}</style><main><article><div data-message-author-role="user" data-message-id="color-test-prompt-1">第一条提问</div></article><article><div data-message-author-role="user" data-message-id="color-test-prompt-2">第二条提问</div></article></main></html>`;
(async()=>{
 const context=await createContext({viewport:{width:1100,height:900}});
 try {
  await context.route('https://chatgpt.com/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/auth/session')return route.fulfill({json:{accessToken:'test-only'}});
   if(url.pathname.startsWith('/backend-api/'))return route.fulfill({json:{messages:[1,2].map(n=>({id:'color-test-prompt-'+n,author:{role:'user'},content:{parts:[n===1?'第一条提问':'第二条提问']}})),page_info:{has_previous_page:false}}});
   return route.fulfill({contentType:'text/html',body:html});
  });
  const page=await context.newPage(),second=await context.newPage(),errors=[];
  for(const p of [page,second]){p.on('pageerror',e=>errors.push(e.message));await p.goto('https://chatgpt.com/c/colors-test-chat-123');await p.locator('#chatgpt-prompt-rail .tick').first().waitFor();}
  const management=await context.newPage();await management.goto('chrome://extensions/');
  const id=await management.locator('extensions-item').filter({hasText:'ChatGPT 提示词导航'}).getAttribute('id');assert.match(id,/^[a-p]{32}$/);
  const popup=await context.newPage();popup.on('pageerror',e=>errors.push(e.message));await popup.goto(`chrome-extension://${id}/popup.html`);
  const color=async(field,value)=>{await popup.locator('#'+field).evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},value);};
  await popup.locator('#tick:not(:disabled)').waitFor();await color('tick','#2378c9');await color('active','#e06030');
  for(const p of [page,second])await p.waitForFunction(()=>document.getElementById('chatgpt-prompt-rail').style.getPropertyValue('--active')==='#e06030');
  const colors=async p=>p.locator('#chatgpt-prompt-rail').evaluate(host=>{const ticks=host.shadowRoot.querySelectorAll('.tick');return [...ticks].map(n=>getComputedStyle(n,'::after').backgroundColor);});
  assert.ok((await colors(page)).includes('rgb(35, 120, 201)'));assert.ok((await colors(page)).includes('rgb(224, 96, 48)'));
  await page.evaluate(()=>document.documentElement.className='dark');await page.waitForTimeout(180);assert.ok((await colors(page)).includes('rgb(35, 120, 201)'));
  await page.reload();await page.locator('#chatgpt-prompt-rail .tick').first().waitFor();await page.waitForFunction(()=>document.getElementById('chatgpt-prompt-rail').style.getPropertyValue('--active')==='#e06030');
  await popup.reload();await popup.locator('#tick:not(:disabled)').waitFor();assert.equal(await popup.locator('#tick').inputValue(),'#2378c9');assert.equal(await popup.locator('#active').inputValue(),'#e06030');
  await popup.setViewportSize({width:320,height:400});await popup.screenshot({path:artifact('color-settings.png')});
  // A pending color update followed by reset must leave the final state default.
  await color('tick','#34aa90');await popup.getByRole('button',{name:'恢复默认'}).click();
  for(const p of [page,second])await p.waitForFunction(()=>!document.getElementById('chatgpt-prompt-rail').style.getPropertyValue('--tick'));
  await page.evaluate(()=>document.documentElement.className='dark');await page.waitForTimeout(180);assert.ok((await colors(page)).includes('rgb(87, 87, 87)'));
  const data=await popup.evaluate(()=>chrome.storage.local.get(null));assert.deepEqual(data,{});
  // CSS values from storage are validated; arbitrary style strings are ignored.
  await popup.evaluate(()=>chrome.storage.local.set({promptRailColors:{tick:'url(https://evil.invalid)',active:'#ff0000'}}));
  await page.waitForTimeout(180);assert.equal(await page.locator('#chatgpt-prompt-rail').evaluate(n=>n.style.getPropertyValue('--tick')),'');
  await popup.getByRole('button',{name:'恢复默认'}).click();assert.deepEqual(errors,[]);
  console.log('PASS: real popup storage, live colors in two tabs, theme override, reload persistence, reset ordering, default theme restoration, invalid CSS rejection, no stored chat data');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
