(() => {
  'use strict';
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const locks=new WeakMap();
  function viewport(scroller) {
    if(scroller===document.scrollingElement)return {top:0,bottom:innerHeight};
    const rect=scroller.getBoundingClientRect();
    return {top:rect.top+scroller.clientTop,bottom:Math.min(innerHeight,rect.top+scroller.clientTop+scroller.clientHeight)};
  }
  function targetTop(node,scroller,main) {
    const view=viewport(scroller),bubble=node.getBoundingClientRect();
    let top=Math.max(0,view.top);
    const padding=parseFloat(getComputedStyle(scroller).scrollPaddingTop);
    if(Number.isFinite(padding))top=Math.max(top,view.top+padding);
    for(const header of main?.querySelectorAll('header,[role="banner"],[data-app-shell-titlebar]')||[]) {
      if(!header.getClientRects().length)continue;
      const css=getComputedStyle(header),rect=header.getBoundingClientRect();
      if(!['fixed','sticky'].includes(css.position)||css.visibility==='hidden'||Number(css.opacity)===0)continue;
      if(rect.height<=0||rect.height>innerHeight*.35||rect.top>Math.max(view.top,0)+160)continue;
      if(rect.right<=bubble.left||rect.left>=bubble.right||rect.bottom<=top)continue;
      top=Math.max(top,rect.bottom);
    }
    return Math.min(view.bottom-32,top+12);
  }
  async function align({getTarget,cancelled,onAligned}) {
    const started=performance.now(),styles=new Set();let quietSince=started,aligned=false;
    function prepare(scroller) {
      if(styles.has(scroller))return;
      styles.add(scroller);
      const existing=locks.get(scroller);
      if(existing){existing.count++;return;}
      const original=new Map();
      for(const [name,value] of [['scroll-behavior','auto'],['scroll-snap-type','none'],['overflow-anchor','none']]) {
        original.set(name,[scroller.style.getPropertyValue(name),scroller.style.getPropertyPriority(name)]);
        scroller.style.setProperty(name,value,'important');
      }
      locks.set(scroller,{count:1,original});
    }
    try {
      // Keep checking the message ID after each render. Recycled DOM nodes and
      // lazy-loaded quotations/images can move the target after the first scroll.
      while(performance.now()-started<4500) {
        if(cancelled())return false;
        const target=getTarget();
        if(!target?.node?.isConnected){aligned=false;quietSince=performance.now();await delay(70);continue;}
        const {node,scroller,main}=target;prepare(scroller);
        const wanted=targetTop(node,scroller,main),rect=node.getBoundingClientRect();
        const delta=rect.top-wanted,max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
        const next=Math.max(0,Math.min(max,scroller.scrollTop+delta));
        const canMove=Math.abs(next-scroller.scrollTop)>1;
        if(Math.abs(delta)>1.5&&canMove) {
          quietSince=performance.now();aligned=false;
          if(cancelled())return false;
          scroller.scrollTo({top:next,behavior:'instant'});
        } else {
          // Physical scroll boundaries can prevent an exact top alignment.
          const view=viewport(scroller);
          aligned=Math.abs(delta)<=1.5||(!canMove&&rect.bottom>view.top&&rect.top<view.bottom);
          if(!aligned)quietSince=performance.now();else onAligned?.();
        }
        if(aligned&&performance.now()-started>=2400&&performance.now()-quietSince>=400)return true;
        await delay(70);
      }
      // Do not report success solely because a matching node was found earlier.
      if(cancelled())return false;
      const target=getTarget();if(!target?.node?.isConnected)return false;
      const desired=targetTop(target.node,target.scroller,target.main);
      return Math.abs(target.node.getBoundingClientRect().top-desired)<=2;
    } finally {
      for(const scroller of styles) {
        const lock=locks.get(scroller);if(!lock||--lock.count)continue;
        locks.delete(scroller);
        for(const [name,[value,priority]] of lock.original) {
          if(value)scroller.style.setProperty(name,value,priority);else scroller.style.removeProperty(name);
        }
      }
    }
  }
  globalThis.PromptNavigation={viewport,targetTop,align};
})();
