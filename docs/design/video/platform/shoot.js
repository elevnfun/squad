const { chromium } = require('playwright');
const base='file:///home/user/squad/docs/design/mockups/';
const pages={
 today:['today.html',{tab1:'.nav .links a:nth-child(1)',tab2:'.nav .links a:nth-child(2)',tab3:'.nav .links a:nth-child(3)',card:'article.card.mode',nums:'.nums',next:'aside.glass'}],
 ranks:['ranks.html',{tab2:'.nav .links a:nth-child(2)',tabs:'.tabs',board:'.board',paid1:'.lrow.paid',you:'.lrow.you'}],
 chat:['chat.html',{tab3:'.nav .links a:nth-child(3)'}],
 blitz:['blitz-pick.html',{picked:'.bp-row.picked',cap:'.cap',head:'.eyebrow'}],
 draft:['draft.html',{packs:'.dp-packs',pack1:'.packcol',board:'.pk-board',prow:'.dp-prow'}],
 win:['winnings.html',{collect:'.btn.btn-gold'}],
};
(async()=>{
 const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1440,height:900}});
 const out={};
 for (const [k,[f,sel]] of Object.entries(pages)){
   await pg.goto(base+f); await pg.waitForTimeout(2500);
   await pg.screenshot({path:`assets/${k}.png`,fullPage:true});
   out[k]={};
   for (const [n,s] of Object.entries(sel)){
     out[k][n]=await pg.evaluate(s=>{const e=[...document.querySelectorAll(s)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height,t:(e.textContent||'').trim().slice(0,40)}},s);
   }
   out[k]._size=await pg.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
 }
 require('fs').writeFileSync('assets/rects.json',JSON.stringify(out,null,1));
 await b.close();
})();
