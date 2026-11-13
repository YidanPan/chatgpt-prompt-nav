(() => {
  'use strict';
  const C=PromptColors,tick=document.getElementById('tick'),active=document.getElementById('active');
  const reset=document.getElementById('reset'),status=document.getElementById('status');
  const media=matchMedia('(prefers-color-scheme:dark)');
  let custom=null,queue=Promise.resolve(),revision=0;
  function render() {
    const colors=custom||C.defaults(media.matches);
    for(const [name,input] of [['tick',tick],['active',active]]) {
      input.value=colors[name];document.getElementById(name+'-value').textContent=colors[name].toUpperCase();
      document.documentElement.style.setProperty('--'+name,colors[name]);
    }
  }
  function save(value) {
    const current=++revision;
    custom=value;render();status.textContent='正在保存…';
    queue=queue.catch(()=>{}).then(async()=>{
      try {
        if(value)await chrome.storage.local.set({[C.KEY]:value});else await chrome.storage.local.remove(C.KEY);
        if(current===revision)status.textContent=value?'已保存':'已恢复默认';
      }catch {if(current===revision)status.textContent='保存失败，请重开此窗口后重试';}
    });
  }
  for(const input of [tick,active])input.addEventListener('input',()=>save(C.normalize({tick:tick.value,active:active.value})));
  reset.addEventListener('click',()=>save(null));
  media.addEventListener('change',()=>{if(!custom)render();});
  chrome.storage.local.get(C.KEY).then(data=>{
    custom=C.normalize(data[C.KEY]);render();status.textContent=custom?'已使用自定义颜色':'默认配色';
    tick.disabled=false;active.disabled=false;reset.disabled=false;
  }).catch(()=>{status.textContent='读取失败，请重开此窗口后重试';});
})();
