const { chromium } = require('playwright'); const fs=require('fs');
const FPS=24,T0=17.0,T1=42.0; const starts=[17,18.5,19.25,20,23,26,29,32,35,38];
const n=Math.round((T1-T0)*FPS); const a=+process.argv[2]||0, b=Math.min(n,+process.argv[3]||n);
(async()=>{
 const br=await chromium.launch({args:['--allow-file-access-from-files']}); const pg=await br.newPage({viewport:{width:1280,height:720}});
 await pg.goto('file://'+process.cwd()+'/platform.html'); await pg.waitForFunction(()=>window.READY,null,{timeout:30000});
 await pg.evaluate(()=>document.fonts.ready); await pg.waitForTimeout(1500);
 fs.mkdirSync('pf',{recursive:true});
 for(let k=a;k<b;k++){
  const t=T0+k/FPS; const near=starts.some(s=>t>=s&&t<s+0.45)||(t>=37.4&&t<38.7);
  const N=near?5:1;
  for(let j=0;j<N;j++){
    const tt=t+(N>1?((j/(N-1))-0.5)*0.5/FPS:0);
    await pg.evaluate(x=>setT(x),tt);
    await pg.screenshot({path:`pf/f${String(k).padStart(4,'0')}_${j}.png`});
  }
  fs.writeFileSync(`pf/n${String(k).padStart(4,'0')}`,String(N));
 }
 await br.close(); console.log('rendered',a,b);
})();
