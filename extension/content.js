(() => {
  'use strict';
  if(document.getElementById('chatgpt-prompt-rail'))return;
  const H=PromptHistory;
  const host=document.createElement('div');host.id='chatgpt-prompt-rail';host.dataset.version='1.3.0';
  const root=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=PromptRailStyles;
  const rail=document.createElement('nav');rail.className='rail';rail.hidden=true;rail.setAttribute('aria-label','当前聊天的提示词导航');
  const preview=document.createElement('div');preview.className='preview';preview.id='prompt-preview';preview.setAttribute('role','tooltip');preview.hidden=true;
  const number=document.createElement('span');number.className='index';
  const text=document.createElement('span');text.className='text';text.tabIndex=0;preview.append(number,text);
  const status=document.createElement('div');status.className='status';status.hidden=true;status.setAttribute('role','status');
  root.append(style,rail,preview,status);document.documentElement.append(host);
  let colorRevision=0;
  function applyColors(raw) {
    const value=PromptColors.normalize(raw);
    for(const name of ['tick','active']) {
      if(value)host.style.setProperty('--'+name,value[name]);else host.style.removeProperty('--'+name);
    }
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[PromptColors.KEY]){colorRevision++;applyColors(changes[PromptColors.KEY].newValue);}
  });
  const initialColorRevision=colorRevision;
  chrome.storage.local.get(PromptColors.KEY).then(data=>{if(colorRevision===initialColorRevision)applyColors(data[PromptColors.KEY]);}).catch(()=>{});
  const darkMedia=matchMedia('(prefers-color-scheme: dark)'),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const userSelector='[data-message-author-role="user"], [data-chatgpt-search-unit-key$=":user"], [data-content-search-unit-key$=":user"], [data-user-message-bubble]';
  let entries=[],visible=[],buttons=[],main=null,currentKey='',ctx=null,source=[],complete=false;
  let requestController=null,loadTimer=0,scanTimer=0,frame=0,poll=0,active=-1;
  let hoveredId=null,hideTimer=0,statusTimer=0,jumpSerial=0,navigating=false,sourceRevision=0;
  let cached=[],initializing=true;
  const positions=new Map(),requestedIds=new Set(),anonymousIds=new WeakMap();

  function mainElement(){return [...document.querySelectorAll('main,[role="main"]')].find(n=>n.getClientRects().length)||null;}
  function scrollParent(node) {
    const preferred=node?.closest('.thread-scroll-container')||[...document.querySelectorAll('.thread-scroll-container')].find(n=>n.clientHeight>0);
    if(preferred)return preferred;
    for(let p=node?.parentElement;p&&p!==document.body;p=p.parentElement) {
      if(/^(auto|scroll|overlay)$/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight+2)return p;
    }
    return document.scrollingElement;
  }
  const scrollTopOf=s=>s===document.scrollingElement?0:s.getBoundingClientRect().top;
  function rendered() {
    main=mainElement();const result=[],seen=new Set();
    if(!main)return result;
    const conversationIds=[...main.querySelectorAll('[data-chatgpt-selection-conversation-id]')].filter(n=>n.getClientRects().length).map(n=>n.dataset.chatgptSelectionConversationId);
    if(ctx&&conversationIds.length&&!conversationIds.includes(ctx.id))return result;
    for(const user of main.querySelectorAll(userSelector)) {
      if(user.closest('pre,code,[hidden]')||!user.getClientRects().length)continue;
      const unit=user.closest('[data-chatgpt-search-unit-key$=":user"],[data-content-search-unit-key$=":user"],[data-message-author-role="user"]')||user;
      const turn=user.closest('[data-turn-key],article,[data-testid^="conversation-turn-"]')||unit;
      const message=unit.getAttribute('data-chatgpt-search-message-ids')?.split(/\s+/)[0]||user.getAttribute('data-message-id')||unit.getAttribute('data-message-id');
      let id=message||turn.getAttribute('data-turn-key');
      if(!id){id=anonymousIds.get(turn);if(!id){id='dom-'+crypto.randomUUID();anonymousIds.set(turn,id);}}
      if(seen.has(id))continue;seen.add(id);
      const bubble=user.matches('[data-user-message-bubble]')?user:unit.querySelector('[data-user-message-bubble]')||user;
      const content=bubble.cloneNode(true);content.querySelectorAll('button,[role="button"],[aria-hidden="true"],svg').forEach(n=>n.remove());
      const prompt=(content.textContent||'').trim()||'图片或附件提问';
      // Quotes, attachments and controls precede the actual prompt inside unit.
      // Align the prompt bubble, not that larger container or the whole turn.
      const node=bubble.getClientRects().length?bubble:unit.getClientRects().length?unit:turn;
      const scroller=scrollParent(node);
      const offset=scroller.scrollTop+node.getBoundingClientRect().top-scrollTopOf(scroller);
      const alias=turn.getAttribute('data-turn-key');
      result.push({id,alias,text:prompt,node,offset});positions.set(id,offset);if(alias)positions.set(alias,offset);
    }
    return result;
  }
  function resolve(entry,list=visible) {
    return list.find(p=>p.id===entry.id||p.alias===entry.id)||list.find(p=>p.id.startsWith('dom-')&&p.text===entry.text&&list.filter(q=>q.text===entry.text).length===1);
  }
  function hidePreview(){clearTimeout(hideTimer);hoveredId=null;preview.hidden=true;buttons.forEach(b=>b.removeAttribute('aria-describedby'));}
  function delayHide(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!preview.matches(':hover')&&!preview.matches(':focus-within'))hidePreview();},220);}
  function previewPosition(button) {
    const b=button.getBoundingClientRect();
    preview.style.left=Math.max(8,Math.min(b.right+10,innerWidth-preview.offsetWidth-8))+'px';
    preview.style.top=Math.max(8,Math.min(b.top-15,innerHeight-preview.offsetHeight-8))+'px';
  }
  function showPreview(id) {
    clearTimeout(hideTimer);const i=entries.findIndex(p=>p.id===id);if(i<0)return;
    const changed=hoveredId!==id;hoveredId=id;
    buttons.forEach(b=>b.removeAttribute('aria-describedby'));buttons[i].setAttribute('aria-describedby',preview.id);
    number.textContent=`第 ${i+1} / ${entries.length} 条提问${complete?'':requestController?' · 正在加载完整历史':' · 暂为已读取部分'}`;
    text.textContent=entries[i].text;if(changed)text.scrollTop=0;
    preview.hidden=false;previewPosition(buttons[i]);
  }
  preview.addEventListener('mouseenter',()=>clearTimeout(hideTimer));preview.addEventListener('mouseleave',delayHide);preview.addEventListener('focusout',delayHide);
  function notify(message,duration=4500) {
    clearTimeout(statusTimer);status.textContent=message;status.hidden=false;
    const r=rail.getBoundingClientRect();status.style.left=Math.max(8,Math.min(r.right+10,innerWidth-310))+'px';status.style.top=Math.max(8,Math.min(r.top,innerHeight-80))+'px';
    if(duration)statusTimer=setTimeout(()=>status.hidden=true,duration);
  }
  function activeButton(index) {
    if(active===index)return;if(buttons[active])buttons[active].removeAttribute('aria-current');active=index;
    if(!buttons[index])return;buttons[index].setAttribute('aria-current','step');
    if(!rail.matches(':hover')&&!root.activeElement) {
      const b=buttons[index].getBoundingClientRect(),r=rail.getBoundingClientRect();if(b.top<r.top||b.bottom>r.bottom)rail.scrollTop+=b.top-r.top-r.height/2;
    }
  }
  function position() {
    if(!main||rail.hidden)return;
    rail.style.setProperty('--row-height',Math.max(4,Math.min(16,(innerHeight-156)/Math.max(1,entries.length)))+'px');
    const rect=main.getBoundingClientRect();rail.style.left=Math.max(1,Math.min(rect.left+5,innerWidth-38))+'px';
    const html=document.documentElement,scheme=getComputedStyle(html).colorScheme;
    const dark=html.classList.contains('dark')||html.dataset.theme==='dark'||scheme==='dark';
    const light=html.classList.contains('light')||html.dataset.theme==='light'||scheme==='light';host.toggleAttribute('data-dark',dark||(!light&&darkMedia.matches));
    if(!navigating&&visible.length) {
      const s=scrollParent(visible[0].node),top=PromptNavigation.targetTop(visible[0].node,s,main)+3;
      let selected=visible[0];for(const p of visible)if(p.node.getBoundingClientRect().top<=top)selected=p;
      let i=entries.findIndex(p=>p.id===selected.id||p.id===selected.alias);
      if(s.scrollHeight>s.clientHeight+2&&s.scrollTop+s.clientHeight>=s.scrollHeight-3)i=entries.length-1;
      activeButton(i);
    }
    if(hoveredId){const i=entries.findIndex(p=>p.id===hoveredId);if(buttons[i])previewPosition(buttons[i]);}
  }
  function onScroll(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;position();schedule();});}
  function render(next) {
    const same=next.length===entries.length&&next.every((p,i)=>p.id===entries[i].id&&p.text===entries[i].text);
    if(same){position();return;}
    const oldFocused=root.activeElement?.dataset?.id,oldHovered=hoveredId;
    entries=next;buttons=[];active=-1;const fragment=document.createDocumentFragment();
    entries.forEach((entry,index)=>{
      const b=document.createElement('button');b.type='button';b.className='tick';b.dataset.id=entry.id;
      b.setAttribute('aria-label',`第 ${index+1} 条提问：${entry.text.slice(0,160)}`);
      b.addEventListener('click',()=>jump(entry.id));b.addEventListener('mouseenter',()=>showPreview(entry.id));b.addEventListener('mouseleave',delayHide);
      b.addEventListener('focus',()=>showPreview(entry.id));b.addEventListener('blur',delayHide);
      b.addEventListener('keydown',event=>{
        let n=index;if(event.key==='ArrowDown')n=Math.min(index+1,buttons.length-1);else if(event.key==='ArrowUp')n=Math.max(index-1,0);else if(event.key==='Home')n=0;else if(event.key==='End')n=buttons.length-1;else if(event.key==='Escape'){hidePreview();return;}else return;
        event.preventDefault();buttons[n].focus();
      });buttons.push(b);fragment.append(b);
    });
    rail.replaceChildren(fragment);rail.hidden=!entries.length;
    if(oldFocused)buttons.find(b=>b.dataset.id===oldFocused)?.focus();
    if(oldHovered&&entries.some(p=>p.id===oldHovered))showPreview(oldHovered);else hidePreview();position();
  }
  function cancelJump(){jumpSerial++;navigating=false;rail.removeAttribute('aria-busy');host.dataset.jump='idle';}
  function exactTarget(entry) {
    const p=resolve(entry,rendered());
    return p?.node.isConnected?{node:p.node,scroller:scrollParent(p.node),main}:null;
  }
  async function jump(id) {
    cancelJump();hidePreview();const serial=jumpSerial,key=currentKey,entry=entries.find(p=>p.id===id);if(!entry)return;
    activeButton(entries.indexOf(entry));visible=rendered();
    const s=scrollParent(visible[0]?.node||main);if(!s)return;
    navigating=true;rail.setAttribute('aria-busy','true');host.dataset.jump='seeking';
    let located=!!exactTarget(entry);
    const slow=setTimeout(()=>{if(serial===jumpSerial&&!located)notify('正在定位这条提问…',0);},900);
    const desired=entries.indexOf(entry);let lo=0,hi=Math.max(0,s.scrollHeight-s.clientHeight),lastHeight=s.scrollHeight;
    let target=positions.get(entry.id)??hi*(desired/Math.max(1,entries.length-1));
    let success=false;
    try {
      for(let attempt=0;attempt<45;attempt++) {
        if(serial!==jumpSerial||key!==currentKey)break;
        if(exactTarget(entry)) {
          located=true;status.hidden=true;host.dataset.jump='aligning';
          success=await PromptNavigation.align({getTarget:()=>exactTarget(entry),cancelled:()=>serial!==jumpSerial||key!==currentKey,onAligned:()=>activeButton(entries.findIndex(p=>p.id===entry.id))});
          break;
        }
        s.scrollTo({top:Math.max(0,Math.min(target,s.scrollHeight-s.clientHeight)),behavior:'instant'});
        await new Promise(r=>setTimeout(r,180));
        if(serial!==jumpSerial||key!==currentKey)break;
        visible=rendered();if(exactTarget(entry))continue;
        const max=Math.max(0,s.scrollHeight-s.clientHeight);
        if(Math.abs(s.scrollHeight-lastHeight)>4){lo=0;hi=max;lastHeight=s.scrollHeight;}
        for(const p of visible) {
          const index=entries.findIndex(e=>e.id===p.id||e.id===p.alias);
          if(index<0)continue;
          if(index<desired)lo=Math.max(lo,Math.min(max,p.offset+1));
          else if(index>desired)hi=Math.min(hi,Math.max(0,p.offset-1));
        }
        if(hi<lo){lo=0;hi=max;}
        target=(hi+lo)/2;
        if(hi-lo<3){target=lo<5?0:Math.min(max,hi+1);}
      }
    } finally {
      clearTimeout(slow);
      if(serial===jumpSerial){navigating=false;rail.removeAttribute('aria-busy');status.hidden=true;host.dataset.jump=success?'aligned':'failed';if(success)activeButton(entries.findIndex(p=>p.id===entry.id));else notify('暂未准确定位这条提问，请稍后再点一次。');}
    }
  }
  document.addEventListener('wheel',e=>{if(!e.composedPath().includes(host))cancelJump();},{capture:true,passive:true});
  document.addEventListener('touchstart',cancelJump,{passive:true});
  document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(host))cancelJump();},true);
  document.addEventListener('keydown',e=>{if(!e.composedPath().includes(host)&&['PageUp','PageDown','Home','End','ArrowUp','ArrowDown','Escape'].includes(e.key))cancelJump();},true);

  function route() {
    const next=H.context(),key=next?.key||location.pathname;
    if(key===currentKey)return false;
    currentKey=key;ctx=next;source=[];cached=[];visible=[];complete=false;sourceRevision++;
    requestController?.abort();requestController=null;clearTimeout(loadTimer);loadTimer=0;
    positions.clear();requestedIds.clear();cancelJump();hidePreview();status.hidden=true;render([]);
    if(ctx)loadTimer=setTimeout(loadHistory,350);
    return true;
  }
  async function loadHistory() {
    loadTimer=0;if(!ctx||requestController)return;
    const control=new AbortController(),key=currentKey,revision=++sourceRevision;requestController=control;
    host.dataset.history='loading';rail.setAttribute('aria-label','提示词导航，正在加载完整历史');
    let bootstrapToken='';
    try {bootstrapToken=JSON.parse(document.getElementById('client-bootstrap')?.textContent||'null')?.session?.accessToken||'';}catch{}
    try {
      await H.load(ctx,{signal:control.signal,bootstrapToken,onPage:(items,done)=>{
        if(control.signal.aborted||key!==currentKey||revision!==sourceRevision)return;
        source=items;complete=done;visible=rendered();render(H.merge(source,visible));
        host.dataset.history=done?'complete':'loading';
      }});
      if(key===currentKey&&!control.signal.aborted){host.dataset.history='complete';rail.setAttribute('aria-label',`全部 ${entries.length} 条提问的导航`);}
    }catch(e){
      if(!control.signal.aborted&&key===currentKey){host.dataset.history='partial';rail.setAttribute('aria-label','已读取提问的导航，完整历史暂时读取失败');notify('完整历史暂未读取成功，当前保留已识别的提问。');}
    }finally{
      bootstrapToken='';if(requestController===control)requestController=null;if(hoveredId)showPreview(hoveredId);
    }
  }
  function refresh() {
    scanTimer=0;route();visible=rendered();
    cached=H.merge(cached,visible);
    if(!complete)render(H.merge(H.merge(source,cached),visible));else render(H.merge(source,visible));
    let fresh=false;for(const p of visible){if(!requestedIds.has(p.id)){requestedIds.add(p.id);if(!source.some(q=>q.id===p.id||q.id===p.alias))fresh=true;}}
    if(fresh&&!initializing&&ctx&&!requestController){clearTimeout(loadTimer);loadTimer=setTimeout(loadHistory,1000);}
    initializing=false;
  }
  function schedule(){if(!scanTimer)scanTimer=setTimeout(refresh,120);}
  const observer=new MutationObserver(schedule);
  const config={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-message-author-role','data-turn-key','data-user-message-bubble','data-chatgpt-search-unit-key','data-content-search-unit-key','data-theme']};
  function start(){observer.observe(document.documentElement,config);clearInterval(poll);poll=setInterval(()=>{if(route())schedule();},500);}
  document.addEventListener('scroll',onScroll,{capture:true,passive:true});rail.addEventListener('scroll',()=>{if(!preview.matches(':hover'))hidePreview();},{passive:true});
  addEventListener('resize',onScroll);addEventListener('popstate',schedule);darkMedia.addEventListener('change',schedule);
  const resizeObserver=new ResizeObserver(onScroll);resizeObserver.observe(document.documentElement);
  addEventListener('pagehide',()=>{observer.disconnect();resizeObserver.disconnect();clearInterval(poll);clearTimeout(scanTimer);scanTimer=0;clearTimeout(loadTimer);loadTimer=0;requestController?.abort();requestController=null;cancelJump();});
  addEventListener('pageshow',e=>{if(e.persisted){start();resizeObserver.observe(document.documentElement);schedule();if(ctx)loadTimer=setTimeout(loadHistory,350);}});
  start();refresh();
})();
