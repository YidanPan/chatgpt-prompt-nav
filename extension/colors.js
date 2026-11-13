(() => {
  'use strict';
  const KEY='promptRailColors';
  function normalize(value) {
    if(!value||typeof value!=='object')return null;
    if(!/^#[0-9a-f]{6}$/i.test(value.tick)||!/^#[0-9a-f]{6}$/i.test(value.active))return null;
    return {tick:value.tick.toLowerCase(),active:value.active.toLowerCase()};
  }
  const defaults=dark=>dark?{tick:'#575757',active:'#dedede'}:{tick:'#c8c8c8',active:'#696969'};
  globalThis.PromptColors={KEY,normalize,defaults};
})();
