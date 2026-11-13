globalThis.PromptRailStyles = `
:host { all:initial; --tick:#c8c8c8; --active:#696969; --bg:#fff; --fg:#262626; --border:#e0e0e0; font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif; color-scheme:light; }
:host([data-dark]) { --tick:#575757; --active:#dedede; --bg:#282828; --fg:#ededed; --border:#454545; color-scheme:dark; }
* { box-sizing:border-box; } [hidden] { display:none!important; }
.rail { position:fixed; z-index:2147483000; top:50%; transform:translateY(-50%); width:30px; max-height:calc(100dvh - 144px); overflow:auto hidden; overscroll-behavior:contain; scrollbar-width:none; padding:6px 0; }
.rail::-webkit-scrollbar { display:none; }
.tick { all:unset; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:30px; height:var(--row-height,16px); cursor:pointer; border-radius:3px; }
.tick::after { content:""; width:10px; height:min(3px,calc(var(--row-height,16px) * .38)); background:var(--tick); }
.tick[aria-current="step"]::after,.tick:hover::after,.tick:focus-visible::after { background:var(--active); }
.tick:focus-visible { outline:1px solid var(--active); outline-offset:-2px; }
.preview { position:fixed; z-index:2147483001; width:520px; max-width:calc(100vw - 72px); padding:17px 20px; background:var(--bg); color:var(--fg); border:1px solid var(--border); border-radius:11px; box-shadow:0 6px 30px #00000020; font-size:18px; line-height:1.8; overflow-wrap:anywhere; }
.index { display:block; font-size:12px; opacity:.6; margin-bottom:8px; }
.text { display:block; max-height:min(420px,55dvh); overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; white-space:pre-wrap; }
.status { position:fixed; z-index:2147483001; padding:9px 13px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--fg); font-size:12px; line-height:1.6; max-width:300px; box-shadow:0 3px 12px #0001; }
@media(forced-colors:active) { .tick::after { background:ButtonText; } .tick[aria-current="step"]::after { background:Highlight; } }
`;
