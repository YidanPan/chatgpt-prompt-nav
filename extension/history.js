(() => {
  'use strict';
  function context(pathname=location.pathname,search=location.search) {
    const match=pathname.match(/\/(?:g\/([^/]+)\/)?c\/([a-zA-Z0-9_-]{12,100})(?:\/|$)/);
    if(!match)return null;
    const project=match[1]?.match(/^g-p-[a-f0-9]+/i)?.[0]||'';
    const params=new URLSearchParams(search);
    const owner=params.get('owner_user_id')||params.get('conversation_owner_id')||'';
    return {id:match[2],project,owner:/^[a-zA-Z0-9_-]{12,100}$/.test(owner)?owner:'',key:match[2]+'|'+project+'|'+owner};
  }
  function text(message) {
    const c=message.content;
    if(typeof c==='string')return c.trim();
    if(typeof c?.text==='string')return c.text.trim();
    const parts=Array.isArray(c?.parts)?c.parts:[];
    const strings=parts.map(p=>typeof p==='string'?p:((p?.content_type==='text'||p?.type==='input_text')&&typeof p.text==='string'?p.text:'')).filter(Boolean);
    return strings.join('\n').trim()||(typeof c?.transcript==='string'?c.transcript.trim():'')||'图片或附件提问';
  }
  function prompts(records) {
    const out=[],seen=new Set();
    for(const record of records) {
      const m=record?.message||record;
      if(typeof m?.id!=='string'||!m.id||seen.has(m.id)||m.author?.role!=='user')continue;
      if(m.metadata?.is_visually_hidden_from_conversation||m.metadata?.is_user_system_message)continue;
      seen.add(m.id);out.push({id:m.id,text:text(m)});
    }
    return out;
  }
  function legacy(data) {
    if(!data?.mapping||Array.isArray(data.mapping)||typeof data.mapping!=='object')throw new Error('历史格式暂不支持');
    const records=[],seen=new Set();let cursor=data.current_node;
    if(!cursor&&Object.keys(data.mapping).length)throw new Error('无法确认当前对话分支');
    while(cursor) {
      const node=data.mapping[cursor];
      if(!node||seen.has(cursor))throw new Error('历史分支不完整');
      seen.add(cursor);if(node.message)records.push(node.message);cursor=node.parent;
    }
    return prompts(records.reverse());
  }
  function page(data) {
    const container=Array.isArray(data?.messages)?data:data?.conversation;
    const info=container?.page_info||data?.page_info;
    if(!Array.isArray(container?.messages)||typeof info?.has_previous_page!=='boolean')throw new Error('无法确认历史是否加载完整');
    if(info.has_previous_page&&(typeof info.start_cursor!=='string'||!info.start_cursor))throw new Error('缺少历史分页标记');
    for(const record of container.messages) {
      const m=record?.message||record;
      if(typeof m?.id!=='string'||typeof m?.author?.role!=='string')throw new Error('历史消息格式暂不支持');
    }
    return {records:container.messages,before:info.has_previous_page?info.start_cursor:null};
  }
  function merge(base,visible) {
    const result=base.map(p=>({...p}));
    // Insert a freshly sent/edited message next to a known visible neighbour.
    visible.forEach((p,i)=>{
      if(result.some(q=>q.id===p.id))return;
      let at=-1;
      for(let j=i+1;j<visible.length;j++){at=result.findIndex(q=>q.id===visible[j].id);if(at>=0)break;}
      if(at<0){for(let j=i-1;j>=0;j--){at=result.findIndex(q=>q.id===visible[j].id);if(at>=0){at++;break;}}}
      result.splice(at<0?result.length:at,0,{id:p.id,text:p.text});
    });
    return result;
  }
  async function load(ctx,{signal,onPage,fetcher=fetch,bootstrapToken=''}={}) {
    let token=bootstrapToken,refreshed=false,items=[];
    const headers={Accept:'application/json'};
    if(ctx.project)headers['chatgpt-project-id']=ctx.project;
    if(ctx.owner)headers['chatgpt-conv-owner-id']=ctx.owner;
    async function json(url,auth=true) {
      if(!url.startsWith('/')||url.startsWith('//'))throw new Error('只允许读取 ChatGPT 本站');
      const control=new AbortController();
      const abort=()=>control.abort();signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)control.abort();
      const timer=setTimeout(abort,15000);
      try {
        const outgoing={...headers};if(auth&&token)outgoing.Authorization='Bearer '+token;
        const response=await fetcher(url,{method:'GET',credentials:'include',redirect:'error',cache:'no-store',headers:outgoing,signal:control.signal});
        if(!response.ok){const e=new Error('ChatGPT 返回 '+response.status);e.status=response.status;throw e;}
        return await response.json();
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    async function renew() {
      const data=await json('/api/auth/session',false);
      token=typeof data?.accessToken==='string'?data.accessToken:'';refreshed=true;
    }
    async function request(url) {
      try{return await json(url);}
      catch(e){if(e.status!==401||refreshed)throw e;await renew();return json(url);}
    }
    try {
      if(!token)await renew();
      let cursor=null,seenCursors=new Set(),seenIds=new Set(),pages=0;
      while(true) {
        if(signal?.aborted)throw new DOMException('已取消','AbortError');
        const query=new URLSearchParams({num_turns:'100',include_has_versions:'true'});
        if(cursor)query.set('before',cursor);
        const url='/backend-api/conversations/'+encodeURIComponent(ctx.id)+(cursor?'/messages':'')+'?'+query;
        let raw;
        try{raw=await request(url);}
        catch(e){
          if(!pages&&[400,404,405].includes(e.status)) {
            const rawLegacy=await request('/backend-api/conversation/'+encodeURIComponent(ctx.id));
            if(rawLegacy.conversation_id&&rawLegacy.conversation_id!==ctx.id)throw new Error('历史与当前聊天不一致');
            const result=rawLegacy.mapping?legacy(rawLegacy):(()=>{const p=page(rawLegacy);if(p.before)throw new Error('旧版历史尚未完整');return prompts(p.records);})();
            onPage?.(result,true);return result;
          }
          throw e;
        }
        if(raw.conversation_id&&raw.conversation_id!==ctx.id)throw new Error('历史与当前聊天不一致');
        const p=page(raw);
        if(p.before&&(p.before===cursor||seenCursors.has(p.before)))throw new Error('历史分页没有继续前进');
        if(p.before)seenCursors.add(p.before);
        const fresh=p.records.filter(r=>{const m=r.message||r;if(seenIds.has(m.id))return false;seenIds.add(m.id);return true;});
        if(pages&&p.before&&!fresh.length)throw new Error('历史分页没有新消息');
        items=prompts(fresh).concat(items);pages++;
        const owner=raw.owner||raw.conversation?.owner;
        const ownerId=typeof owner==='string'?owner:owner?.id;
        if(ownerId&&!headers['chatgpt-conv-owner-id'])headers['chatgpt-conv-owner-id']=ownerId;
        onPage?.(items,!p.before);
        if(!p.before)return items;
        cursor=p.before;
      }
    } finally {token='';}
  }
  globalThis.PromptHistory={context,text,prompts,legacy,page,merge,load};
})();
