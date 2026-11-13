const {createContext,artifact}=require('./helper.cjs');
const assert=require('node:assert/strict');
const html=`<!doctype html><html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;font:15px sans-serif}main{height:100vh;margin-left:64px}header{position:fixed;left:64px;right:0;top:0;height:112px;background:white;z-index:20}.thread-scroll-container{height:100vh;overflow:auto;scroll-behavior:smooth;scroll-snap-type:y proximity;border-top:3px solid #ddd;box-sizing:border-box}.spacer{height:1100px}#before{height:800px}.turn{padding:40px 80px 500px}.quote{height:170px;background:#eee;margin-bottom:30px}.bubble{margin:18px 0 0 auto;width:260px;background:#def;padding:12px}.tail{height:1500px}
</style><main><header>固定顶部栏</header><div class="thread-scroll-container"><div class="spacer"></div><div id="before"></div><div class="turn" data-turn-key="target-message-123"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="target-message-123"><div class="quote">引用卡片，不是提问开头</div><div class="bubble" data-user-message-bubble="true">真正的提示词开头</div></div><p>回复</p></div><div class="turn" data-turn-key="other-message-123"><div data-chatgpt-search-unit-key="fallback-turn-1:0:user" data-chatgpt-search-message-ids="other-message-123"><div class="quote">第二条引用</div><div class="bubble" data-user-message-bubble="true">另一条提示词</div></div></div><div class="tail"></div></div></main>
<script>document.addEventListener('click',event=>{if(!event.composedPath().some(n=>n?.id==='chatgpt-prompt-rail'))return;if(window.shiftScheduled)return;window.shiftScheduled=true;setTimeout(()=>{document.querySelector('#before').style.height='1300px';document.querySelector('.turn').innerHTML=document.querySelector('.turn').innerHTML;},1100);setTimeout(()=>{document.querySelector('header').style.height='148px';},1650);});</script></html>`;
(async()=>{
const context=await createContext({viewport:{width:1280,height:900}});
try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://chatgpt.com/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session')return route.fulfill({json:{accessToken:'test'}});
  if(u.pathname.startsWith('/backend-api/'))return route.fulfill({json:{messages:[{id:'target-message-123',author:{role:'user'},content:{parts:['真正的提示词开头']}},{id:'other-message-123',author:{role:'user'},content:{parts:['另一条提示词']}}],page_info:{has_previous_page:false}}});
  return route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('https://chatgpt.com/c/alignment-test-123');
 const host=page.locator('#chatgpt-prompt-rail');await page.waitForFunction(()=>document.querySelector('#chatgpt-prompt-rail')?.dataset.history==='complete');
 await host.locator('.tick').first().click();
 await page.waitForFunction(()=>document.querySelector('#chatgpt-prompt-rail')?.dataset.jump==='aligned',{},{timeout:10000});
 const measurement=await page.evaluate(()=>{const b=document.querySelector('.bubble').getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return {actual:b.top,desired:h.bottom+12,replaced:document.querySelector('#before').offsetHeight,header:h.height};});
 assert.equal(measurement.replaced,1300);assert.equal(measurement.header,148);assert.ok(Math.abs(measurement.actual-measurement.desired)<=2,JSON.stringify(measurement));
 const restored=await page.locator('.thread-scroll-container').evaluate(n=>({behavior:n.style.scrollBehavior,snap:n.style.scrollSnapType,anchor:n.style.overflowAnchor}));assert.deepEqual(restored,{behavior:'',snap:'',anchor:''});
 console.log('PASS: quote block excluded, exact bubble aligned within 2px, 500px delayed reflow, DOM replacement, 36px header resize, native smooth/snap styles restored');
 // Rapid clicks must cancel the older alignment and preserve the newest target.
 await host.locator('.tick').first().click();await host.locator('.tick').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('#chatgpt-prompt-rail')?.dataset.jump==='aligned',{},{timeout:10000});
 assert.ok(await page.locator('.bubble').nth(1).evaluate(n=>Math.abs(n.getBoundingClientRect().top-(document.querySelector('header').getBoundingClientRect().bottom+12))<=2));
 assert.equal(await page.locator('.thread-scroll-container').evaluate(n=>n.style.scrollBehavior),'');
 // Manual scrolling must release the alignment lock and stop correcting.
 await host.locator('.tick').first().click();await page.mouse.move(800,550);await page.mouse.wheel(0,350);
 await page.waitForFunction(()=>document.querySelector('#chatgpt-prompt-rail')?.dataset.jump==='idle');
 await page.waitForTimeout(250);const stopped=await page.locator('.thread-scroll-container').evaluate(n=>n.scrollTop);
 await page.waitForTimeout(450);assert.ok(Math.abs(stopped-await page.locator('.thread-scroll-container').evaluate(n=>n.scrollTop))<2);
 assert.deepEqual(errors,[]);console.log('PASS: newest click wins; manual scrolling cancels correction without pulling the page back');
}finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
