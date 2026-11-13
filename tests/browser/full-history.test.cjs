const {createContext,artifact}=require('./helper.cjs');
const assert=require('node:assert/strict');
const id=n=>'prompt-'+String(n).padStart(4,'0');
const prompts=Array.from({length:30},(_,i)=>({id:id(i),author:{role:'user'},content:{parts:[`第 ${i+1} 次提问：请帮我梳理这部分的学习思路。\n`+(i===2?'这里是一条较长的提示词，用来检查大字号预览以及预览框内的滚动。\n'.repeat(40):'我希望能够一眼看到整段对话的导航，并且直接跳到较早的提问。')]}}));
const html=`<!doctype html><html class="light"><meta charset="utf-8"><style>html,body{margin:0;height:100%;font:15px 'Segoe UI','Microsoft YaHei',sans-serif;background:#fff;color:#292929}body{display:flex}aside{width:64px;flex-shrink:0;background:#f8f8f8;text-align:center;padding-top:24px}main{flex:1;min-width:0;height:100vh}.thread-scroll-container{height:100vh;overflow:auto}#space{position:relative;height:21000px}header{position:fixed;top:0;left:64px;right:0;height:64px;padding:20px 35px;background:#fff;z-index:10}.turn{position:absolute;left:15%;width:70%;height:700px;padding-top:90px;box-sizing:border-box}.user{display:flex;justify-content:flex-end}.bubble{background:#f1f1f1;max-width:80%;padding:15px 22px;border-radius:24px;line-height:1.8;white-space:pre-wrap}.reply{margin-top:40px;line-height:2}</style><aside>◎<br><br>＋</aside><main><header>ChatGPT</header><div class="thread-scroll-container"><div id="space"></div></div></main><script>
const prompts=${JSON.stringify(prompts)};
const scroller=document.querySelector('.thread-scroll-container');
function redraw(){const middle=Math.floor(scroller.scrollTop/700);document.querySelector('#space').replaceChildren();for(let i=Math.max(0,middle-1);i<Math.min(30,middle+3);i++){const t=document.createElement('div');t.className='turn';t.dataset.turnKey=prompts[i].id;t.style.top=(i*700)+'px';const u=document.createElement('div');u.className='user';u.dataset.chatgptSearchUnitKey='fallback-turn-'+i+':0:user';u.dataset.chatgptSearchMessageIds=prompts[i].id;const b=document.createElement('div');b.className='bubble';b.dataset.userMessageBubble='true';b.textContent='第 '+(i+1)+' 次提问：请帮我梳理这部分的学习思路。';u.append(b);t.append(u);const a=document.createElement('div');a.className='reply';a.textContent='这是一段模拟长对话的回复。这个页面只渲染附近几条消息，但左侧导航应当显示全部 30 条提问。';t.append(a);document.querySelector('#space').append(t);}}
scroller.addEventListener('scroll',redraw);scroller.scrollTop=19600;redraw();
</script></html>`;
(async()=>{
const context=await createContext({viewport:{width:1320,height:950},reducedMotion:'reduce'});let debugPage;
try {
 const page=await context.newPage(),errors=[],calls=[];debugPage=page;page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://chatgpt.com/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/auth/session'){calls.push(u.pathname);return route.fulfill({json:{accessToken:'test-only'}});}
  if(u.pathname.startsWith('/backend-api/')) {
   calls.push(u.pathname+u.search);assert.equal(route.request().method(),'GET');assert.equal(route.request().headers().authorization,'Bearer test-only');
   const before=u.searchParams.get('before'),start=before==='10'?0:before==='20'?10:20;
   return route.fulfill({json:{messages:prompts.slice(start,start+10),page_info:{has_previous_page:start>0,start_cursor:String(start)}}});
  }
  return route.fulfill({contentType:'text/html',body:html});
 });
 await page.goto('https://chatgpt.com/g/g-p-123abc-project/c/1234567890123456');
 const host=page.locator('#chatgpt-prompt-rail'),ticks=host.locator('.tick');
 await page.waitForFunction(()=>document.querySelector('#chatgpt-prompt-rail')?.dataset.history==='complete');
 assert.equal(await ticks.count(),30);assert.equal(calls.length,4);
 assert.ok(await page.locator('[data-turn-key]').count()<8);
 assert.equal(await page.locator('.thread-scroll-container').evaluate(n=>n.scrollTop),19600);
 console.log('PASS: all 30 prompts fetched across 3 pages without scrolling the conversation');
 await ticks.nth(2).hover();assert.equal(await host.locator('.preview').evaluate(n=>getComputedStyle(n).fontSize),'18px');assert.equal(await host.locator('.preview').evaluate(n=>n.offsetWidth),520);
 assert.equal(await host.locator('.text').textContent(),prompts[2].content.parts[0].trim());
 await page.screenshot({path:artifact('preview.png')});
 await host.locator('.text').hover();await page.waitForTimeout(350);assert.equal(await host.locator('.preview').isVisible(),true);
 await host.locator('.text').evaluate(n=>n.scrollTop=180);assert.ok(await host.locator('.text').evaluate(n=>n.scrollTop)>0);
 // Prompt 3 is absent from the DOM until the plugin seeks its virtual position.
 assert.equal(await page.locator('[data-turn-key="prompt-0002"]').count(),0);
 await ticks.nth(2).click();
 await page.waitForFunction(()=>{const u=document.querySelector('[data-turn-key="prompt-0002"] .bubble');return u&&Math.abs(u.getBoundingClientRect().top-document.querySelector('header').getBoundingClientRect().bottom-12)<4;},{},{timeout:15000});
 assert.equal(await ticks.count(),30);console.log('PASS: click seeks an initially unmounted old prompt and keeps all 30 ticks');
 await ticks.nth(25).click();await page.waitForFunction(()=>{const u=document.querySelector('[data-turn-key="prompt-0025"] .bubble');return u&&Math.abs(u.getBoundingClientRect().top-document.querySelector('header').getBoundingClientRect().bottom-12)<4;},{},{timeout:15000});
 assert.equal(await ticks.count(),30);assert.equal(calls.length,4);
 // Switching chats while a response is outstanding must not leak old entries.
 await page.evaluate(()=>{document.querySelector('.thread-scroll-container').removeEventListener('scroll',window.redraw);history.pushState({},'', '/');document.querySelector('#space').remove();});
 await host.locator('.rail').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: forward/back virtual jumps, large scrollable hover preview, stable index and route cleanup');
}catch(e){console.log(await debugPage.evaluate(()=>({jump:document.querySelector('#chatgpt-prompt-rail')?.dataset.jump,status:document.querySelector('#chatgpt-prompt-rail')?.shadowRoot.querySelector('.status')?.textContent,scroll:document.querySelector('.thread-scroll-container')?.scrollTop,header:document.querySelector('header')?.getBoundingClientRect().toJSON(),turns:[...document.querySelectorAll('[data-turn-key]')].map(n=>({id:n.dataset.turnKey,top:n.querySelector('.bubble').getBoundingClientRect().top}))})));throw e;}finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
