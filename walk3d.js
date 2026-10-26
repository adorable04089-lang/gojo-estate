/* GOJO ESTATE — realistic 3D engine (dollhouse + first-person walk)
   Builds a furnished, lit scene from the same plan data the 2D editor uses. */
(function(){
'use strict';
const T=window.THREE;
if(!T){window.Walk3D=null;return}
const BGU=T.BufferGeometryUtils;

/* ───────── utilities ───────── */
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%100000)/100000}}
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const has=(n,...k)=>k.some(x=>n.indexOf(x)>=0);

/* ───────── procedural textures ───────── */
const TX={};
function mk(size){const c=document.createElement('canvas');c.width=c.height=size;return c}
function noiseCanvas(size,cells,seed,lo=0,hi=255){
  const r=rng(seed),t=mk(cells+1);t.width=t.height=cells+1;const g=t.getContext('2d');const id=g.createImageData(cells+1,cells+1);
  const vals=[];for(let y=0;y<cells;y++){vals[y]=[];for(let x=0;x<cells;x++)vals[y][x]=lo+r()*(hi-lo)}
  for(let y=0;y<=cells;y++)for(let x=0;x<=cells;x++){const v=vals[y%cells][x%cells];const i=(y*(cells+1)+x)*4;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255}
  g.putImageData(id,0,0);
  const c=mk(size),cg=c.getContext('2d');cg.imageSmoothingEnabled=true;cg.imageSmoothingQuality='high';
  const cs=size/cells;cg.drawImage(t,0,0,cells+1,cells+1,-cs/2,-cs/2,size+cs,size+cs);return c;
}
function fbm(size,seed,octs=[[4,.5],[8,.25],[16,.15],[32,.1]]){
  const c=mk(size),g=c.getContext('2d');g.fillStyle='#808080';g.fillRect(0,0,size,size);
  octs.forEach(([cells,a],i)=>{g.globalAlpha=a*1.6;g.drawImage(noiseCanvas(size,cells,seed+i*97),0,0)});g.globalAlpha=1;return c;
}
function tex(key,size,draw,o={}){
  if(TX[key])return TX[key];
  const c=mk(size),g=c.getContext('2d');draw(g,size,c);
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;
  if(o.srgb!==false)t.encoding=T.sRGBEncoding;t.needsUpdate=true;TX[key]=t;return t;
}
function speckle(g,s,n,col,a,seed,maxr=1.2){const r=rng(seed);g.fillStyle=col;for(let i=0;i<n;i++){g.globalAlpha=a*r();g.beginPath();g.arc(r()*s,r()*s,r()*maxr+.2,0,7);g.fill()}g.globalAlpha=1}
function grainLines(g,x,y,w,h,col,seed,dens=1){
  const r=rng(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.strokeStyle=col;
  const n=Math.max(4,Math.floor(h/2.2*dens));
  for(let i=0;i<n;i++){g.globalAlpha=.05+r()*.16;g.lineWidth=.6+r()*1.4;const yy=y+r()*h,amp=1+r()*3.5,fr=.004+r()*.01,ph=r()*6;g.beginPath();
    for(let xx=x;xx<=x+w;xx+=6){const v=yy+Math.sin(xx*fr+ph)*amp+Math.sin(xx*fr*3.1+ph*2)*amp*.3;xx===x?g.moveTo(xx,v):g.lineTo(xx,v)}g.stroke()}
  g.globalAlpha=1;g.restore();
}
const TEX={
  planks:(name,base,dark)=>tex(name,1024,(g,s)=>{
    const r=rng(hash(name));const rows=6,ph=s/rows;
    for(let row=0;row<rows;row++){let x=-r()*s*.8;
      while(x<s){const len=s*(.45+r()*.55);const y=row*ph;
        const k=.9+r()*.16;g.fillStyle=`rgb(${base[0]*k|0},${base[1]*k|0},${base[2]*k|0})`;
        const draw=(ox)=>{g.fillRect(x+ox,y,len,ph);grainLines(g,x+ox,y,len,ph,dark,hash(name)+row*31+((x*7)|0))};
        draw(0);if(x+len>s)draw(-s);if(x<0)draw(s);
        g.fillStyle='rgba(0,0,0,.35)';g.fillRect(((x+len)%s+s)%s,y,2,ph);x+=len}
      g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,row*ph,s,2)}
    g.globalAlpha=.18;g.drawImage(fbm(s,hash(name)+5),0,0);g.globalAlpha=1;
  }),
  grain:()=>tex('grain',512,(g,s)=>{g.fillStyle='#e9e4dc';g.fillRect(0,0,s,s);grainLines(g,0,0,s,s,'#7d6a55',11,2.2);g.globalAlpha=.12;g.drawImage(fbm(s,4),0,0);g.globalAlpha=1}),
  fabric:()=>tex('fabric',256,(g,s)=>{g.fillStyle='#e6e6e6';g.fillRect(0,0,s,s);for(let i=0;i<s;i+=2){g.fillStyle=i%4?'rgba(0,0,0,.06)':'rgba(255,255,255,.08)';g.fillRect(i,0,1,s);g.fillRect(0,i,s,1)}g.globalAlpha=.25;g.drawImage(fbm(s,7,[[16,.5],[64,.5]]),0,0);g.globalAlpha=1}),
  boucle:()=>tex('boucle',256,(g,s)=>{g.fillStyle='#ececec';g.fillRect(0,0,s,s);speckle(g,s,2600,'#9a9a9a',.5,3,2.2);speckle(g,s,1400,'#ffffff',.6,9,2)}),
  plaster:()=>tex('plaster',512,(g,s)=>{g.fillStyle='#efefef';g.fillRect(0,0,s,s);g.globalAlpha=.16;g.drawImage(fbm(s,21),0,0);g.globalAlpha=1;speckle(g,s,900,'#bdbdbd',.15,5)}),
  concrete:()=>tex('concrete',512,(g,s)=>{g.fillStyle='#b8b6b2';g.fillRect(0,0,s,s);g.globalAlpha=.35;g.drawImage(fbm(s,33),0,0);g.globalAlpha=1;speckle(g,s,1600,'#6f6d6a',.35,8,1.3);speckle(g,s,600,'#e0dfdc',.4,12,1.1)}),
  snow:()=>tex('snow',512,(g,s)=>{g.fillStyle='#f3f6f9';g.fillRect(0,0,s,s);g.globalAlpha=.12;g.drawImage(fbm(s,41),0,0);g.globalAlpha=1;speckle(g,s,1200,'#c8d4e0',.25,2,1.5)}),
  marble:(name,veinCol,base)=>tex(name,1024,(g,s)=>{
    const n=fbm(256,hash(name)),nd=n.getContext('2d').getImageData(0,0,256,256).data;
    const id=g.createImageData(s,s),d=id.data;
    for(let y=0;y<s;y++)for(let x=0;x<s;x++){const nv=nd[((y>>2)*256+(x>>2))*4]/255;
      const v=Math.sin(2*Math.PI*(x/s*2+y/s)+nv*9);const vein=Math.pow(1-Math.abs(v),18);const v2=Math.pow(1-Math.abs(Math.sin(2*Math.PI*(x/s-y/s*2)+nv*13)),40);
      const k=1-vein*.55-v2*.3-(nv-.5)*.08;const i=(y*s+x)*4;
      d[i]=clamp(base[0]*k+veinCol[0]*(vein+v2)*.3,0,255);d[i+1]=clamp(base[1]*k+veinCol[1]*(vein+v2)*.3,0,255);d[i+2]=clamp(base[2]*k+veinCol[2]*(vein+v2)*.3,0,255);d[i+3]=255}
    g.putImageData(id,0,0);
  }),
  tiles:(name,base,grout,n,jit,src)=>tex(name,512,(g,s)=>{
    const r=rng(hash(name)),c=s/n;if(src){g.drawImage(src.image,0,0,s,s)}else{g.fillStyle=base;g.fillRect(0,0,s,s)}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){g.fillStyle=`rgba(${r()<.5?'255,255,255':'0,0,0'},${r()*jit})`;g.fillRect(x*c,y*c,c,c)}
    g.fillStyle=grout;for(let i=0;i<=n;i++){g.fillRect(i*c-1,0,2.4,s);g.fillRect(0,i*c-1,s,2.4)}
    g.globalAlpha=.1;g.drawImage(fbm(s,hash(name)),0,0);g.globalAlpha=1;
  }),
  mosaic:()=>tex('mosaic',512,(g,s)=>{const r=rng(5),n=16,c=s/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=r();g.fillStyle=`rgb(${60+k*40|0},${140+k*40|0},${165+k*35|0})`;g.fillRect(x*c,y*c,c,c)}g.fillStyle='#dfe9ec';for(let i=0;i<=n;i++){g.fillRect(i*c-1,0,2,s);g.fillRect(0,i*c-1,s,2)}}),
  tatami:(border)=>tex('tatami'+(border?'B':''),512,(g,s)=>{g.fillStyle='#c8bd84';g.fillRect(0,0,s,s);for(let y=0;y<s;y+=3){g.fillStyle=`rgba(${(y/3)%2?'90,80,30':'255,250,200'},.18)`;g.fillRect(0,y,s,1.6)}
    g.globalAlpha=.15;g.drawImage(fbm(s,77,[[8,.5],[32,.5]]),0,0);g.globalAlpha=1;if(border){g.fillStyle='#2a2622';g.fillRect(0,0,s*.06,s);g.fillRect(s*.94,0,s*.06,s);g.fillStyle='#8a7b52';g.fillRect(s*.02,0,2,s);g.fillRect(s*.97,0,2,s)}}),
  pavers:()=>tex('pavers',512,(g,s)=>{const r=rng(9);g.fillStyle='#9c9a95';g.fillRect(0,0,s,s);const n=4,c=s/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const o=y%2?c/2:0,k=.85+r()*.25;g.fillStyle=`rgb(${150*k|0},${148*k|0},${143*k|0})`;g.fillRect(x*c+o+3,y*c+3,c-6,c-6);g.fillRect(x*c+o+3-s,y*c+3,c-6,c-6)}speckle(g,s,1200,'#fff',.5,3,2)}),
  slats:()=>tex('slats',512,(g,s)=>{const n=12,c=s/n;for(let i=0;i<n;i++){g.fillStyle=`rgb(${210+(i%3)*8},${200+(i%3)*6},${188})`;g.fillRect(i*c,0,c,s);grainLines(g,i*c,0,c,s,'#5b4632',i*13,.6);g.fillStyle='rgba(0,0,0,.55)';g.fillRect(i*c+c-5,0,5,s)}}),
  extStone:()=>tex('extStone',512,(g,s)=>{const r=rng(17);g.fillStyle='#55575a';g.fillRect(0,0,s,s);const rows=8,h=s/rows;for(let y=0;y<rows;y++){let x=-r()*80;while(x<s){const w=60+r()*120,k=.8+r()*.35;g.fillStyle=`rgb(${120*k|0},${121*k|0},${124*k|0})`;g.fillRect(x+2,y*h+2,w-4,h-4);if(x+w>s)g.fillRect(x+2-s,y*h+2,w-4,h-4);x+=w}}g.globalAlpha=.25;g.drawImage(fbm(s,3),0,0);g.globalAlpha=1}),
  brushed:()=>tex('brushed',256,(g,s)=>{g.fillStyle='#d0d0d0';g.fillRect(0,0,s,s);const r=rng(2);for(let i=0;i<500;i++){g.fillStyle=`rgba(${r()<.5?0:255},${r()<.5?0:255},${r()<.5?0:255},.05)`;g.fillRect(0,r()*s,s,1)}}),
  rugShag:()=>tex('rugShag',512,(g,s)=>{g.fillStyle='#a9a39c';g.fillRect(0,0,s,s);speckle(g,s,9000,'#ece6dd',.5,4,1.6);speckle(g,s,5000,'#6d6760',.4,6,1.4);g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=7;for(let i=0;i<8;i++){g.beginPath();g.moveTo(0,i*s/8+20);g.bezierCurveTo(s*.3,i*s/8,s*.6,i*s/8+40,s,i*s/8+10);g.stroke()}g.strokeStyle='#8f8981';g.lineWidth=10;g.strokeRect(5,5,s-10,s-10)}),
  rugChevron:()=>tex('rugChevron',512,(g,s)=>{g.fillStyle='#f0ece4';g.fillRect(0,0,s,s);g.fillStyle='#1d1f22';const n=7,h=s/n;for(let i=0;i<n;i++){g.beginPath();for(let x=0;x<=s;x+=64){const y=i*h+((x/64)%2?h*.35:0);x===0?g.moveTo(x,y):g.lineTo(x,y)}for(let x=s;x>=0;x-=64){const y=i*h+((x/64)%2?h*.35:0)+h*.32;g.lineTo(x,y)}g.fill()}speckle(g,s,6000,'#777',.25,8,1.5);g.strokeStyle='#1d1f22';g.lineWidth=14;g.strokeRect(7,7,s-14,s-14)}),
  rugPersian:()=>tex('rugPersian',512,(g,s)=>{g.fillStyle='#d8c7ad';g.fillRect(0,0,s,s);g.strokeStyle='#7d4a3a';g.lineWidth=18;g.strokeRect(14,14,s-28,s-28);g.strokeStyle='#33465e';g.lineWidth=6;g.strokeRect(40,40,s-80,s-80);g.fillStyle='rgba(125,74,58,.55)';g.beginPath();g.ellipse(s/2,s/2,s*.22,s*.15,0,0,7);g.fill();g.fillStyle='rgba(51,70,94,.6)';g.beginPath();g.ellipse(s/2,s/2,s*.1,s*.07,0,0,7);g.fill();speckle(g,s,7000,'#fff8ec',.25,3,1.4);speckle(g,s,4000,'#5a4030',.2,5,1.2)}),
  playMat:()=>tex('playMat',512,(g,s)=>{const cols=['#f2c6b4','#bfe0d0','#f6e3a9','#c9d8f0','#efd2e6','#d9ecc0'];const n=6,c=s/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){g.fillStyle=cols[(x+y*2)%6];g.fillRect(x*c,y*c,c,c);g.fillStyle='rgba(255,255,255,.7)';g.font=`bold ${c*.5}px sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(y*n+x)%36],x*c+c/2,y*c+c/2)}g.strokeStyle='rgba(0,0,0,.08)';for(let i=0;i<=n;i++){g.beginPath();g.moveTo(i*c,0);g.lineTo(i*c,s);g.moveTo(0,i*c);g.lineTo(s,i*c);g.stroke()}}),
  art:(i)=>tex('art'+i,256,(g,s)=>{const r=rng(100+i);const pal=[['#e9e3d6','#2f3a45','#b0835a','#8fa3a8'],['#efe9df','#6b7d6a','#c9a77c','#3b3f45'],['#f1ece4','#7a8fa6','#d6b49c','#2b2f36']][i%3];g.fillStyle=pal[0];g.fillRect(0,0,s,s);for(let k=0;k<14;k++){g.globalAlpha=.25+r()*.5;g.fillStyle=pal[1+(k%3)];g.beginPath();const x=r()*s,y=r()*s;g.ellipse(x,y,10+r()*70,6+r()*40,r()*3,0,7);g.fill()}g.globalAlpha=1}),
  poster:(i)=>tex('poster'+i,512,(g,s)=>{const P=[['#0e1a2a','#ead9b9','#d2693f','WINTER LIGHT','A STORY OF THE LAST TRAIN NORTH'],['#1b1214','#f2e8d8','#86b2cc','THE NORTH STAR','SOME PROMISES OUTLAST THE SNOW'],['#ebe4d6','#1f2b37','#b3443a','SILENT SNOW','SHE READ HIS LETTERS FOR SIXTY WINTERS'],['#132420','#e9e0c8','#d8a24a','LANTERN SEASON','EVERY LIGHT IS SOMEONE COMING HOME'],['#2a1b2e','#f1e3ea','#e48aa2','PAPER CRANES','A THOUSAND WISHES. ONE WINTER.'],['#0b0f14','#dfe6ee','#7fa0c6','THE MOUNTAIN KEEPS','NOTHING STAYS BURIED FOREVER']][i%6];
    g.save();g.scale(1,.65);const H=s/.65;g.fillStyle=P[0];g.fillRect(0,0,s,H);
    const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'rgba(255,255,255,.08)');gr.addColorStop(1,'rgba(0,0,0,.25)');g.fillStyle=gr;g.fillRect(0,0,s,H);
    g.fillStyle=P[2];g.beginPath();g.arc(s*.5,H*.34,s*.2,0,7);g.fill();
    g.fillStyle=P[1];g.globalAlpha=.9;g.beginPath();g.moveTo(0,H*.62);g.lineTo(s*.3,H*.4);g.lineTo(s*.48,H*.52);g.lineTo(s*.7,H*.36);g.lineTo(s,H*.56);g.lineTo(s,H*.7);g.lineTo(0,H*.7);g.fill();g.globalAlpha=1;
    g.fillStyle=P[0];for(let k=0;k<9;k++){const x=s*(.06+k*.11),h=H*(.05+(k%3)*.02);g.beginPath();g.moveTo(x,H*.7-h);g.lineTo(x+s*.035,H*.7);g.lineTo(x-s*.035,H*.7);g.fill()}
    g.fillStyle=P[1];g.textAlign='center';g.font='600 15px Georgia,serif';g.fillText(P[4],s/2,H*.08);
    g.font='bold '+(P[3].length>13?42:52)+'px Georgia,serif';g.fillText(P[3],s/2,H*.8);
    g.font='14px Georgia,serif';g.globalAlpha=.85;g.fillText('A FILM BY  H. AOYAMA',s/2,H*.85);
    g.font='9px Arial,sans-serif';g.globalAlpha=.6;['WRITTEN BY M. KIRISHIMA   MUSIC BY T. SAWA   CINEMATOGRAPHY R. OKADA','PRODUCED BY YUKIMORI PICTURES   EDITED BY S. HAYASHI   DESIGN K. MINE'].forEach((t,k)=>g.fillText(t,s/2,H*(.9+k*.025)));
    g.globalAlpha=.9;g.font='bold 13px Arial,sans-serif';g.fillText('THIS WINTER',s/2,H*.97);g.restore()}),
  scroll:()=>tex('scroll',256,(g,s)=>{g.fillStyle='#e8dcc0';g.fillRect(0,0,s,s);g.fillStyle='#6b5a3a';g.fillRect(0,0,s,s*.08);g.fillRect(0,s*.92,s,s*.08);g.strokeStyle='#1c1814';g.lineCap='round';const r=rng(8);
    for(let k=0;k<3;k++){const cx=s*.5,cy=s*.25+k*s*.22;for(let j=0;j<4;j++){g.lineWidth=4+r()*6;g.beginPath();g.moveTo(cx-30+r()*20,cy-20+r()*12);g.quadraticCurveTo(cx+r()*30-15,cy+r()*20-10,cx+20-r()*30,cy+18+r()*8);g.stroke()}}}),
  cctv:()=>tex('cctv',256,(g,s)=>{g.fillStyle='#0b1117';g.fillRect(0,0,s,s);for(let i=0;i<9;i++){const x=(i%3)*s/3,y=Math.floor(i/3)*s/3;g.fillStyle=`rgb(${60+i*6},${80+i*5},${90+i*4})`;g.fillRect(x+4,y+4,s/3-8,s/3-8);g.globalAlpha=.4;g.drawImage(fbm(64,i+3),x+4,y+4,s/3-8,s/3-8);g.globalAlpha=1;g.fillStyle='#d23';g.fillRect(x+8,y+8,5,5)}}),
  film:()=>tex('film',256,(g,s)=>{const gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'#203450');gr.addColorStop(.6,'#c98a6a');gr.addColorStop(1,'#e9e4dc');g.fillStyle=gr;g.fillRect(0,0,s,s);g.fillStyle='#f4f6f8';g.beginPath();g.moveTo(0,s*.7);g.lineTo(s*.3,s*.35);g.lineTo(s*.5,s*.55);g.lineTo(s*.72,s*.3);g.lineTo(s,s*.62);g.lineTo(s,s);g.lineTo(0,s);g.fill();g.fillStyle='#2b3a33';for(let i=0;i<14;i++){const x=i*s/13,h=20+(i%3)*10;g.beginPath();g.moveTo(x,s*.86-h);g.lineTo(x+9,s*.86);g.lineTo(x-9,s*.86);g.fill()}}),
  mural:()=>tex('mural',512,(g,s)=>{const gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'#0e1b2e');gr.addColorStop(.6,'#3a5878');gr.addColorStop(1,'#cfe0ee');g.fillStyle=gr;g.fillRect(0,0,s,s);const r=rng(7);
    const ridge=(base,amp,col,seed)=>{const q=rng(seed);g.fillStyle=col;g.beginPath();g.moveTo(0,s);let y=base;for(let x=0;x<=s;x+=16){y=base-amp*Math.abs(Math.sin(x/s*Math.PI*(2+seed%3)+seed))-q()*amp*.25;g.lineTo(x,y)}g.lineTo(s,s);g.fill()};
    ridge(s*.55,s*.28,'#e8f1f8',3);ridge(s*.7,s*.16,'#b9cfe0',5);ridge(s*.85,s*.08,'#f4f8fb',8);g.fillStyle='#f6fbff';g.beginPath();g.arc(s*.78,s*.18,s*.05,0,7);g.fill();
    for(let i=0;i<220;i++){g.globalAlpha=.3+r()*.6;g.beginPath();g.arc(r()*s,r()*s*.7,.6+r()*1.6,0,7);g.fill()}g.globalAlpha=1}),
  kidart:()=>tex('kidart',256,(g,s)=>{g.fillStyle='#fbf8f2';g.fillRect(0,0,s,s);const r=rng(21);g.lineCap='round';
    ['#e0533d','#2f6fd6','#f2b632','#3fa45b','#8a4fc2'].forEach((c,k)=>{g.strokeStyle=c;g.lineWidth=5+r()*5;g.beginPath();let x=40+r()*170,y=40+r()*170;g.moveTo(x,y);for(let i=0;i<14;i++){x+= (r()-.5)*90;y+=(r()-.5)*90;x=Math.max(15,Math.min(s-15,x));y=Math.max(15,Math.min(s-15,y));g.lineTo(x,y)}g.stroke()});
    g.fillStyle='#f2b632';g.beginPath();g.arc(205,52,26,0,7);g.fill();g.fillStyle='#2b2b2b';g.font='bold 15px Arial';g.fillText('YUKITO',150,236)}),
  paw:()=>tex('paw',128,(g,s)=>{g.fillStyle='#000';g.fillRect(0,0,s,s);g.fillStyle='#fff';g.beginPath();g.ellipse(64,80,24,20,0,0,7);g.fill();[[34,46],[52,32],[76,32],[94,46]].forEach(([x,y])=>{g.beginPath();g.ellipse(x,y,10,13,0,0,7);g.fill()})},{srgb:false}),
  baby:()=>tex('baby',128,(g,s)=>{g.fillStyle='#000';g.fillRect(0,0,s,s);g.fillStyle='#fff';g.beginPath();g.ellipse(64,78,24,38,0,0,7);g.fill();[[42,30,9],[56,24,8],[69,24,7],[81,29,6],[91,37,5]].forEach(([x,y,r])=>{g.beginPath();g.arc(x,y,r,0,7);g.fill()})},{srgb:false}),
  boot:()=>tex('boot',128,(g,s)=>{g.fillStyle='#000';g.fillRect(0,0,s,s);g.fillStyle='#fff';g.beginPath();g.ellipse(64,44,22,30,0,0,7);g.fill();g.beginPath();g.ellipse(64,96,17,20,0,0,7);g.fill()},{srgb:false}),
  pawMat:()=>tex('pawMat',256,(g,s)=>{g.fillStyle='#5b5248';g.fillRect(0,0,s,s);speckle(g,s,3000,'#8a7f72',.5,4,1.4);g.fillStyle='rgba(240,236,228,.75)';const pr=(x,y,k)=>{g.beginPath();g.ellipse(x,y+8*k,9*k,8*k,0,0,7);g.fill();[[-11,-5],[-4,-11],[4,-11],[11,-5]].forEach(([a,b])=>{g.beginPath();g.ellipse(x+a*k,y+b*k,3.6*k,4.6*k,0,0,7);g.fill()})};[[60,70],[110,150],[170,80],[210,170],[90,210]].forEach(([x,y])=>pr(x,y,1.4));g.strokeStyle='#3d362f';g.lineWidth=10;g.strokeRect(5,5,s-10,s-10)}),
  radial:()=>tex('radial',128,(g,s)=>{const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.55,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s)},{srgb:false}),
  waterN:()=>tex('waterN',256,(g,s)=>{const n=fbm(s,55,[[8,.5],[16,.3],[32,.2]]);g.drawImage(n,0,0);const id=g.getImageData(0,0,s,s),d=id.data,h=new Float32Array(s*s);for(let i=0;i<s*s;i++)h[i]=d[i*4]/255;for(let y=0;y<s;y++)for(let x=0;x<s;x++){const i=y*s+x,dx=h[y*s+(x+1)%s]-h[y*s+(x-1+s)%s],dy=h[((y+1)%s)*s+x]-h[((y-1+s)%s)*s+x];d[i*4]=128+dx*500;d[i*4+1]=128+dy*500;d[i*4+2]=255}g.putImageData(id,0,0)},{srgb:false}),
};

/* ───────── materials ───────── */
const MD={
  oakFloor:{map:()=>TEX.planks('pOak',[196,154,108],'#6b4a2c'),ts:1.6,rough:.52},
  walnutFloor:{map:()=>TEX.planks('pWal',[120,82,58],'#2e1d12'),ts:1.6,rough:.34},
  marbleFloor:{map:()=>TEX.tiles('mTile',null,'rgba(120,120,120,.5)',2,.04,TEX.marble('mBase',[120,120,125],[238,236,232])),ts:1.6,rough:.1},
  marbleTile:{map:()=>TEX.tiles('bTile',null,'rgba(150,150,150,.6)',4,.05,TEX.marble('mBase2',[150,150,155],[232,230,226])),ts:1.2,rough:.18},
  stoneTile:{map:()=>TEX.tiles('sTile','#cfccc6','rgba(110,105,100,.7)',4,.08),ts:1.6,rough:.5},
  darkTile:{map:()=>TEX.tiles('dTile','#585b5f','rgba(30,30,30,.8)',3,.08),ts:1.8,rough:.4},
  concrete:{map:()=>TEX.concrete(),ts:4,rough:.75},
  tatamiFloor:{map:()=>TEX.tatami(true),ts:[0.9,1.8],rough:.9},
  snow:{map:()=>TEX.snow(),ts:6,rough:.95},
  deck:{map:()=>TEX.pavers(),ts:2.4,rough:.8},
  poolTile:{map:()=>TEX.mosaic(),ts:.8,rough:.2},
  plasterWarm:{map:()=>TEX.plaster(),ts:2.5,color:0xf2e9db,rough:.92},
  plasterCool:{map:()=>TEX.plaster(),ts:2.5,color:0xe4e6e8,rough:.92},
  plasterStone:{map:()=>TEX.plaster(),ts:2.5,color:0xcfccc4,rough:.9},
  woodPanel:{map:()=>TEX.slats(),ts:1.4,color:0x8c6a4c,rough:.6},
  marbleWall:{map:()=>TEX.marble('mBase2',[150,150,155],[232,230,226]),ts:2.4,rough:.2},
  tileWall:{map:()=>TEX.mosaic(),ts:.8,rough:.25},
  extStone:{map:()=>TEX.extStone(),ts:3.4,color:0x8a8b8f,rough:.85},
  ceiling:{color:0xf7f3ec,rough:.95,emissive:0xfff1de,ei:.035,keepShadow:1},
  trimWhite:{color:0xf6f3ec,rough:.45},
  oak:{map:()=>TEX.grain(),ts:1.2,color:0xd9ac7c,rough:.55},
  walnut:{map:()=>TEX.grain(),ts:1.2,color:0x7a5038,rough:.5},
  darkwood:{map:()=>TEX.grain(),ts:1.2,color:0x3e2c21,rough:.45},
  lacquer:{color:0xf3f0ea,rough:.28},
  blackMetal:{color:0x1d2023,rough:.42,metal:.7},
  brass:{color:0xc9a063,rough:.28,metal:1},
  chrome:{color:0xe3e6e9,rough:.1,metal:1},
  steel:{map:()=>TEX.brushed(),ts:.6,color:0xb7bcc1,rough:.32,metal:.9},
  linen:{map:()=>TEX.fabric(),ts:.35,color:0xd9cdbd,rough:.95},
  cream:{map:()=>TEX.fabric(),ts:.35,color:0xefe8db,rough:.95},
  boucle:{map:()=>TEX.boucle(),ts:.25,color:0xf3eee4,rough:1},
  charcoal:{map:()=>TEX.fabric(),ts:.35,color:0x3d4146,rough:.95},
  blush:{map:()=>TEX.fabric(),ts:.35,color:0xdcbcae,rough:.95},
  sage:{map:()=>TEX.fabric(),ts:.35,color:0xa8b79f,rough:.95},
  navy:{map:()=>TEX.fabric(),ts:.35,color:0x34405a,rough:.95},
  rust:{map:()=>TEX.fabric(),ts:.35,color:0xb06a43,rough:.95},
  sheet:{map:()=>TEX.fabric(),ts:.35,color:0xf8f6f1,rough:.9},
  leather:{color:0x6d4934,rough:.48},
  ceramic:{color:0xf8f8f6,rough:.1},
  blackCeramic:{color:0x26292c,rough:.25},
  marble:{map:()=>TEX.marble('mBase',[120,120,125],[238,236,232]),ts:1.8,rough:.12},
  stone:{map:()=>TEX.concrete(),ts:1.5,color:0xb3b1ab,rough:.85},
  glass:{color:0xd6e9ef,rough:.02,metal:.15,opacity:.16,env:1.6},
  darkGlass:{color:0x111418,rough:.06,metal:.6},
  screen:{color:0x060708,rough:.06,metal:.4},
  leaf:{color:0x3e6b44,rough:.55,double:1},
  leaf2:{color:0x597f45,rough:.6,double:1},
  pine:{color:0x22392c,rough:.9},
  bark:{color:0x4a3628,rough:.95},
  pot:{color:0x2c2826,rough:.45},
  terracotta:{color:0xb36c4a,rough:.8},
  snowCap:{color:0xf2f6f9,rough:.9},
  shade:{color:0xf6ead6,emissive:0xffd8a8,ei:.55,rough:.85},
  bulb:{color:0xffffff,emissive:0xffd49a,ei:4},
  downlight:{color:0xffffff,emissive:0xfff0d6,ei:5},
  cove:{color:0xffffff,emissive:0xffcf8f,ei:2.6},
  fire:{color:0xff9a3c,emissive:0xff6a10,ei:4},
  ledG:{color:0x0a0a0a,emissive:0x3dff8a,ei:2.5},
  ledR:{color:0x0a0a0a,emissive:0xff4040,ei:2.5},
  taillight:{color:0x400000,emissive:0xff2020,ei:1.2},
  headlight:{color:0xffffff,emissive:0xfff4dd,ei:1.4},
  rubber:{color:0x141414,rough:.9},
  carPaint:{color:0x14171b,rough:.22,metal:.6},
  carPaint2:{color:0xe9e7e2,rough:.25,metal:.4},
  rope:{map:()=>TEX.fabric(),ts:.1,color:0xc9a77d,rough:1},
  water:{color:0x2aa3c8,rough:.04,metal:.1,opacity:.9,normal:1,emissive:0x0d5f80,ei:.7},poolLight:{color:0x7fe0ff,emissive:0x5fd4ff,ei:1.2},carPaint3:{color:0x5e1219,rough:.22,metal:.6},carPaint4:{color:0x1b2942,rough:.22,metal:.6},celadon:{color:0x9fb8a6,rough:.2},lacquerRed:{color:0x5a1616,rough:.35},
  rugShag:{map:()=>TEX.rugShag(),keep:1,rough:1},
  rugChevron:{map:()=>TEX.rugChevron(),keep:1,rough:1},
  rugPersian:{map:()=>TEX.rugPersian(),keep:1,rough:1},
  playMat:{map:()=>TEX.playMat(),keep:1,rough:.8},
  tatamiMat:{map:()=>TEX.tatami(true),keep:1,rough:.9},
  art0:{map:()=>TEX.art(0),keep:1,rough:.8},art1:{map:()=>TEX.art(1),keep:1,rough:.8},art2:{map:()=>TEX.art(2),keep:1,rough:.8},
  bookA:{color:0x7b4a3a,rough:.8},bookB:{color:0x2f4a5f,rough:.8},bookC:{color:0xd9cbb2,rough:.8},bookD:{color:0x4f5d47,rough:.8},bookE:{color:0xa7864f,rough:.8},bookF:{color:0x262a30,rough:.8},
  toyA:{color:0xf0a993,rough:.6},toyB:{color:0x9fd0bd,rough:.6},toyC:{color:0xf5d77f,rough:.6},toyD:{color:0x9db8e6,rough:.6},
  contact:{special:'contact'},
  cardboard:{color:0xc49a6c,rough:.9},tape:{color:0xd8c9a8,rough:.6},winGlow:{color:0xffd9a8,emissive:0xffb15e,ei:1.7,rough:.4},winDim:{color:0x1d2530,emissive:0x0a1018,ei:.25,rough:.12,metal:.4},
  roofDark:{color:0x2a2c30,rough:.7},roofTile:{map:()=>TEX.tiles('rTile','#3a3c40','rgba(10,10,12,.8)',8,.1),ts:1.2,color:0x8a8c90,rough:.65},gold:{color:0xc9a86a,rough:.35,metal:.6},
  crystal:{color:0xffffff,emissive:0xfff2dc,ei:.7,rough:.05,metal:.2},red:{color:0xb3202a,rough:.5},carrot:{color:0xe0782a,rough:.6},scarf:{color:0xa8322e,rough:.9},yellow:{color:0xf2cc3a,rough:.4},
  bottle:{color:0x1d3324,rough:.15,metal:.2},mirror:{color:0xdfe6ea,rough:.04,metal:1},filmScreen:{special:'film'},cctvScreen:{special:'cctv'},
  paw:{special:'paw'},boot:{special:'boot'},baby:{special:'baby'},pawMat:{map:()=>TEX.pawMat(),keep:1,rough:1},scrollTex:{map:()=>TEX.scroll(),keep:1,rough:.9},
  poster0:{map:()=>TEX.poster(0),keep:1,rough:.5},poster1:{map:()=>TEX.poster(1),keep:1,rough:.5},poster2:{map:()=>TEX.poster(2),keep:1,rough:.5},poster3:{map:()=>TEX.poster(3),keep:1,rough:.5},poster4:{map:()=>TEX.poster(4),keep:1,rough:.5},poster5:{map:()=>TEX.poster(5),keep:1,rough:.5},kidart:{map:()=>TEX.kidart(),keep:1,rough:.8},mural:{map:()=>TEX.mural(),keep:1,rough:.6,emissive:0x2c3e52,ei:.8},tracks:{special:'tracks'},knit:{map:()=>TEX.fabric(),ts:.12,color:0xa9563f,rough:1},globeMap:{color:0x3f5f6e,rough:.5},leatherDark:{color:0x3a2418,rough:.42},ice:{color:0xdff4ff,rough:.05,metal:.1,opacity:.5,emissive:0x6fbfff,ei:.25},coolLed:{color:0xffffff,emissive:0x9fd8ff,ei:2.2},stoneDark:{map:()=>TEX.concrete(),ts:1,color:0x6d7176,rough:.6},
  foamA:{color:0xf2c4b4,rough:.8},foamB:{color:0xbfdccb,rough:.8},foamC:{color:0xf4e0a6,rough:.8},foamD:{color:0xc5d5ef,rough:.8},leopard:{color:0xeceae6,rough:.95},spot:{color:0x55504a,rough:.9}
};
const MAT={};
function mat(key){
  if(MAT[key])return MAT[key];const d=MD[key]||MD.lacquer;let m;
  if(d.special==='contact'){m=new T.MeshBasicMaterial({color:0x000000,alphaMap:TEX.radial(),transparent:true,opacity:.42,depthWrite:false});m.userData={keep:1,noShadow:1};MAT[key]=m;return m}
  if(d.special==='tracks'){m=new T.MeshBasicMaterial({color:0x241a12,transparent:true,opacity:.5,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});m.userData={keep:1,noShadow:1};MAT[key]=m;return m}
  if(d.special==='paw'||d.special==='boot'||d.special==='baby'){m=new T.MeshBasicMaterial({color:d.special==='baby'?0x55606e:0x6d7888,alphaMap:d.special==='paw'?TEX.paw():d.special==='baby'?TEX.baby():TEX.boot(),transparent:true,opacity:d.special==='baby'?.62:.5,depthWrite:false});m.userData={keep:1,noShadow:1};MAT[key]=m;return m}
  if(d.special==='film'||d.special==='cctv'){const t=d.special==='film'?TEX.film():TEX.cctv();m=new T.MeshStandardMaterial({color:0x111111,map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:d.special==='film'?.9:.7,roughness:.3});m.userData={keep:1,noShadow:1,emissive:true};MAT[key]=m;return m}
  m=new T.MeshStandardMaterial({color:d.color!==undefined?d.color:0xffffff,roughness:d.rough!==undefined?d.rough:.7,metalness:d.metal||0});
  if(d.map)m.map=d.map();
  if(d.emissive!==undefined){m.emissive=new T.Color(d.emissive);m.emissiveIntensity=d.ei||1;m.userData.emissive=true}
  if(d.opacity!==undefined){m.transparent=true;m.opacity=d.opacity;m.depthWrite=false}
  if(d.double)m.side=T.DoubleSide;
  if(d.env)m.envMapIntensity=d.env;
  if(d.normal){m.normalMap=TEX.waterN();m.normalScale=new T.Vector2(.35,.35)}
  m.userData.ts=d.ts||1;m.userData.keep=!!d.keep;m.userData.noShadow=!d.keepShadow&&(d.opacity!==undefined||d.emissive!==undefined);if(d.keepShadow)m.userData.emissive=false;
  MAT[key]=m;return m;
}

/* ───────── geometry cache ───────── */
const GC={};
const G={
  box:()=>GC.box||(GC.box=new T.BoxGeometry(1,1,1)),
  sph:()=>GC.sph||(GC.sph=new T.SphereGeometry(1,18,12)),
  cyl:(seg=20)=>GC['c'+seg]||(GC['c'+seg]=new T.CylinderGeometry(1,1,1,seg)),
  cone:(seg=12)=>GC['k'+seg]||(GC['k'+seg]=new T.ConeGeometry(1,1,seg)),
  plane:()=>GC.plane||(GC.plane=(()=>{const g=new T.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g})()),
  rbox(w,h,d,r){
    r=Math.min(r,w/2-.002,h/2-.002,d/2-.002);const key=`rb${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}_${r.toFixed(3)}`;
    if(GC[key])return GC[key];
    if(r<.006){return GC[key]=new T.BoxGeometry(w,h,d)}
    const s=new T.Shape(),x=-w/2,y=-d/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
    const g=new T.ExtrudeGeometry(s,{depth:Math.max(.001,h-2*r),bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelOffset:-r,bevelSegments:3,curveSegments:4});
    g.translate(0,0,-(h-2*r)/2);g.rotateX(-Math.PI/2);return GC[key]=g;
  },
  lathe(key,pts,seg=24){return GC[key]||(GC[key]=new T.LatheGeometry(pts.map(p=>new T.Vector2(p[0],p[1])),seg))},
  torus(r,t,arc,key){const k=key||`t${r}_${t}_${arc}`;return GC[k]||(GC[k]=new T.TorusGeometry(r,t,10,28,arc))},
  leaf(){if(GC.leaf)return GC.leaf;const s=new T.Shape();s.moveTo(0,0);s.bezierCurveTo(.12,.08,.14,.3,0,.42);s.bezierCurveTo(-.14,.3,-.12,.08,0,0);const g=new T.ShapeGeometry(s,6);return GC.leaf=g},
  piano(){if(GC.piano)return GC.piano;const s=new T.Shape();s.moveTo(-.75,-.95);s.lineTo(.75,-.95);s.lineTo(.75,.15);s.bezierCurveTo(.75,.75,.35,.95,.05,.95);s.bezierCurveTo(-.3,.95,-.3,.45,-.75,.3);s.lineTo(-.75,-.95);
    const g=new T.ExtrudeGeometry(s,{depth:.32,bevelEnabled:true,bevelThickness:.015,bevelSize:.015,bevelSegments:2,curveSegments:16});g.rotateX(Math.PI/2);g.translate(0,.32,0);return GC.piano=g}
};

/* ───────── part collector ───────── */
let PARTS=[],LIGHTS=[],COLL=[],FLICK=[];
const XF=new T.Matrix4();
const _q=new T.Quaternion(),_e=new T.Euler(),_v=new T.Vector3(),_s=new T.Vector3();
function part(geo,mk,x,y,z,o){
  o=o||{};const m=new T.Matrix4();_e.set(o.rx||0,o.ry||0,o.rz||0,'YXZ');_q.setFromEuler(_e);
  m.compose(_v.set(x,y,z),_q,_s.set(o.sx||1,o.sy||1,o.sz||1));m.premultiply(XF);PARTS.push({g:geo,m:mk,x:m});
}
const box=(mk,x,y,z,w,h,d,o={})=>part(G.box(),mk,x,y+h/2,z,Object.assign({},o,{sx:w,sy:h,sz:d}));
const rb=(mk,x,y,z,w,h,d,r,o)=>part(G.rbox(w,h,d,r),mk,x,y+h/2,z,o);
const cy=(mk,x,y,z,r,h,o={},seg)=>part(G.cyl(seg||20),mk,x,y+h/2,z,Object.assign({},o,{sx:r,sy:h,sz:r*(o.zr||1)}));
const sp=(mk,x,y,z,rx,ry,rz,o={})=>part(G.sph(),mk,x,y,z,Object.assign({},o,{sx:rx,sy:ry,sz:rz}));
const cone=(mk,x,y,z,r,h,o={},seg)=>part(G.cone(seg||12),mk,x,y+h/2,z,Object.assign({},o,{sx:r,sy:h,sz:r}));
const plane=(mk,x,y,z,w,d,o={})=>part(G.plane(),mk,x,y,z,Object.assign({},o,{sx:w,sz:d}));
function light(x,y,z,color,int,dist,kind){const v=new T.Vector3(x,y,z).applyMatrix4(XF);LIGHTS.push({p:v,c:color||0xffd6a0,i:int||1,d:dist||7,k:kind||'lamp'})}
function setXF(x,z,deg,y){XF.makeRotationY(-(deg||0)*Math.PI/180);XF.setPosition(x,y||0,z)}
function contact(x,z,w,d,op){plane('contact',x,.006,z,w,d,{})}

/* ───────── furniture models ───────── */
const CHAIR=(x,z,ry,seat='boucle')=>{const o={ry};const s=Math.sin(ry),c=Math.cos(ry);const P=(lx,lz)=>[x+lx*c+lz*s,z-lx*s+lz*c];
  [[-.21,-.2],[.21,-.2],[-.21,.2],[.21,.2]].forEach(([a,b])=>{const [px,pz]=P(a,b);cy('blackMetal',px,0,pz,.014,.46)});
  rb(seat,x,.42,z,.5,.09,.48,.04,o);
  const [bx,bz]=P(0,.02);part(G.torus(.25,.045,Math.PI,'chairback'),seat,bx,.72,bz,{ry,rx:-Math.PI/2,sx:1,sy:1,sz:1.8});
  const [ax,az]=P(-.26,-.05),[cx,cz]=P(.26,-.05);cy('blackMetal',ax,.46,az,.012,.28);cy('blackMetal',cx,.46,cz,.012,.28);
};
const _up=new T.Vector3(0,1,0);
function beam(mk,x1,y1,z1,x2,y2,z2,t,isBox){const d=new T.Vector3(x2-x1,y2-y1,z2-z1),len=d.length();const q=new T.Quaternion().setFromUnitVectors(_up,d.normalize());const e=new T.Euler().setFromQuaternion(q,'YXZ');
  part(isBox?G.box():G.cyl(10),mk,(x1+x2)/2,(y1+y2)/2,(z1+z2)/2,{rx:e.x,ry:e.y,rz:e.z,sx:t,sy:len,sz:t})}
const PILLOW=(mk,x,y,z,w,h,ry,rx)=>rb(mk,x,y,z,w,h,.16,.07,{ry:ry||0,rx:rx||-.25});
const LAMP=(x,y,z)=>{part(G.lathe('lampbase',[[0,0],[.09,0],[.11,.05],[.07,.2],[.03,.32],[.02,.34],[0,.34]]),'blackCeramic',x,y,z);
  part(G.lathe('lampshade',[[.17,0],[.13,.24],[.125,.24],[.165,0]],28),'shade',x,y+.32,z);light(x,y+.45,z,0xffcf96,.55,4,'lamp')};
const BOOKS=(x,y,z,len,depth,seed)=>{const r=rng(seed);let p=-len/2;const ks=['bookA','bookB','bookC','bookD','bookE','bookF'];
  while(p<len/2-.05){const w=.025+r()*.035,h=.18+r()*.12;if(r()<.12){p+=.08;continue}box(ks[(r()*6)|0],x+p+w/2,y,z,w,h,depth*(.75+r()*.2),{rz:r()<.06?.25:0});p+=w+.003}};
const PLANT=(x,z,s)=>{s=s||1;part(G.lathe('pot',[[0,0],[.16,0],[.2,.05],[.22,.42],[.2,.44],[0,.44]]),'pot',x,0,z,{sx:s,sy:s,sz:s});
  const r=rng(hash(x+','+z));for(let i=0;i<4;i++)cy('bark',x+(r()-.5)*.06*s,.4*s,z+(r()-.5)*.06*s,.012,(.6+r()*.6)*s);
  for(let i=0;i<26;i++){const a=r()*6.28,h=(.55+r()*.95)*s,rad=(.05+r()*.28)*s;part(G.leaf(),i%3?'leaf':'leaf2',x+Math.cos(a)*rad,h,z+Math.sin(a)*rad,{ry:-a+Math.PI/2,rx:-.4-r()*.8,sx:(.9+r()*.8)*s,sy:(.9+r()*.8)*s,sz:s})}};

const FURN={
  sofa(w,d){contact(0,0,w+.3,d+.3);const fab='linen';rb(fab,0,.1,0,w,.26,d,.05);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>cy('walnut',a*(w/2-.12),0,b*(d/2-.12),.025,.1));
    const n=w>2.1?3:2,cw=(w-.38)/n;for(let i=0;i<n;i++){rb('cream',-w/2+.19+cw*i+cw/2,.34,.07,cw-.02,.17,d-.3,.06);rb('cream',-w/2+.19+cw*i+cw/2,.42,-d/2+.2,cw-.04,.48,.2,.07,{rx:-.12})}
    rb(fab,-w/2+.09,.1,0,.18,.56,d,.06);rb(fab,w/2-.09,.1,0,.18,.56,d,.06);rb(fab,0,.1,-d/2+.08,w,.68,.16,.05);
    PILLOW('charcoal',-w/2+.45,.62,-d/2+.38,.45,.42,.25);PILLOW('blush',w/2-.45,.62,-d/2+.38,.45,.42,-.25);if(w>2.2)PILLOW('rust',w/2-.85,.6,-d/2+.36,.36,.34,-.1);},
  sofa_l(w,d){contact(0,0,w+.3,d+.3);const dd=.95;
    rb('charcoal',0,.1,-d/2+dd/2,w,.26,dd,.05);rb('charcoal',-w/2+dd/2,.1,dd/2,dd,.26,d-dd,.05);
    for(let i=0;i<3;i++){const cw=(w-dd-.2)/3;rb('linen',-w/2+dd+cw*i+cw/2,.34,-d/2+dd/2+.07,cw-.02,.17,dd-.3,.06);rb('linen',-w/2+dd+cw*i+cw/2,.42,-d/2+.2,cw-.04,.48,.2,.07,{rx:-.12})}
    rb('linen',-w/2+dd/2+.07,.34,-d/2+dd/2+.07,dd-.3,.17,dd-.3,.06);rb('linen',-w/2+dd/2+.07,.34,dd/2+.1,dd-.3,.17,d-dd-.25,.06);
    rb('linen',-w/2+.2,.42,dd/2-.05,.2,.48,d-dd-.3,.07,{rz:.12});rb('linen',-w/2+.2,.42,-d/2+dd/2,.2,.48,dd-.2,.07,{rz:.12});
    rb('charcoal',0,.1,-d/2+.08,w,.68,.16,.05);rb('charcoal',-w/2+.08,.1,0,.16,.68,d,.05);rb('charcoal',w/2-.09,.1,-d/2+dd/2,.18,.56,dd,.06);rb('charcoal',-w/2+dd/2,.1,d/2-.09,dd,.56,.18,.06);
    PILLOW('cream',w/2-.5,.62,-d/2+.38,.45,.42,-.2);PILLOW('blush',-w/2+.6,.62,-d/2+.42,.45,.42,.6);PILLOW('rust',.2,.6,-d/2+.36,.38,.36,0);
    rb('knit',-w/2+dd/2+.05,.51,d/2-.75,.86,.05,1.05,.025,{ry:.18});box('knit',-w/2+dd/2+.05+.28,.12,d/2-.1,.5,.42,.05,{ry:.18,rx:.06});rb('knit',-w/2+dd/2+.05+.28,.08,d/2+.02,.55,.07,.25,.03,{ry:.18});},
  armchair(w,d){contact(0,0,w+.2,d+.2);
    [-1,1].forEach(a=>{rb('oak',a*(w/2-.04),.05,0,.05,.55,d,.02);rb('oak',a*(w/2-.04),.5,0,.07,.04,d*.9,.015)});
    box('oak',0,.18,-d/2+.08,w-.08,.05,.05);box('oak',0,.18,d/2-.08,w-.08,.05,.05);
    rb('cream',0,.22,.04,w-.14,.16,d-.15,.06);rb('cream',0,.42,-d/2+.16,w-.16,.46,.14,.06,{rx:-.22});PILLOW('sage',0,.66,-d/2+.3,.36,.3,0,-.3)},
  rug(w,d,f){const k=['rugShag','rugChevron','rugPersian'][f.pat!==undefined?f.pat:hash(f.id||'r')%3];box(k==='rugChevron'?'charcoal':'linen',0,0,0,w,.012,d);plane(k,0,.014,0,w,d)},
  fire(w,d,f){box('stone',0,0,0,w,1.25,d);box('darkwood',0,1.25,.04,w+.3,.08,d+.12);box('blackCeramic',0,.18,d/2-.02,w*.62,.62,.06);
    box('darkGlass',0,.2,d/2+.012,w*.58,.56,.01);for(let i=0;i<5;i++)cone('fire',-.35+i*.17,.24,d/2-.12,.07,.22+((i*37)%5)*.04,{},8);
    cy('bark',-.15,.22,d/2-.15,.05,.5,{rz:Math.PI/2});cy('bark',.18,.22,d/2-.16,.05,.45,{rz:Math.PI/2+.2});
    light(0,.6,d/2+.4,0xff9a50,1.4,6,'fire');FLICK.push(LIGHTS.length-1);
    box('brass',-.5,1.33,0,.08,.22,.08);box('brass',.45,1.33,0,.12,.14,.12);PLANT(w/2-.25,0,.35)},
  tv(w,d){contact(0,0,w+.2,d+.2);box('oak',0,.06,0,w,.46,d);for(let i=0;i<12;i++)box('walnut',-w/2+.08+i*(w-.16)/11,.1,d/2+.003,.025,.38,.01);
    [-1,1].forEach(a=>cy('blackMetal',a*(w/2-.1),0,0,.02,.06));box('blackMetal',0,.52,-.05,.3,.02,.18);box('blackMetal',0,.54,-.05,.05,.35,.05);
    box('screen',0,.88,-.04,Math.min(w-.1,1.9),1.08,.04);box('chrome',0,.88,-.065,Math.min(w-.1,1.9)+.02,1.1,.008)},
  piano(w,d){contact(0,0,w+.2,d+.2);part(G.piano(),'screen',0,.62,0,{sx:w/1.5,sz:d/1.9});
    [[-.6,-.85],[.6,-.85],[.1,.7]].forEach(([a,b])=>cy('screen',a*w/1.5,0,b*d/1.9,.05,.62));
    box('ceramic',0,.7,-d/2+.1,w-.14,.03,.16);for(let i=0;i<36;i++)if([1,3,6,8,10].includes(i%12))box('screen',-w/2+.1+i*(w-.2)/36,.73,-d/2+.06,.014,.02,.09);
    part(G.piano(),'screen',0,.95,0,{sx:w/1.5*.98,sz:d/1.9*.98,sy:.05,rx:-.35});box('screen',0,.74,-d/2-.35,.8,.06,.35);[-1,1].forEach(a=>cy('screen',a*.3,0,-d/2-.35,.03,.46))},
  bookshelf(w,d,f){contact(0,0,w+.15,d+.15);const h=2.2;box('walnut',-w/2+.02,0,0,.04,h,d);box('walnut',w/2-.02,0,0,.04,h,d);box('walnut',0,h-.04,0,w,.04,d);box('walnut',0,0,0,w,.08,d);box('walnut',0,0,-d/2+.01,w,h,.02);
    const n=5;for(let i=1;i<n;i++)box('walnut',0,i*h/n,0,w-.06,.03,d);
    for(let i=0;i<n;i++){const y=i*h/n+(i?0.03:.08);if(i===2){part(G.lathe('vase',[[0,0],[.06,0],[.09,.08],[.05,.22],[.04,.26],[0,.26]]),'ceramic',w/4,y,0);BOOKS(-w/4,y,0,w/2-.1,d,hash(f.id)+i)}else BOOKS(0,y,0,w-.12,d,hash(f.id)+i)}},
  desk(w,d,f){contact(0,0,w+.2,d+.9);rb('walnut',0,.72,0,w,.04,d,.01);[-1,1].forEach(a=>{box('blackMetal',a*(w/2-.06),0,0,.04,.72,d-.1);box('blackMetal',a*(w/2-.06),0,0,.04,.04,d-.06)});
    box('blackMetal',0,.62,-d/2+.06,w-.14,.04,.02);LAMP(w/2-.25,.76,-d/2+.2);box('darkGlass',-.1,.76,0,.34,.015,.24);box('screen',-.1,.776,-.11,.34,.22,.01,{rx:-.3});BOOKS(-w/2+.3,.76,-.1,.3,.22,hash(f.id));
    const cz=d/2+.35;cy('chrome',0,0,cz,.03,.42);for(let i=0;i<5;i++){const a=i*1.2566;box('blackMetal',Math.cos(a)*.17,.03,cz+Math.sin(a)*.17,.34,.03,.04,{ry:-a})}
    rb('charcoal',0,.44,cz,.5,.08,.48,.03);rb('charcoal',0,.52,cz+.24,.46,.55,.06,.03,{rx:.1})},
  table_din(w,d,f,C){contact(0,0,w+1.2,d+1.2);rb('darkwood',0,.72,0,w,.06,d,.012);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('darkwood',a*(w/2-.18),0,b*(d/2-.15),.09,.72,.09));
    const n=Math.max(1,Math.floor((w-.4)/.72));for(let i=0;i<n;i++){const x=-((n-1)*.72)/2+i*.72;CHAIR(x,-d/2-.2,0);CHAIR(x,d/2+.2,Math.PI);if(f.noset)continue;
      cy('ceramic',x,.78,-d/2+.3,.13,.015);cy('ceramic',x,.78,d/2-.3,.13,.015);cy('blackCeramic',x,.795,-d/2+.3,.09,.008);cy('blackCeramic',x,.795,d/2-.3,.09,.008)}
    if(w>2.6){CHAIR(-w/2-.22,0,Math.PI/2);CHAIR(w/2+.22,0,-Math.PI/2)}
    if(!f.noset)part(G.lathe('vaseT',[[0,0],[.07,0],[.1,.1],[.06,.28],[.045,.34],[0,.34]]),'blackCeramic',0,.78,0);if(!f.noset)for(let i=0;i<9;i++)cy('rope',(i-4)*.02,1.05,(i%3-1)*.02,.006,.5,{rz:(i-4)*.12});
    // linear pendant
    const H=C.H,py=Math.min(H-.7,1.75);rb('brass',0,py,0,Math.min(w*.55,1.8),.24,.3,.02);box('bulb',0,py-.005,0,Math.min(w*.55,1.8)-.06,.01,.24);
    [-1,1].forEach(a=>cy('blackMetal',a*Math.min(w*.22,.7),py+.24,0,.004,H-py-.24));light(0,py-.2,0,0xffc98a,1.3,6.5,'pendant')},
  table_round(w,d,f,C){const lounge=f.low||has(C.room?C.room.n:'','응접','라운지','휴게','시어터','선룸','테라스','게임');
    if(lounge){contact(0,0,w+.2,d+.2);cy('oak',0,.38,0,w/2,.06,{zr:d/w},40);cy('walnut',0,0,0,w/2*.55,.38,{zr:d/w},40);part(G.lathe('bowl',[[0,0],[.08,0],[.16,.06],[.18,.09],[0,.02]]),'ceramic',.1,.44,0);BOOKS(-.2,.44,.15,.3,.2,hash(f.id));return}
    contact(0,0,w+1,d+1);if(f.fancy){cy('marble',0,.71,0,w/2,.05,{zr:d/w},48);part(G.lathe('tbase',[[0,0],[.42,0],[.42,.04],[.12,.12],[.09,.4],[.16,.66],[.3,.71],[0,.71]],32),'brass',0,0,0);
      part(G.lathe('cvase',[[0,0],[.08,0],[.11,.08],[.07,.2],[.09,.26],[0,.26]]),'ceramic',0,.76,0);for(let i=0;i<8;i++){const a=i*.785;sp(i%2?'blush':'sheet',Math.cos(a)*.1,1.08+(i%3)*.04,Math.sin(a)*.1,.06,.05,.06);part(G.leaf(),'leaf',Math.cos(a)*.14,.98,Math.sin(a)*.14,{ry:-a,rx:-.9,sx:.5,sy:.5})}
      [-1,1].forEach(k=>{cy('brass',k*.35,.76,.15,.035,.02);cy('sheet',k*.35,.78,.15,.018,.2,{},10);sp('bulb',k*.35,1.0,.15,.012,.02,.012)});
      for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;if(f.chairs===3&&i===0)continue;const r=w/2-.22;cy('ceramic',Math.cos(a)*r,.76,Math.sin(a)*r,.12,.012);cy('blackCeramic',Math.cos(a)*r,.772,Math.sin(a)*r,.08,.008)}}
    else{cy('walnut',0,.71,0,w/2,.05,{zr:d/w},40);cy('blackMetal',0,0,0,.06,.71);cy('blackMetal',0,0,0,.35,.03,{},24)}
    for(let i=(f.chairs===3?1:0);i<4;i++){const a=i*Math.PI/2+Math.PI/4,r=w/2+.2;CHAIR(Math.cos(a)*r,Math.sin(a)*r,-a-Math.PI/2,'cream')}
    if(f.fancy){FURN.chandelier(1.1,1.1,f,C);return}const H=C.H,py=Math.min(H-.8,1.8);sp('shade',0,py,0,.25,.22,.25);cy('blackMetal',0,py+.2,0,.004,H-py-.2);light(0,py-.2,0,0xffcf96,1,5,'pendant')},
  island(w,d,f,C){contact(0,0,w+.3,d+1);box('darkwood',0,.1,0,w-.06,.8,d-.06);box('blackMetal',0,0,0,w-.2,.1,d-.2);
    for(let i=0;i<4;i++)box('brass',-w/2+.4+i*(w-.8)/3,.75,d/2-.02,.25,.015,.015);
    box('marble',0,.9,0,w,.05,d);box('marble',-w/2+.025,0,0,.05,.9,d);box('marble',w/2-.025,0,0,.05,.9,d);
    box('steel',-w/4,.94,-.1,.5,.01,.38);part(G.torus(.12,.012,Math.PI,'faucet'),'blackMetal',-w/4,1.1,-.32,{});cy('blackMetal',-w/4-.12,.94,-.32,.012,.16);
    part(G.lathe('bowl2',[[0,0],[.08,0],[.16,.06],[.18,.09],[0,.02]]),'ceramic',w/4,.95,0);[0,1,2].forEach(i=>sp(i?'toyC':'toyA',w/4-.04+i*.05,1.0,0.02*i,.035,.035,.035));
    const n=Math.max(2,Math.floor(w/.8));for(let i=0;i<n;i++){const x=-((n-1)*.7)/2+i*.7,z=d/2+.35;cy('blackMetal',x,0,z,.2,.012);cy('blackMetal',x,0,z,.016,.68);
      part(G.lathe('stool',[[0,0],[.19,0],[.2,.06],[.17,.08],[0,.08]]),'oak',x,.66,z)}
    const H=C.H;for(let i=0;i<3;i++){const x=(i-1)*w*.3,py=Math.min(H-.8,1.85);sp('shade',x,py,0,.16,.16,.16);cy('blackMetal',x,py+.15,0,.004,H-py-.15);light(x,py-.15,0,0xffcf96,.8,4.5,'pendant')}},
  bed_k(w,d,f){contact(0,0,w+1.4,d+.4);
    rb('linen',0,0,0,w,.32,d,.04);rb('sheet',0,.32,.02,w-.06,.24,d-.1,.06);
    rb('cream',0,.5,.28,w+.04,.09,d*.66,.04);rb('cream',0,.2,.28+d*.33-.02,w+.04,.38,.05,.02);[-1,1].forEach(a=>rb('cream',a*(w/2+.01),.2,.28,.05,.38,d*.66,.02));
    rb('rust',0,.6,d/2-.35,w+.06,.06,.42,.03);
    [-1,1].forEach(a=>{rb('sheet',a*w/4.2,.56,-d/2+.32,w/2.4,.18,.42,.08,{rx:-.25});PILLOW(a<0?'sage':'blush',a*w/5,.6,-d/2+.55,.48,.36,0,-.2)});
    rb('linen',0,0,-d/2-.05,w+.24,1.2,.12,.04);for(let i=0;i<7;i++)rb('linen',-w/2+.1+i*(w-.2)/6,.35,-d/2+.02,(w-.2)/6.6,.8,.06,.03);
    [-1,1].forEach(a=>{const x=a*(w/2+.38);box('oak',x,.12,-d/2+.3,.5,.42,.42);box('blackMetal',x,0,-d/2+.3,.42,.12,.38);box('brass',x,.4,-d/2+.3+.215,.1,.012,.012);LAMP(x,.54,-d/2+.3)});
    rb('cream',0,0,d/2+.42,Math.min(w*.7,1.4),.46,.42,.05);cy('blackMetal',-.5,0,d/2+.42,.012,.12);
    PILLOW('cream',-w/6,.62,-d/2+.72,.42,.3,.2,-.15);PILLOW('rust',w/6,.62,-d/2+.72,.42,.3,-.2,-.15);rb('charcoal',0,.66,-d/2+.86,.5,.12,.16,.06,{rx:-.1});
    rb('knit',-.25,.58,d/2-.62,w*.55,.05,.75,.02,{ry:.12});box('knit',-w/2-.02,.12,d/2-.6,.04,.44,.7,{rz:.05});
    box('walnut',w/4,.6,.15,.55,.04,.36,{ry:-.2});cy('ceramic',w/4-.1,.64,.12,.045,.08);cy('ceramic',w/4+.1,.64,.2,.045,.08);box('bookB',w/4+.05,.64,.05,.16,.03,.22,{ry:-.2});
    box('sheet',.2,.46,d/2+.42,.6,.06,.36,{ry:.1});BOOKS(w/2+.38-.1,.54,-d/2+.12,.18,.14,7);sp('ceramic',-(w/2+.38)+.12,.6,-d/2+.15,.05,.05,.05)},
  bed_s(w,d,f){contact(0,0,w+.3,d+.3);rb('oak',0,0,0,w,.28,d,.03);rb('sheet',0,.28,.02,w-.06,.22,d-.1,.06);rb('sage',0,.44,.25,w+.03,.08,d*.66,.04);
    rb('sheet',0,.5,-d/2+.3,w*.7,.17,.4,.08,{rx:-.25});box('oak',0,0,-d/2-.03,w+.04,.95,.06)},
  wardrobe(w,d){contact(0,0,w+.15,d+.15);const h=2.3;box('lacquer',0,0,0,w,h,d);const n=Math.max(2,Math.round(w/.6));
    for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;box('lacquer',x,.04,d/2+.005,w/n-.012,h-.08,.02);cy('brass',x+(i%2?-1:1)*(w/n/2-.06),.9,d/2+.03,.01,.5)}},
  bath(w,d){contact(0,0,w+.3,d+.3);const t=Math.min(.08,w*.06);rb('ceramic',0,0,0,w,.14,d,.06);rb('ceramic',0,0,-d/2+t/2,w,.6,t,.03);rb('ceramic',0,0,d/2-t/2,w,.6,t,.03);rb('ceramic',-w/2+t/2,0,0,t,.6,d,.03);rb('ceramic',w/2-t/2,0,0,t,.6,d,.03);const rt=t+.03;rb('ceramic',0,.56,-d/2+rt/2,w+.02,.05,rt,.02);rb('ceramic',0,.56,d/2-rt/2,w+.02,.05,rt,.02);rb('ceramic',-w/2+rt/2,.56,0,rt,.05,d,.02);rb('ceramic',w/2-rt/2,.56,0,rt,.05,d,.02);box('ceramic',0,.14,0,w-2*t,.01,d-2*t);box('chrome',-w/2+.25,.15,0,.05,.004,.05);
    cy('chrome',w/2-.18,0,0,.03,1.0);part(G.torus(.12,.014,Math.PI,'tap'),'chrome',w/2-.3,1.0,0,{});PLANT(-w/2-.35,d/2-.1,.4)},
  crib(w,d){contact(0,0,w+.2,d+.2);const h=1.0;[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('lacquer',a*(w/2-.03),0,b*(d/2-.03),.05,h,.05));
    [-1,1].forEach(b=>{box('lacquer',0,h-.05,b*(d/2-.03),w,.05,.05);box('lacquer',0,.25,b*(d/2-.03),w,.04,.04);for(let i=1;i<6;i++)cy('lacquer',-w/2+i*w/6,.25,b*(d/2-.03),.012,h-.3)});
    [-1,1].forEach(a=>{box('lacquer',a*(w/2-.03),h-.05,0,.05,.05,d);box('lacquer',a*(w/2-.03),.25,0,.04,.04,d);for(let i=1;i<9;i++)cy('lacquer',a*(w/2-.03),.25,-d/2+i*d/9,.012,h-.3)});
    rb('sheet',0,.29,0,w-.08,.12,d-.08,.04);rb('blush',0,.41,.2,w-.1,.04,d*.5,.02);sp('toyC',.1,.47,-.3,.08,.06,.08);
    cy('lacquer',w/2-.03,h,-d/2+.03,.012,.55);box('lacquer',w/4,h+.55,-d/2+.03,w/2,.02,.02);for(let i=0;i<4;i++){cy('blackMetal',(i*.12)-.0,h+.35,-d/2+.03+(i%2)*.06,.002,.2);sp(['toyA','toyB','toyC','toyD'][i],(i*.12),h+.33,-d/2+.03+(i%2)*.06,.035,.035,.035)}},
  nurse(w,d){contact(0,0,w+.2,d+.2);[-1,1].forEach(a=>part(G.torus(.6,.02,1.1,'rocker'),'oak',a*(w/2-.06),.62,0,{ry:Math.PI/2,rz:-Math.PI/2-.55}));
    rb('blush',0,.3,0,w-.1,.16,d-.2,.06);rb('blush',0,.45,-d/2+.12,w-.12,.6,.14,.06,{rx:-.2});[-1,1].forEach(a=>rb('oak',a*(w/2-.06),.3,0,.06,.32,d-.2,.02));PILLOW('sheet',0,.62,-d/2+.25,.32,.26,0,-.2)},
  toy(w,d,f){contact(0,0,w+.15,d+.15);box('lacquer',0,0,0,w,1.0,d);const cols=Math.max(2,Math.round(w/.4));
    for(let j=0;j<2;j++)for(let i=0;i<cols;i++){const x=-w/2+(i+.5)*w/cols;box('ceramic',x,.06+j*.48,d/2-.001,w/cols-.04,.4,.01);rb(['toyA','toyB','toyC','toyD'][(i+j)%4],x,.08+j*.48,.02,w/cols-.08,.25,d-.1,.03)}
    sp('toyD',-w/3,1.12,0,.12,.12,.12);sp('cream',w/4,1.15,0,.12,.14,.1);sp('cream',w/4,1.33,0,.09,.09,.09);sp('cream',w/4-.06,1.4,0,.035,.035,.03);sp('cream',w/4+.06,1.4,0,.035,.035,.03)},
  play(w,d,f){box('cream',0,0,0,w,.03,d);plane('playMat',0,.032,0,w-.02,d-.02);const r=rng(hash(f.id));
    for(let i=0;i<14;i++){const s=.08+r()*.06;box(['toyA','toyB','toyC','toyD'][i%4],(r()-.5)*w*.7,.03+(i>10?.1:0),(r()-.5)*d*.7,s,s,s,{ry:r()*3})}sp('toyA',w/4,.18,-d/4,.15,.15,.15)},
  catbed(w,d){contact(0,0,w+.2,d+.2);part(G.torus(.5,.11,Math.PI*2,'catbed'),'boucle',0,.12,0,{rx:Math.PI/2,sx:(w/2-.1)/.5,sy:(d/2-.1)/.5,sz:1});cy('linen',0,0,0,w/2-.15,.1,{zr:d/w},32);rb('sheet',.1,.12,.05,.5,.05,.4,.02,{ry:.4})},
  cattower(w,d){contact(0,0,w+.2,d+.2);rb('boucle',0,0,0,w,.08,d,.03);[[-.4,-.4,2.0],[.45,.35,1.4],[-.35,.4,.9]].forEach(([a,b,h])=>{cy('rope',a*w/1.5,.08,b*d/1.5,.06,h);rb('boucle',a*w/1.5,h+.08,b*d/1.5,.55,.06,.5,.025)});
    part(G.torus(.22,.08,Math.PI*2,'catbed2'),'boucle',-.4*w/1.5,2.24,-.4*d/1.5,{rx:Math.PI/2});rb('linen',.1,.6,-.1,.5,.4,.45,.08)},
  tatami(w,d){box('linen',0,0,0,w,.045,d);plane('tatamiMat',0,.047,0,w,d)},
  teatable(w,d){contact(0,0,w+1.2,d+1.2);rb('darkwood',0,.3,0,w,.05,d,.01);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('darkwood',a*(w/2-.08),0,b*(d/2-.08),.06,.3,.06));
    [[0,-d/2-.4],[0,d/2+.4],[-w/2-.4,0],[w/2+.4,0]].forEach(([x,z])=>rb('navy',x,0,z,.58,.08,.58,.03));
    part(G.lathe('teapot',[[0,0],[.06,0],[.08,.05],[.07,.1],[.03,.12],[0,.12]]),'blackCeramic',0,.35,0);[-.2,.2].forEach(x=>cy('ceramic',x,.35,.1,.035,.05))},
  lantern(w,d,f,C){contact(0,0,w+.4,d+.4);cy('stone',0,0,0,w/2,.12,{},6);cy('stone',0,.12,0,.1,.6,{},6);cy('stone',0,.72,0,w/2*.8,.08,{},6);
    box('stone',0,.8,0,w*.55,.32,w*.55);box('bulb',0,.86,w*.276,w*.3,.2,.01);box('bulb',0,.86,-w*.276,w*.3,.2,.01);box('bulb',w*.276,.86,0,.01,.2,w*.3);box('bulb',-w*.276,.86,0,.01,.2,w*.3);
    cone('stone',0,1.12,0,w*.72,.28,{ry:Math.PI/4},4);cone('snowCap',0,1.2,0,w*.55,.24,{ry:Math.PI/4},4);sp('stone',0,1.42,0,.05,.06,.05);light(0,.96,0,0xffb36b,.9,5,'lantern')},
  tree(w,d,f){const s=Math.max(w,d)/3.2;cy('bark',0,0,0,.14*s,1.6*s,{},8);const r=rng(hash(f.id||'t'));
    for(let i=0;i<4;i++){const rr=(w/2)*(1-i*.2),y=(1.0+i*1.05)*s;cone('pine',0,y,0,rr,1.7*s,{ry:r()*3},9);cone('snowCap',0,y+.75*s,0,rr*.62,.8*s,{ry:r()*3},9)}},
  plant(w,d){PLANT(0,0,Math.max(w,d)/.6*.8)},
  car(w,d,f){contact(0,0,w+.4,d+.4);const paint=f.paint||['carPaint','carPaint2','carPaint3','carPaint4','carPaint'][hash(f.id)%5];rb(paint,0,.25,0,w,.62,d,.18);rb('darkGlass',0,.8,.15,w-.16,.5,d*.48,.16);rb(paint,0,1.22,.15,w-.3,.06,d*.4,.03);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>{cy('rubber',a*(w/2-.05),.35,b*(d/2-.85),.35,.24,{rz:Math.PI/2},20);cy('chrome',a*(w/2+.075),.35,b*(d/2-.85),.2,.02,{rz:Math.PI/2},16)});
    [-1,1].forEach(a=>{box('headlight',a*(w/2-.3),.6,-d/2+.01,.38,.08,.04);box('taillight',a*(w/2-.3),.65,d/2-.01,.38,.08,.04)})},
  treadmill(w,d){contact(0,0,w+.2,d+.2);rb('charcoal',0,0,.1,w,.18,d-.2,.03);box('rubber',0,.18,.1,w-.2,.01,d-.4);[-1,1].forEach(a=>box('blackMetal',a*(w/2-.05),.18,-d/2+.15,.05,1.1,.06,{rx:-.15}));box('screen',0,1.22,-d/2+.05,w-.05,.2,.25,{rx:-.5})},
  safe(w,d){contact(0,0,w+.2,d+.2);rb('steel',0,0,0,w,1.8,d,.02);box('darkGlass',0,.1,d/2+.003,w-.1,1.6,.01);cy('chrome',0,1.05,d/2+.03,.1,.04,{rx:Math.PI/2});box('chrome',.3,.9,d/2+.04,.04,.3,.04)},
  rack(w,d){contact(0,0,w+.2,d+.2);box('screen',0,0,0,w,2.0,d);for(let i=0;i<14;i++){box('blackMetal',0,.1+i*.13,d/2+.002,w-.08,.1,.01);box(i%5?'ledG':'ledR',-w/2+.12,.14+i*.13,d/2+.01,.02,.02,.01)}},
  nightstand(w,d){contact(0,0,w+.15,d+.15);box('oak',0,.1,0,w,.45,d);box('blackMetal',0,0,0,w-.08,.1,d-.06);box('brass',0,.42,d/2+.006,.12,.012,.012);LAMP(0,.55,0)},
  sideboard(w,d,f){contact(0,0,w+.2,d+.2);box('oak',0,.16,0,w,.68,d);const n=Math.max(2,Math.round(w/.5));for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;for(let k=0;k<8;k++)box('walnut',x-w/n/2+.05+k*(w/n-.1)/7,.22,d/2+.004,.014,.56,.008);box('walnut',x+w/n/2-.006,.16,d/2+.004,.012,.68,.01);sp('blackMetal',x,.55,d/2+.02,.04,.04,.02)}
    [-1,1].forEach(a=>cy('blackMetal',a*(w/2-.08),0,0,.015,.16));LAMP(-w/2+.3,.84,0);part(G.lathe('vaseS',[[0,0],[.1,0],[.13,.2],[.08,.42],[.06,.48],[0,.48]]),'blackCeramic',w/2-.3,.84,0)},
  floorlamp(w,d){contact(0,0,.6,.6);cy('blackMetal',0,0,0,.18,.03);cy('blackMetal',0,.03,0,.015,1.55);part(G.lathe('flshade',[[.24,0],[.17,.32],[.165,.32],[.235,0]],28),'shade',0,1.45,0);light(0,1.55,0,0xffcf96,.8,5,'lamp')},
  art(w,d,f){const k='art'+(hash(f.id)%3);box('walnut',0,.95,0,w,1.25,.04);plane(k,0,1.575,.022,w-.12,1.13,{rx:Math.PI/2});light(0,1.9,.4,0xffdcb0,.25,2.5,'art')},
  default(w,d,f){const c=f._c;rb('lacquer',0,0,0,w,c?c.h:.5,d,.03)}
};


function mergeParts(){
  const buckets=new Map();
  for(const p of PARTS){if(p.x.elements.some(isNaN)){console.warn('NaNPART',p.m,p.g.type,new Error().stack.split('\n').slice(2,4).join('|'));continue}const m=mat(p.m);let g=p.g.index?p.g.toNonIndexed():p.g.clone();g.clearGroups();g.applyMatrix4(p.x);
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    if(!m.userData.keep||!g.attributes.uv)boxUV(g,m.userData.ts);
    if(!buckets.has(p.m))buckets.set(p.m,[]);buckets.get(p.m).push(g)}
  const grp=new T.Group();
  buckets.forEach((list,k)=>{const m=mat(k);let merged;try{merged=BGU.mergeBufferGeometries(list,false)}catch(e){merged=null}
    if(!merged){list.forEach(g=>addMesh(grp,g,m,k));return}
    addMesh(grp,merged,m,k);list.forEach(g=>g.dispose())});
  return grp;
}
function addMesh(grp,g,m,k){const mesh=new T.Mesh(g,m);mesh.castShadow=!m.userData.noShadow&&k!=='contact';mesh.receiveShadow=k!=='contact'&&!m.userData.emissive;if(k==='contact')mesh.renderOrder=1;grp.add(mesh)}
function boxUV(g,ts){
  const p=g.attributes.position,n=g.attributes.normal,c=p.count,uv=new Float32Array(c*2);const sx=Array.isArray(ts)?ts[0]:ts,sy=Array.isArray(ts)?ts[1]:ts;
  for(let i=0;i<c;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;
    if(ay>=ax&&ay>=az){u=p.getX(i);v=p.getZ(i)}else if(ax>=az){u=p.getZ(i);v=p.getY(i)}else{u=p.getX(i);v=p.getY(i)}
    uv[i*2]=u/sx;uv[i*2+1]=v/sy}
  g.setAttribute('uv',new T.BufferAttribute(uv,2));
}


/* ───────── story furniture ───────── */
const PRINTS=(mk,w,d,gy,step,sc)=>{sc=sc||1;const n=Math.max(2,Math.floor(d/step));for(let i=0;i<n;i++){const z=-d/2+(i+.5)*d/n,x=(i%2?1:-1)*w*.28;plane(mk,x,gy+.004+i*.0002,z,(mk==='paw'?.13:.12)*sc,(mk==='paw'?.13:.27)*sc,{ry:Math.PI})}};
Object.assign(FURN,{
  catshelf(w,d){rb('oak',0,-.045,0,w,.045,d,.01);plane('boucle',0,.002,.0,w-.1,d-.06);[-1,1].forEach(a=>{box('blackMetal',a*(w/2-.15),-.25,-d/2+.02,.03,.22,.03);box('blackMetal',a*(w/2-.15),-.06,-d/2+.12,.03,.03,.22)})},
  perch(w,d){box('oak',0,-.06,0,w,.06,d);rb('boucle',0,0,.03,w-.18,.13,d-.16,.05);rb('leopard',w/4,.12,.05,.7,.03,.5,.015,{ry:.3});
    [-1,1].forEach(a=>{box('blackMetal',a*(w/2-.2),-.5,-d/2+.03,.04,.44,.04);box('blackMetal',a*(w/2-.2),-.3,-d/2+.3,.03,.03,.6,{rx:-.7})})},
  softplay(w,d){contact(0,0,w+.3,d+.3);rb('foamD',0,0,0,w,.08,d,.03);const ks=['foamA','foamB','foamC','foamD','foamA'];
    for(let i=0;i<5;i++){const h=.15+i*.15;rb(ks[i],-w/2+.3+i*.5,.08,-d/4,.48,h,.9,.06)}
    rb('foamB',w/2-.55,.08,-d/4,.6,.9,.9,.08);rb('foamC',w/2-.55,.4,d/4+.05,.5,.06,1.1,.03,{rx:.5});rb('foamA',-w/2+.6,.08,d/3,.9,.3,.6,.1,{rx:-.25});sp('foamC',-.2,.25,d/3,.17,.17,.17)},
  ballpit(w,d){contact(0,0,w+.2,d+.2);part(G.torus(w/2-.12,.12,Math.PI*2,'pitring'),'foamD',0,.16,0,{rx:Math.PI/2,sz:2});cy('foamB',0,0,0,w/2-.12,.05,{},28);
    const r=rng(9),ks=['toyA','toyB','toyC','toyD'];for(let i=0;i<70;i++){const a=r()*6.28,rad=r()*(w/2-.22);sp(ks[i%4],Math.cos(a)*rad,.1+r()*.16,Math.sin(a)*rad,.045,.045,.045)}},
  tent(w,d){contact(0,0,w+.2,d+.2);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>cy('oak',a*w*.36,0,b*d*.36,.018,1.95,{rz:-a*.33,rx:b*.33}));
    cone('cream',0,0,0,w*.62,1.75,{ry:Math.PI/4},4);box('darkwood',0,.02,d*.43,.55,.9,.02);rb('blush',0,0,0,w*.7,.1,d*.7,.04);PILLOW('sage',.2,.12,-.1,.4,.34,0,-.1);PILLOW('cream',-.25,.12,.05,.36,.3,.4,-.1);
    for(let i=0;i<5;i++)box(['toyA','toyB','toyC','toyD','toyA'][i],-w*.4+i*w*.2,1.3-Math.abs(i-2)*.08,d*.43,.12,.14,.01,{rz:Math.PI/4})},
  bookledge(w,d,f){contact(0,0,w+.15,d+.15);box('lacquer',0,0,0,w,.9,d);for(let j=0;j<3;j++){box('oak',0,.12+j*.27,d/2-.02,w-.06,.06,.04);const r=rng(hash(f.id)+j);for(let i=0;i<5;i++)box(['bookA','bookB','bookC','bookD','bookE','toyB','toyC'][(i+j*2)%7],-w/2+.2+i*(w-.3)/5,.15+j*.27,d/2-.08,.26,.24+r()*.04,.015,{rx:-.18})}},
  highchair(w,d){contact(0,0,.75,.8);const S0=.55;[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>beam('oak',a*.27,0,b*.29,a*.17,S0,b*.16,.022));beam('oak',-.23,.22,.24,.23,.22,.24,.018);
    rb('oak',0,S0,0,.42,.04,.38,.01);rb('sage',0,S0+.04,.01,.35,.05,.32,.02);rb('oak',0,S0+.04,-.18,.4,.44,.03,.01,{rx:-.1});rb('sage',0,S0+.1,-.16,.32,.3,.03,.015,{rx:-.1});
    [-1,1].forEach(a=>{rb('oak',a*.195,S0+.04,0,.03,.17,.36,.008)});box('oak',-.2,S0+.17,.2,.02,.03,.1);box('oak',.2,S0+.17,.2,.02,.03,.1);rb('lacquer',0,S0+.2,.24,.5,.025,.2,.008);
    part(G.lathe('bowl3',[[0,0],[.05,0],[.07,.04],[0,.01]]),'toyB',.1,S0+.225,.24);box('chrome',-.06,S0+.228,.24,.12,.006,.015,{ry:.4})},
  stroller(w,d){contact(0,0,w+.2,d+.2);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>cy('rubber',a*w/2,.11,b*(d/2-.1),.11,.05,{rz:Math.PI/2},16));box('blackMetal',0,.2,0,w-.1,.03,d-.2);
    rb('charcoal',0,.42,.05,w-.08,.32,d*.62,.08);part(G.torus(.27,.035,Math.PI,'canopy'),'charcoal',0,.72,-d*.18,{ry:Math.PI/2,sz:3,sx:1.1});cy('blackMetal',0,.4,d/2-.05,.012,.65,{rx:-.4});box('blackMetal',0,1.0,d/2+.18,w,.025,.025)},
  boxes(w,d,f){const r=rng(hash(f.id));if(!f.open){box('cardboard',0,0,0,w*.6,.45,d*.8,{ry:(r()-.5)*.2});box('tape',0,.452,0,.06,.002,d*.8,{ry:0});box('cardboard',w*.25,0,d*.05,w*.42,.36,d*.6,{ry:.15+r()*.2});box('cardboard',-.05,.45,.03,w*.45,.3,d*.5,{ry:-.2});return}
    const bw=w*.62,bd=d*.8,bh=.42,t=.012;box('cardboard',0,0,0,bw,.02,bd);[[0,-bd/2,bw,t],[0,bd/2,bw,t]].forEach(([x,z,a,b])=>box('cardboard',x,0,z,a,bh,b));[[-bw/2,0],[bw/2,0]].forEach(([x])=>box('cardboard',x,0,0,t,bh,bd));
    [[-bw/2,1],[bw/2,-1]].forEach(([x,k])=>box('cardboard',x-k*.0,bh,0,.012,.2,bd*.96,{rz:k*.9}));box('cardboard',0,bh,-bd/2,bw,.012,.18,{rx:-.9});
    for(let j=0;j<4;j++)rb(['sheet','rust','sage','navy'][j],-.04+(j%2)*.1,.06+j*.075,(j>1?.04:-.05),bw*.7,.07,bd*.6,.03,{ry:(j-1.5)*.08});
    {const oy=.37,g={ry:.35},R=(x,z,a,b,m)=>{const c=Math.cos(.35),sn=Math.sin(.35);rb(m||'toyA',x*c+z*sn,oy,-x*sn+z*c,a,.03,b,.012,g)};R(0,-.02,.17,.2);R(-.12,-.08,.09,.06);R(.12,-.08,.09,.06);R(-.05,.13,.07,.12);R(.05,.13,.07,.12);R(0,-.13,.08,.03,'sheet');
     [[0,0],[0,.05],[0,.09]].forEach(([x,z])=>{const c=Math.cos(.35),sn=Math.sin(.35);sp('sheet',x*c+z*sn,oy+.035,-x*sn+z*c,.008,.004,.008)});
     sp('toyD',-.17,.33,.14,.06,.05,.06);rb('toyD',.2,.33,.12,.05,.03,.09,.015,{ry:-.4});rb('toyD',.25,.33,.1,.05,.03,.09,.015,{ry:-.2})}
    box('cardboard',w*.28,0,d*.1,w*.36,.34,d*.55,{ry:.25});box('tape',w*.28,.342,d*.1,.05,.002,d*.55,{ry:.25});rb('sheet',-w*.32,0,-d*.25,.3,.05,.22,.02,{ry:.5});rb('blush',-w*.32,.05,-d*.25,.28,.05,.2,.02,{ry:.4})},
  plush(w,d){sp('leopard',0,.12,0,.14,.11,.18);sp('leopard',0,.25,-.13,.1,.09,.09);sp('leopard',-.06,.33,-.13,.03,.03,.02);sp('leopard',.06,.33,-.13,.03,.03,.02);cy('leopard',.0,.06,.18,.035,.22,{rx:1.2});
    [[-.08,.18,0],[.07,.2,.05],[0,.21,-.05],[-.05,.15,.1],[.09,.14,-.08]].forEach(([x,y,z])=>sp('spot',x,y,z,.018,.018,.018))},
  cinemascreen(w,d){box('blackMetal',0,.55,0,w+.16,w*.5+.16,.08);box('filmScreen',0,.63,.045,w,w*.5,.01);box('screen',0,0,0,w*.7,.45,.4);light(0,1.5,1.5,0x9fb6ff,.35,6,'screen')},
  recliner(w,d,f){contact(0,0,w+.3,d+.4);rb('charcoal',0,.1,0,w,.3,d,.06);const n=Math.max(2,Math.round(w/.95)),cw=(w-.3)/n;
    for(let i=0;i<n;i++){const x=-w/2+.15+cw*i+cw/2;rb('charcoal',x,.38,.1,cw-.04,.18,d-.35,.07);rb('charcoal',x,.45,-d/2+.2,cw-.06,.6,.24,.08,{rx:-.15});if(i<n-1)rb('charcoal',x+cw/2,.38,.05,.14,.3,d-.4,.05)}
    rb('charcoal',-w/2+.08,.1,0,.16,.6,d,.05);rb('charcoal',w/2-.08,.1,0,.16,.6,d,.05);rb('cream',-w/4,.57,.15,.7,.03,.6,.015,{ry:.25});rb('leopard',w/4,.57,.1,.6,.03,.5,.015,{ry:-.3})},
  poster(w,d,f){const k='poster'+(f.pi!==undefined?f.pi:hash(f.id)%6);box('blackMetal',0,1.0,0,w,1.2,.03);plane(k,0,1.6,.017,w-.06,1.14,{rx:Math.PI/2});light(0,2.2,.4,0xffdcb0,.2,2,'art')},
  snowman(w,d){contact(0,0,1.2,1.2);sp('snowCap',0,.42,0,.45,.42,.45);sp('snowCap',0,1.02,0,.32,.3,.32);sp('snowCap',0,1.45,0,.22,.21,.22);
    [-.07,.07].forEach(x=>sp('screen',x,1.5,.19,.025,.025,.02));cone('carrot',0,1.45,.2,.03,.16,{rx:Math.PI/2});part(G.torus(.24,.05,Math.PI*2,'scarf'),'scarf',0,1.24,0,{rx:Math.PI/2});box('scarf',.14,.95,.22,.09,.3,.03,{rz:.2});
    [-1,1].forEach(a=>cy('bark',a*.42,1.05,0,.015,.55,{rz:a*1.0}));[0,1,2].forEach(i=>sp('screen',0,.9+i*.13-.15,.3,.02,.02,.02))},
  sled(w,d){contact(0,0,w+.2,d+.2);[-1,1].forEach(a=>{box('darkwood',a*w*.35,.04,0,.03,.04,d*.9);part(G.torus(.12,.015,Math.PI/2,'runner'),'darkwood',a*w*.35,.16,-d*.45,{ry:Math.PI/2,rz:Math.PI})});
    for(let i=0;i<5;i++)box('oak',0,.16,-d*.35+i*d*.18,w,.025,.12);rb('blush',0,.19,.05,w*.8,.06,d*.5,.02);box('rope',0,.18,-d*.62,.02,.02,.3)},
  pawprints(w,d,f,C){PRINTS('paw',w,d,C.gy,.32)},
  bootprints(w,d,f,C){PRINTS('boot',w,d,C.gy,.38)},
  chandelier(w,d,f,C){const y=C.H-1.2;cy('brass',0,y+.4,0,.008,C.H-y-.4);part(G.torus(w/2,.025,Math.PI*2,'chanring'+w),'brass',0,y+.35,0,{rx:Math.PI/2});part(G.torus(w/3.2,.02,Math.PI*2,'chanring2'+w),'brass',0,y+.15,0,{rx:Math.PI/2});
    for(let i=0;i<28;i++){const a=i/28*6.283,r=i%2?w/2:w/3.2,yy=i%2?y+.35:y+.15;cy('crystal',Math.cos(a)*r,yy-.3,Math.sin(a)*r,.012,.28,{},6);sp('crystal',Math.cos(a)*r,yy-.32,Math.sin(a)*r,.03,.04,.03)}
    sp('bulb',0,y+.2,0,.09,.09,.09);light(0,y,0,0xffe0b0,1.3,7,'pendant')},
  ikebana(w,d){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.62,d);part(G.lathe('ikevase',[[0,0],[.12,0],[.15,.08],[.1,.24],[.07,.28],[0,.28]]),'blackCeramic',0,.62,0);
    const r=rng(4);for(let i=0;i<6;i++){const a=r()*6.28,t=.25+r()*.4;cy('bark',Math.cos(a)*.04,.85,Math.sin(a)*.04,.008,.7,{rz:Math.cos(a)*t,rx:Math.sin(a)*t});sp('red',Math.cos(a)*.25*t*2,1.2+r()*.3,Math.sin(a)*.25*t*2,.05,.045,.05);part(G.leaf(),'leaf',Math.cos(a)*.2,1.05+r()*.2,Math.sin(a)*.2,{ry:-a,rx:-.6,sx:.5,sy:.5})}},
  byobu(w,d){const n=6,pw=w/n;for(let i=0;i<n;i++){const x=-w/2+pw*(i+.5),a=i%2?.32:-.32;box('darkwood',x,0,(i%2?.08:-.08),pw,1.7,.04,{ry:a});box('gold',x,.06,(i%2?.08:-.08)+(i%2?.022:-.022)*0+.022,pw-.06,1.58,.01,{ry:a})}},
  scroll(w,d){cy('darkwood',0,1.98,0,.015,w+.1,{rz:Math.PI/2});plane('scrollTex',0,1.18,.012,w,1.6,{rx:Math.PI/2});cy('darkwood',0,.36,0,.02,w+.14,{rz:Math.PI/2})},
  katana(w,d){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.08,d);[-1,1].forEach(a=>{box('darkwood',a*(w/2-.1),.08,0,.06,.6,.08);box('darkwood',a*(w/2-.1),.45,.04,.07,.06,.12);box('darkwood',a*(w/2-.1),.66,.04,.07,.06,.12)});
    [.5,.71].forEach((y,i)=>{box('screen',-.05,y,.06,w*.82,.04,.03,{rz:i?.02:-.02});box('charcoal',w*.38,y,.06,.24,.045,.035)})},
  shoes(w,d){[[-.3,0,1],[-.05,0,1],[.25,.02,.42]].forEach(([x,z,s])=>{[-1,1].forEach(a=>{rb(s<1?'blush':'leather',x+a*.055*s,0,z,.09*s,.1*s,.28*s,.03*s);rb(s<1?'blush':'leather',x+a*.055*s,.06*s,z-.08*s,.08*s,.14*s,.1*s,.03*s)})})},
  bench(w,d){contact(0,0,w+.2,d+.2);rb('walnut',0,.38,0,w,.05,d,.01);[-1,1].forEach(a=>box('walnut',a*(w/2-.1),0,0,.06,.38,d-.06));rb('linen',0,.43,0,w-.12,.06,d-.08,.025)},
  towelbench(w,d){FURN.bench(w,d);box('darkwood',0,.43,-d/2+.05,w,.04,.04);[-1,1].forEach(a=>box('darkwood',a*(w/2-.05),0,-d/2+.05,.04,1.5,.04));box('darkwood',0,1.48,-d/2+.05,w,.04,.06);
    rb('sheet',0,.55,-d/2+.07,w-.2,.92,.05,.02);rb('sheet',0,1.42,-d/2+.06,w-.2,.1,.14,.03);rb('cream',.0,.48,0,.7,.08,.3,.02);rb('sheet',0,0,d/2+.75,1.5,.03,1.05,.012,{ry:.06});rb('cream',.55,.03,d/2+.35,.4,.02,.25,.01,{ry:.3})},
  changer(w,d){contact(0,0,w+.15,d+.15);box('lacquer',0,0,0,w,.88,d);[0,1].forEach(j=>box('oak',0,.12+j*.36,d/2+.004,w-.06,.3,.01));rb('blush',0,.88,0,w-.1,.08,d-.08,.035);sp('leopard',w/2-.15,.98,0,.06,.05,.07);part(G.lathe('cream1',[[0,0],[.04,0],[.04,.12],[.02,.15],[0,.15]]),'ceramic',-w/2+.12,.88,-d/4)},
  pantry(w,d){contact(0,0,w+.15,d+.15);box('oak',0,0,0,w,2.2,d);[0,1].forEach(i=>box('glass',-w/4+i*w/2,1.05,d/2+.005,w/2-.04,1.05,.01));for(let j=0;j<3;j++)for(let i=0;i<6;i++)part(G.lathe('jar',[[0,0],[.05,0],[.05,.16],[.035,.18],[0,.18]]),i%2?'ceramic':'glass',-w/2+.18+i*(w-.36)/5,1.12+j*.35,0)},
  monitorwall(w,d){const n=3,m=Math.max(3,Math.round(w/1.2));box('screen',0,.75,0,w+.1,1.45,.06);for(let j=0;j<n;j++)for(let i=0;i<m;i++)box('cctvScreen',-w/2+(i+.5)*w/m,.8+j*.46,.035,w/m-.05,.42,.01);light(0,1.4,1.2,0x9fc0ff,.4,5,'screen')},
  lounger(w,d){contact(0,0,w+.2,d+.2);box('oak',0,.25,.1,w,.05,d-.4);rb('sheet',0,.3,.15,w-.06,.07,d-.55,.03);rb('sheet',0,.32,-d/2+.3,w-.06,.07,.6,.03,{rx:-.7});[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('oak',a*(w/2-.05),0,b*(d/2-.25),.05,.25,.05))},
  float(w,d){part(G.torus(w/2-.12,.12,Math.PI*2,'float'),'yellow',0,.0,0,{rx:Math.PI/2});sp('yellow',w/2-.12,.18,0,.11,.12,.11);cone('carrot',w/2+.03,.18,0,.03,.08,{rz:-Math.PI/2})},
  winerack(w,d){contact(0,0,w+.15,d+.15);box('darkwood',-w/2+.02,0,0,.04,2.2,d);box('darkwood',w/2-.02,0,0,.04,2.2,d);for(let j=0;j<8;j++){box('darkwood',0,.1+j*.27,0,w,.02,d);for(let i=0;i<10;i++)cy('bottle',-w/2+.15+i*(w-.3)/9,.2+j*.27,0,.038,d*.9,{rx:Math.PI/2},10)}},
  rock(w,d,f){const r=rng(hash(f.id));sp('stone',0,.1,0,w/2,.32+r()*.12,d/2,{ry:r()*3});sp('snowCap',0,.26,0,w/2*.8,.14,d/2*.75,{ry:r()*3})},
  stones(w,d){cy('stone',0,-.01,0,w/2,.04,{zr:.8},12)},
  frames(w,d,f){[[-.55,1.75,.45,.55],[0,1.85,.4,.7],[.5,1.7,.5,.4],[-.3,1.2,.5,.38],[.35,1.25,.36,.46]].forEach(([x,y,fw,fh],i)=>{box('walnut',x,y-fh/2,0,fw,fh,.03);plane('art'+(i%3),x,y,.017,fw-.06,fh-.06,{rx:Math.PI/2})})},
  vanity(w,d){contact(0,0,w+.15,d+.15);box('walnut',0,.1,0,w,.72,d);box('marble',0,.82,0,w+.04,.05,d+.02);[-1,1].forEach(a=>{part(G.lathe('basin',[[0,0],[.18,0],[.2,.1],[.17,.11],[0,.02]]),'ceramic',a*w/4,.87,.02);cy('chrome',a*w/4,.87,-d/2+.08,.012,.22)});box('mirror',0,1.15,-d/2+.02,w-.1,.9,.02);box('cove',0,2.08,-d/2+.05,w-.2,.03,.03)},
  counter(w,d){contact(0,0,w+.15,d+.15);box('walnut',0,.1,0,w,.8,d);box('blackMetal',0,0,0,w-.1,.1,d-.08);box('marble',0,.9,0,w,.04,d);box('marble',0,.94,-d/2+.02,w,.5,.02);for(let i=0;i<Math.round(w/.6);i++)box('brass',-w/2+.3+i*.6,.78,d/2+.006,.18,.012,.012)},
  fireguard(w,d){const n=Math.round(w/.12);for(let i=0;i<=n;i++)cy('blackMetal',-w/2+i*w/n,0,0,.008,.6,{},6);box('brass',0,.58,0,w,.03,.03);box('brass',0,.06,0,w,.03,.03);[-1,1].forEach(a=>box('blackMetal',a*w/2,0,.08,.03,.6,.18))},
  mat(w,d){plane('pawMat',0,.008,0,w,d)},
  toys(w,d,f){const r=rng(hash(f.id));for(let i=0;i<9;i++){const s=.07+r()*.05;box(['toyA','toyB','toyC','toyD'][i%4],(r()-.5)*w,0,(r()-.5)*d,s,s,s,{ry:r()*3})}sp('toyD',w*.3,.09,-d*.2,.09,.09,.09);box('red',-w*.3,.03,d*.25,.22,.08,.12,{ry:.5});[-1,1].forEach(a=>cy('rubber',-w*.3+a*.07,.03,d*.25,.03,.13,{rz:Math.PI/2,ry:.5},10))},
  duck(w,d){sp('yellow',0,.05,0,.06,.05,.075);sp('yellow',0,.11,-.05,.04,.04,.04);cone('carrot',0,.11,-.095,.015,.035,{rx:-Math.PI/2})},
  candy(w,d){part(G.lathe('candyjar',[[0,0],[.08,0],[.09,.03],[.09,.2],[.06,.22],[0,.22]]),'glass',0,0,0);const r=rng(3);for(let i=0;i<16;i++)sp(['toyA','toyB','toyC','toyD','red'][i%5],(r()-.5)*.1,.03+r()*.12,(r()-.5)*.1,.022,.022,.022);sp('glass',0,.24,0,.04,.02,.04)},
  mirror(w,d){box('blackMetal',0,.2,0,w+.06,2.06,.03);box('mirror',0,.23,.018,w,2.0,.01)},
  hottub(w,d){contact(0,0,w+.3,d+.3);const t=.28,h=.55;[[0,-d/2+t/2,w,t],[0,d/2-t/2,w,t],[-w/2+t/2,0,t,d-2*t],[w/2-t/2,0,t,d-2*t]].forEach(([x,z,a,b])=>{box('stone',x,0,z,a,h,b);box('marble',x,h,z,a+.02,.05,b+.02)});
    box('poolTile',0,0,0,w-2*t,.06,d-2*t);plane('water',0,h-.08,0,w-2*t,d-2*t);box('poolLight',0,.25,-d/2+t+.01,.4,.1,.01);box('walnut',0,0,d/2+.25,w*.6,.2,.4);
    rb('sheet',w/2-.35,h+.05,-d/2+.15,.4,.08,.25,.03);rb('sheet',w/2-.35,h+.13,-d/2+.15,.36,.07,.22,.03);light(0,1.2,0,0x8fe0ff,.5,4,'lamp')},
  dumbbells(w,d){contact(0,0,w+.2,d+.2);[-1,1].forEach(a=>box('blackMetal',a*(w/2-.05),0,0,.05,.85,d));[.35,.7].forEach((y,j)=>{box('blackMetal',0,y,0,w,.03,d,{rx:j?-.2:-.1});const n=Math.round(w/.3);
    for(let i=0;i<n;i++){const x=-w/2+.18+i*(w-.36)/(n-1);cy('chrome',x,y+.07,0,.015,.2,{rx:Math.PI/2});[-1,1].forEach(k=>cy('rubber',x,y+.07,k*.09,.045+j*.01,.04,{rx:Math.PI/2},14))}})},
  squatrack(w,d){contact(0,0,w+.3,d+.3);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('blackMetal',a*(w/2-.04),0,b*(d/2-.04),.07,2.3,.07));box('blackMetal',0,2.26,-d/2+.04,w,.07,.07);box('blackMetal',0,2.26,d/2-.04,w,.07,.07);
    box('rubber',0,0,0,w,.03,d);cy('chrome',0,1.4,-d/2+.15,.015,w+.6,{rz:Math.PI/2});[-1,1].forEach(k=>{cy('rubber',k*(w/2+.18),1.4,-d/2+.15,.22,.05,{rz:Math.PI/2},20);cy('rubber',k*(w/2+.24),1.4,-d/2+.15,.17,.04,{rz:Math.PI/2},20)})},
  bike(w,d){contact(0,0,w+.2,d+.2);box('blackMetal',0,0,0,w,.05,d);beam('blackMetal',0,.05,d*.3,0,.95,-d*.05,.04,1);beam('blackMetal',0,.05,-d*.3,0,1.1,-d*.38,.04,1);cy('chrome',0,.45,d*.28,.22,.06,{rz:Math.PI/2},24);
    rb('charcoal',0,.95,-d*.05,.22,.06,.3,.03);box('blackMetal',0,1.1,-d*.4,.5,.03,.03);box('screen',0,1.15,-d*.36,.22,.15,.02,{rx:-.4})},
  rower(w,d){contact(0,0,w+.2,d+.2);box('blackMetal',0,.1,0,.12,.06,d);cy('screen',0,.12,-d/2+.2,.25,.12,{rz:Math.PI/2},24);rb('charcoal',0,.17,.1,.28,.06,.3,.02);box('blackMetal',0,.2,-d/2+.5,.4,.03,.12);box('screen',0,.75,-d/2+.15,.2,.15,.02,{rx:-.5});beam('blackMetal',0,.12,-d/2+.2,0,.72,-d/2+.15,.03,1)},
  benchpress(w,d){contact(0,0,w+.3,d+.3);rb('charcoal',0,.38,.15,.3,.08,d-.5,.03);box('blackMetal',0,0,.15,.08,.38,.08);[-1,1].forEach(a=>box('blackMetal',a*.45,0,-d/2+.3,.05,1.15,.05));cy('chrome',0,1.12,-d/2+.3,.014,w+.4,{rz:Math.PI/2});[-1,1].forEach(k=>cy('rubber',k*(w/2+.12),1.12,-d/2+.3,.2,.05,{rz:Math.PI/2},20))},
  washer(w,d){const n=Math.max(1,Math.round(w/.68));for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;[0,.86].forEach((y,j)=>{rb('lacquer',x,y,0,w/n-.03,.84,d,.02);part(G.torus(.2,.025,Math.PI*2,'wdoor'),'chrome',x,y+.4,d/2+.01,{});cy('darkGlass',x,y+.4,d/2+.005,.19,.01,{rx:Math.PI/2},24);box('screen',x,y+.74,d/2+.005,.3,.06,.01)})}},
  laundry(w,d){cy('rope',0,0,0,w/2,.38,{zr:d/w},16);for(let i=0;i<4;i++)rb(['blush','sage','sheet','toyD'][i],(i%2-.5)*.12,.32+i*.05,(i>1?.06:-.06),.24,.06,.18,.025,{ry:i*.4})},
  ironing(w,d){beam('blackMetal',-.3,0,-.12,.3,.85,.12,.02);beam('blackMetal',.3,0,-.12,-.3,.85,.12,.02);rb('linen',0,.85,0,w,.03,d,.012);rb('steel',w/2-.25,.88,0,.22,.1,.11,.04)},
  display(w,d,f){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.8,d);box('glass',0,.8,0,w-.04,.9,d-.04);box('darkwood',0,1.7,0,w,.06,d);box('bulb',0,1.66,0,w*.6,.02,d*.4);
    const r=rng(hash(f.id));if(r()<.5)part(G.lathe('dv1',[[0,0],[.08,0],[.12,.15],[.06,.32],[.05,.36],[0,.36]]),'celadon',0,.8,0);else{box('gold',-.15,.8,0,.12,.06,.06);sp('red',.12,.86,0,.05,.05,.05);sp('chrome',.02,.84,.1,.04,.04,.04)}},
  goldbars(w,d){contact(0,0,w+.15,d+.15);box('steel',0,0,0,w,1.6,d);for(let j=0;j<3;j++){box('darkGlass',0,.2+j*.48,0,w-.06,.02,d-.04);for(let i=0;i<Math.round(w/.18);i++)for(let k=0;k<2;k++)box('gold',-w/2+.12+i*.18,.22+j*.48+k*.05,(k?.06:-.04),.15,.045,.07)}},
  armor(w,d){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.3,d);cy('blackMetal',0,.3,0,.03,.6);rb('lacquerRed',0,.75,0,.46,.5,.3,.06);for(let i=0;i<4;i++)rb('lacquerRed',0,.55-i*.07,.02,.5+i*.04,.06,.32,.02);
    [-1,1].forEach(a=>{rb('lacquerRed',a*.32,1.08,0,.22,.16,.28,.04,{rz:a*-.4});rb('blackMetal',a*.3,.7,.02,.12,.32,.14,.03)});sp('blackMetal',0,1.42,0,.15,.13,.15);rb('lacquerRed',0,1.32,.02,.42,.05,.36,.02);box('gold',0,1.52,.08,.3,.12,.02)},
  pedestal(w,d,f){contact(0,0,w+.15,d+.15);box('lacquer',0,0,0,w,1.0,d);part(G.lathe('pv'+(hash(f.id)%2),hash(f.id)%2?[[0,0],[.1,0],[.16,.2],[.1,.42],[.08,.48],[0,.48]]:[[0,0],[.14,0],[.18,.1],[.14,.24],[.06,.3],[0,.3]]),hash(f.id)%2?'celadon':'blackCeramic',0,1,0);box('bulb',0,2.6,0,.1,.05,.1)},
  paintingrack(w,d){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.12,d);for(let i=0;i<4;i++){const z=-d/2+.12+i*(d-.24)/3,fw=w*(.6+((i*37)%4)*.1);box('walnut',(i%2-.5)*.2,.12,z,fw,1.0+(i%2)*.3,.04,{rx:-.1});plane('art'+(i%3),(i%2-.5)*.2,.68+(i%2)*.15,z+.03,fw-.1,.9+(i%2)*.3,{rx:Math.PI/2-.1})}},
  archive(w,d,f){contact(0,0,w+.15,d+.15);const h=2.4;box('steel',-w/2+.02,0,0,.04,h,d);box('steel',w/2-.02,0,0,.04,h,d);for(let j=0;j<6;j++){box('steel',0,.05+j*.4,0,w,.02,d);const r=rng(hash(f.id)+j);for(let i=0;i<Math.round(w/.32);i++)box(r()<.6?'cardboard':(r()<.5?'bookF':'bookB'),-w/2+.2+i*.32,.07+j*.4,0,.28,.3,d*.85)}},
  console(w,d){contact(0,0,w+.3,d+.9);box('screen',0,0,0,w,.75,d);box('darkGlass',0,.75,0,w+.04,.03,d+.04);for(let i=0;i<Math.round(w/.8);i++){const x=-w/2+.4+i*.8;box('cctvScreen',x,.8,-d/2+.12,.62,.38,.02,{rx:-.15});box('blackMetal',x,.79,.05,.4,.015,.14)}
    for(let i=0;i<Math.round(w/1.4);i++){const x=-w/2+.7+i*1.4,cz=d/2+.4;cy('chrome',x,0,cz,.03,.42);rb('charcoal',x,.44,cz,.5,.08,.48,.03);rb('charcoal',x,.52,cz+.24,.46,.55,.06,.03,{rx:.1})}},
  generator(w,d){contact(0,0,w+.3,d+.3);box('steel',0,0,0,w,1.5,d);for(let i=0;i<8;i++)box('blackMetal',-w/2+.2+i*(w-.4)/7,.3,d/2+.005,.04,.9,.01);box('yellow',0,1.5,0,w*.3,.05,d*.3);cy('steel',w/2-.3,1.5,0,.12,.8);box('ledG',-w/2+.25,1.25,d/2+.01,.06,.04,.01)},
  machine(w,d){contact(0,0,w+.3,d+.3);box('lacquer',0,0,0,w,1.8,d);cy('steel',0,1.8,0,.25,.6,{},16);for(let i=0;i<3;i++)cy('chrome',-w/2+.25+i*.35,0,-d/2-.1,.06,2.6,{},10)},
  bunk(w,d){contact(0,0,w+.2,d+.2);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('blackMetal',a*(w/2-.03),0,b*(d/2-.03),.05,1.8,.05));[.3,1.25].forEach(y=>{box('blackMetal',0,y,0,w,.05,d);rb('sheet',0,y+.05,0,w-.06,.15,d-.06,.04);rb('navy',0,y+.2,.25,w-.04,.05,d*.6,.02);rb('sheet',0,y+.22,-d/2+.25,w*.7,.1,.3,.04)});for(let i=0;i<4;i++)box('blackMetal',w/2-.03,.5+i*.25,d/2-.3,.04,.03,.3)},
  supply(w,d,f){contact(0,0,w+.15,d+.15);const fr=f.linen?'oak':'steel';box(fr,-w/2+.02,0,0,.04,2,d);box(fr,w/2-.02,0,0,.04,2,d);for(let j=0;j<4;j++){box(fr,0,.05+j*.5,0,w,.02,d);if(f.linen){for(let i=0;i<Math.round(w/.4);i++){const x=-w/2+.22+i*.4;for(let k=0;k<4;k++)rb(['sheet','cream','blush','sage','linen'][(i+j)%5],x,.07+j*.5+k*.075,0,.34,.07,d*.75,.03)}continue}for(let i=0;i<Math.round(w/.3);i++){const x=-w/2+.18+i*.3;if((i+j)%3)box('cardboard',x,.07+j*.5,0,.26,.3,d*.8);else for(let k=0;k<4;k++)cy('glass',x-.06+(k%2)*.12,.07+j*.5,(k>1?.08:-.08),.04,.3,{},8)}}},
  barrel(w,d){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.18,d);const n=Math.max(1,Math.round(w/.8));for(let i=0;i<n;i++){const x=-w/2+(i+.5)*w/n;part(G.lathe('barrel',[[.0,0],[.3,0],[.36,.3],[.37,.45],[.36,.6],[.3,.9],[0,.9]],20),'walnut',x,.18+.37,-.45,{rx:Math.PI/2});[.15,.45,.75].forEach(z=>part(G.torus(.355,.012,Math.PI*2,'hoop'),'blackMetal',x,.55,-.45+z,{}))}},
  shoecabinet(w,d){contact(0,0,w+.15,d+.15);const h=1.9;box('oak',-w/2+.02,0,0,.04,h,d);box('oak',w/2-.02,0,0,.04,h,d);box('oak',0,h-.04,0,w,.04,d);box('oak',0,0,-d/2+.01,w,h,.02);box('oak',0,0,0,w,.06,d);
    const rows=5;for(let j=1;j<rows;j++)box('oak',0,j*h/rows,0,w-.04,.025,d,{rx:-.08});
    const pair=(x,y,mk,sc,boot)=>[-1,1].forEach(a=>{rb(mk,x+a*.06*sc,y,.02,.09*sc,(boot?.1:.08)*sc,.28*sc,.03*sc,{rx:-.08});if(boot)rb(mk,x+a*.06*sc,y+.06*sc,-.05*sc,.09*sc,.22*sc,.11*sc,.03*sc)});
    const lay=[['leather',1,1],['charcoal',1,0],['leather',1,0],['sheet',.95,0],['blush',.42,0],['carPaint2',1,0],['leatherDark',1,1],['toyD',.42,1],['navy',1,0],['rust',.95,0],['leather',1,0],['blush',.42,0]];
    let k=0;for(let j=0;j<rows;j++){const n=Math.floor((w-.1)/.42);for(let i=0;i<n;i++){const L=lay[k++%lay.length];pair(-w/2+.26+i*(w-.4)/(n-1||1),j*h/rows+.04,L[0],L[1],L[2])}}
    box('lacquer',0,h,0,w,.04,d);sp('ceramic',w/2-.25,h+.12,0,.1,.12,.1);LAMP(-w/2+.3,h+.04,0)},
  mural(w,d){const h=2.4,y0=.55;box('stoneDark',0,y0-.06,0,w+.16,h+.12,.05);plane('mural',0,y0+h/2,.03,w,h,{rx:Math.PI/2});box('coolLed',0,y0-.08,.04,w,.015,.02);box('coolLed',0,y0+h+.07,.04,w,.015,.02);light(0,y0+h*.6,.9,0xa9d4ff,.7,5,'art')},
  kidart(w,d){box('oak',0,1.0,0,w,w*.8,.03);plane('kidart',0,1.0+w*.4,.017,w-.1,w*.8-.1,{rx:Math.PI/2});light(0,1.9,.4,0xffdcb0,.35,2.5,'art')},
  babyprints(w,d,f,C){PRINTS('baby',w,d,C.gy,.26,.72)},
  wheeltracks(w,d,f,C){const n=Math.max(4,Math.round(d/.25));for(let k of[-1,1])for(let i=0;i<n;i++){const z=-d/2+(i+.5)*d/n,x=k*.2+Math.sin(z*.55)*.3;plane('tracks',x,C.gy+.012,z,.075,d/n*1.02,{ry:Math.cos(z*.55)*.165})}},
  ridecar(w,d){contact(0,0,w+.15,d+.15);rb('red',0,.1,0,w,.16,d*.9,.05);rb('red',-.05,.26,0,w*.45,.12,d*.8,.05);rb('sheet',-.08,.26,0,.18,.06,d*.6,.03);[-1,1].forEach(a=>[-1,1].forEach(b=>cy('rubber',a*(w/2-.12),.07,b*(d/2-.02),.07,.04,{rx:Math.PI/2},14)));cy('blackMetal',.15,.26,0,.012,.16,{rz:-.5});part(G.torus(.06,.012,Math.PI*2,'swheel'),'blackMetal',.2,.42,0,{ry:Math.PI/2,rx:.4})},
  execdesk(w,d,f){contact(0,0,w+.4,d+1.2);rb('darkwood',0,.72,0,w,.06,d,.012);box('darkwood',-w/2+.25,0,0,.5,.72,d-.06);box('darkwood',w/2-.25,0,0,.5,.72,d-.06);box('darkwood',0,.18,-d/2+.05,w-1,.5,.04);
    [0,1,2].forEach(j=>[-1,1].forEach(a=>box('brass',a*(w/2-.25),.18+j*.2,d/2+.002,.1,.012,.012)));rb('leatherDark',0,.78,.05,w*.5,.008,d*.55,.004);
    box('bookF',-w/2+.35,.78,-.15,.32,.06,.24,{ry:.1});box('sheet',-w/2+.35,.84,-.15,.3,.012,.22,{ry:.12});box('sheet',.15,.786,.05,.21,.003,.3,{ry:-.2});cy('screen',.32,.79,.1,.006,.15,{rz:Math.PI/2,ry:.4});
    part(G.lathe('blamp',[[0,0],[.07,0],[.07,.02],[.015,.03],[.015,.36],[0,.36]]),'brass',w/2-.32,.78,-.25);rb('bottle',w/2-.32,1.12,-.25,.42,.09,.16,.04);light(w/2-.32,1.1,-.1,0xffd9a8,.6,3.5,'lamp');
    const cz=d/2+.42;cy('chrome',0,0,cz,.035,.44);for(let i=0;i<5;i++){const a=i*1.2566;box('chrome',Math.cos(a)*.2,.03,cz+Math.sin(a)*.2,.4,.03,.05,{ry:-a})}
    rb('leatherDark',0,.44,cz,.62,.12,.58,.05);rb('leatherDark',0,.55,cz+.3,.6,.85,.12,.06,{rx:.12});[-1,1].forEach(a=>rb('leatherDark',a*.31,.56,cz+.02,.07,.22,.45,.03))},
  globe(w,d){contact(0,0,w+.15,d+.15);[0,1,2].forEach(i=>{const a=i*2.094;beam('darkwood',Math.cos(a)*.22,0,Math.sin(a)*.22,Math.cos(a)*.08,.55,Math.sin(a)*.08,.025)});part(G.torus(.27,.012,Math.PI*2,'gring'),'brass',0,.85,0,{rx:Math.PI/2,ry:.4});sp('globeMap',0,.85,0,.25,.25,.25);sp('leaf2',.08,.95,.12,.12,.08,.1)},
  heirloom(w,d,f){contact(0,0,w+.2,d+.2);box('darkwood',0,0,0,w,.95,d);box('glass',0,.95,0,w-.04,.75,d-.04);box('darkwood',0,1.7,0,w,.05,d);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>box('brass',a*(w/2-.02),.95,b*(d/2-.02),.025,.75,.025));box('brass',0,.95,d/2-.02,w,.02,.02);box('brass',0,1.68,d/2-.02,w,.02,.02);box('bulb',0,1.66,0,w*.6,.02,d*.4);light(0,1.5,.3,0xffe0b8,.4,2.5,'art');
    if(S.version==='y'){box('darkwood',0,.95,0,w*.8,.06,d*.5);[1.12,1.32].forEach((y,i)=>{box('screen',-.02,y,.0,w*.72,.035,.03,{rz:i?.03:-.03});box('charcoal',w*.33,y,0,.2,.04,.035)});[-1,1].forEach(a=>box('darkwood',a*w*.32,.95,0,.05,.42,.1))}
    else{box('red',0,.951,0,w*.85,.008,d*.7);part(G.lathe('chawan',[[0,0],[.06,0],[.07,.02],[.13,.07],[.145,.12],[.13,.12],[0,.03]]),'celadon',-.22,1.0,0);cy('darkwood',-.22,.96,0,.16,.04);rb('gold',.22,.96,0,.16,.16,.16,.02);sp('gold',.22,1.15,0,.05,.05,.05);box('darkwood',.22,.96,.2,.18,.02,.08,{rx:-.5})}},
  ledge(w,d){box('stoneDark',0,-.08,0,w,.08,d);rb('boucle',w*.15,0,.02,w*.5,.05,d-.1,.02);box('coolLed',0,-.09,d/2-.03,w-.1,.01,.015)},
  climbtree(w,d){contact(0,0,w+.3,d+.3);cy('bark',0,0,0,.18,3.2,{},12);[[.5,1.0,0],[-.55,1.6,1.4],[.45,2.2,2.6],[-.4,2.75,4.1]].forEach(([r,y,a])=>{const x=Math.cos(a)*r*1.4,z=Math.sin(a)*r*1.4;beam('bark',0,y-.25,0,x,y,z,.07);cy('oak',x,y,z,.33,.06,{},20);cy('boucle',x,y+.06,z,.29,.04,{},20)});rb('stoneDark',0,0,0,w,.08,d,.03)},
  icepool(w,d){contact(0,0,w+.3,d+.3);const t=.18;[[0,-d/2+t/2,w,t],[0,d/2-t/2,w,t],[-w/2+t/2,0,t,d-2*t],[w/2-t/2,0,t,d-2*t]].forEach(([x,z,a,b])=>box('stoneDark',x,0,z,a,.28,b));box('poolTile',0,0,0,w-2*t,.04,d-2*t);plane('water',0,.18,0,w-2*t,d-2*t);
    for(let i=0;i<5;i++)rb('ice',-w/3+i*w/6,.16,(i%2-.5)*.25,.18+(i%3)*.05,.08,.14,.03,{ry:i});box('coolLed',0,.05,-d/2+t+.01,w-2*t-.1,.03,.01)},
  snowbank(w,d,f){const r=rng(hash(f.id));for(let i=0;i<5;i++)sp('snowCap',(r()-.5)*w*.6,0,(r()-.5)*d*.6,w*(.25+r()*.15),.2+r()*.2,d*(.25+r()*.15));light(0,1.2,0,0x9fd8ff,.6,4.5,'lamp')},
  stairs(w,d,f){const n=16,hh=4.4;for(let i=0;i<n;i++){box('stone',0,i*hh/n,d/2-(i+.5)*d/n,w,hh/n,d/n+.01)}[-1,1].forEach(a=>{box('blackMetal',a*w/2,0,0,.05,hh+1,0.05);box('glass',a*w/2,hh*.5,0,.02,1,d)})}
});

/* ───────── shared scene state ───────── */
const E=window.ESTATE;
const S={renderer:null,scene:null,camera:null,composer:null,ssao:null,bloom:null,fxaa:null,container:null,cb:{},
  world:null,siteRest:null,siteMain:null,forest:null,mountains:null,ground:null,sky:null,hemi:null,sun:null,spot:null,lightPool:[],snow:null,envTex:null,envOK:undefined,
  preset:'dusk',version:'m',quality:'high',level:null,cur:null,cache:{},pos:new T.Vector3(),yaw:0,pitch:0,keys:{},joy:{x:0,y:0},bob:0,
  visible:false,raf:0,clock:new T.Clock(),busy:false,visited:new Set(),lastPlace:null,promptKey:'',water:[],markers:[],fps:[],autoQ:true};
if(matchMedia('(pointer:coarse)').matches)S.quality='low';

const PRESETS={
  day:{top:[.25,.5,.85],hor:[.8,.87,.94],bot:[.85,.88,.9],sun:[.4,.7,.55],sunC:0xfff3e0,sunI:2.2,hemi:.55,env:.9,int:.35,exp:1.0,fog:0xc9d6e2,snowCol:0xf6f8fa},
  dusk:{top:[.06,.1,.24],hor:[.95,.58,.36],bot:[.3,.3,.36],sun:[-.3,.12,.6],sunC:0xffb27a,sunI:1.1,hemi:.24,env:.55,int:1.15,exp:1.05,fog:0x6d6a78,snowCol:0xdadde8},
  night:{top:[.01,.02,.05],hor:[.08,.12,.2],bot:[.05,.06,.08],sun:[.3,.6,-.4],sunC:0x9fb6ff,sunI:.3,hemi:.16,env:.3,int:1.2,exp:1.25,fog:0x10151f,snowCol:0x9aa6bb}
};

function roomAt(L,x,y,indoorOnly){let best=null;for(const r of L.rooms){if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){if(indoorOnly&&!E.indoor(r))continue;if(!best||(E.indoor(r)&&!E.indoor(best))||(r.z==='water'&&best.z!=='water'))best=r}}return best}
function floorFinish(r){const n=r.n;
  if(r.z==='outdoor')return has(n,'중정','정원')?'snow':'deck';
  if(r.z==='water')return 'poolTile';
  if(has(n,'수영장'))return 'stoneTile';
  if(has(n,'욕실','파우더','스파','사우나','화장실'))return 'marbleTile';
  if(has(n,'주방','세탁','린넨','팬트리','식사실'))return 'stoneTile';
  if(has(n,'차고','기계','전기'))return 'concrete';
  if(has(n,'다실','다다미','의례'))return 'tatamiFloor';
  if(has(n,'스노우룸'))return 'stoneTile';
  if(r.z==='core')return 'darkTile';
  if(r.z==='security')return 'concrete';
  if(r.z==='staff')return 'stoneTile';
  if(r.z==='guest'){if(has(n,'대현관','갤러리','회랑','복도','전실'))return 'marbleFloor';return 'walnutFloor'}
  return 'oakFloor';
}
function wallFinish(r){if(!r)return 'extStone';const n=r.n;
  if(r.z==='outdoor'||r.z==='void')return 'extStone';
  if(r.z==='water')return 'tileWall';
  if(has(n,'욕실','파우더','스파','화장실'))return 'marbleWall';
  if(r.z==='family')return 'plasterWarm';
  if(r.z==='guest'){if(has(n,'대현관','연회','다실'))return 'woodPanel';return 'plasterStone'}
  return 'plasterCool';
}
function bigGlass(r){if(!r)return false;const n=r.n;if(has(n,'욕실','화장실','파우더','코트','수납','용품','린넨','세탁','보관','금고','수장고','통제실','기계','승강기','코어','차고','와인','시네마','둘째'))return false;return ['family','guest','water'].includes(r.z)}

/* collected per build */
let HOTS=[],SDOORS=[],LIFTS=[];
function begin(){PARTS=[];LIGHTS=[];COLL=[];HOTS=[];SDOORS=[];LIFTS=[];XF.identity()}
function placeFurn(L,f,gy){
  const c=E.CAT[f.k];if(!c)return;if(f.v&&f.v!==S.version)return;
  const dm=E.fdim(f);const room=roomAt(L,f.x,f.y,false);const H=Math.max(2.6,(L.h||4)-.2);
  setXF(f.x,f.y,f.r,f.e||0);f._c=c;(FURN[f.k]||FURN.default)(dm.w,dm.d,f,{H,room,gy:gy||0});XF.identity();
  if(f.say)HOTS.push({x:f.x,y:f.y,h:(f.e||0)+Math.min(c.h,1.4)+.25,say:f.say,id:f.id,k:f.k});
  if(E.NOCOLL.has(f.k)||(f.e||0)>.9||c.h<.12)return;
  if(f.k==='tree')COLL.push({t:'circ',x:f.x,y:f.y,r:.4});else if(f.k==='lantern')COLL.push({t:'circ',x:f.x,y:f.y,r:.3});
  else COLL.push({t:'obb',x:f.x,y:f.y,hw:dm.w/2,hd:dm.d/2,a:-(f.r||0)*Math.PI/180});
}

/* ───────── interior floors ───────── */
function buildInterior(L){
  begin();
  const H=Math.max(2.6,L.h-0.2),WH=H,isBase=L.elev<0,T2=0.1;
  const inR=(x,y)=>roomAt(L,x,y,true);
  const segs=E.wallSegs(L);const ceils=[];
  L.rooms.forEach(r=>{
    if(r.z==='void')return;XF.identity();
    if(r.z==='water'){
      const deep=r.open?.6:1.4;box('poolTile',r.x+r.w/2,-deep-.12,r.y+r.h/2,r.w,.12,r.h);
      [[r.x+r.w/2,r.y,r.w,.04],[r.x+r.w/2,r.y+r.h,r.w,.04],[r.x,r.y+r.h/2,.04,r.h],[r.x+r.w,r.y+r.h/2,.04,r.h]].forEach(([x,z,w,d])=>box('poolTile',x,-deep,z,w,deep,d));
      const cp=.35;[[r.x+r.w/2,r.y+cp/2,r.w,cp],[r.x+r.w/2,r.y+r.h-cp/2,r.w,cp],[r.x+cp/2,r.y+r.h/2,cp,r.h-2*cp],[r.x+r.w-cp/2,r.y+r.h/2,cp,r.h-2*cp]].forEach(([x,z,w,d])=>box(r.open?'stone':'marble',x,-.06,z,w,.08,d));
      plane('water',r.x+r.w/2,-.12,r.y+r.h/2,r.w-2*cp,r.h-2*cp);if(!r.open||r.w>8)for(let i=1;i<Math.max(2,Math.round(r.w/5));i++)box('poolLight',r.x+i*r.w/Math.max(2,Math.round(r.w/5)),-deep*.55,r.y+cp+.03,.4,.12,.02);COLL.push({t:'rect',x:r.x+cp*.5,y:r.y+cp*.5,w:r.w-cp,h:r.h-cp});return;
    }
    {let rects=[[r.x,r.y,r.w,r.h]];L.rooms.filter(q=>q!==r&&q.z==='water'&&q.x>=r.x-.01&&q.y>=r.y-.01&&q.x+q.w<=r.x+r.w+.01&&q.y+q.h<=r.y+r.h+.01).forEach(q=>{const n=[];rects.forEach(([x,y,w,h])=>{
        if(q.x>=x+w||q.x+q.w<=x||q.y>=y+h||q.y+q.h<=y){n.push([x,y,w,h]);return}
        if(q.y>y)n.push([x,y,w,q.y-y]);if(q.y+q.h<y+h)n.push([x,q.y+q.h,w,y+h-q.y-q.h]);const y1=Math.max(y,q.y),y2=Math.min(y+h,q.y+q.h);
        if(q.x>x)n.push([x,y1,q.x-x,y2-y1]);if(q.x+q.w<x+w)n.push([q.x+q.w,y1,x+w-q.x-q.w,y2-y1])});rects=n.filter(a=>a[2]>.01&&a[3]>.01)});
      rects.forEach(([x,y,w,h])=>box(floorFinish(r),x+w/2,-.12,y+h/2,w,.12,h))}
    if(r.z==='outdoor'){
      if(L.elev>0.5){const edges=[[r.x,r.y,r.x+r.w,r.y,0,-1],[r.x,r.y+r.h,r.x+r.w,r.y+r.h,0,1],[r.x,r.y,r.x,r.y+r.h,-1,0],[r.x+r.w,r.y,r.x+r.w,r.y+r.h,1,0]];
        edges.forEach(([x1,y1,x2,y2,nx,ny])=>{const mx=(x1+x2)/2,my=(y1+y2)/2;if(inR(mx+nx*.3,my+ny*.3))return;const len=Math.hypot(x2-x1,y2-y1);box('glass',mx,0,my,nx?.02:len,1.15,nx?len:.02);box('blackMetal',mx,1.15,my,nx?.06:len,.05,nx?len:.06);COLL.push({t:'seg',x1,y1,x2,y2})})}
      return;
    }
    if(E.indoor(r))ceils.push(r);
  });
  const doorH=d=>({door:2.2,locked:2.2,connect:2.2,service:2.2,story:2.4,main:Math.min(H-.15,3.0),wide:Math.min(H-.15,2.8),glass:Math.min(H-.15,2.9),vehicle:2.7,open:H-.35})[d.k]||2.2;
  const artDone=new Set();
  function face(x1,y1,x2,y2,yb,yt,opts){
    const hor=Math.abs(y1-y2)<1e-6,len=hor?Math.abs(x2-x1):Math.abs(y2-y1);if(len<.01||yt-yb<.01)return;const mx=(x1+x2)/2,my=(y1+y2)/2,ext=.1;
    [1,-1].forEach(sg=>{const nx=hor?0:sg,ny=hor?sg:0;const r=inR(mx+nx*.3,my+ny*.3);const mk=wallFinish(r);XF.identity();
      box(mk,mx+nx*T2/2,yb,my+ny*T2/2,hor?len+ext*2:T2,yt-yb,hor?T2:len+ext*2);
      if(yb<.01&&r&&E.indoor(r)&&!(opts&&opts.noBase)){box(r.z==='guest'?'darkwood':'trimWhite',mx+nx*(T2+.008),0,my+ny*(T2+.008),hor?len:.016,.1,hor?.016:len)}
      if(opts&&opts.art&&r&&E.indoor(r)&&len>3.4&&yt>2.4&&!artDone.has(r.id)&&has(r.n,'라운지','다이닝','응접','현관','침실','선룸','접견','갤러리','스위트','연회','복도')&&r.z!=='core'){
        artDone.add(r.id);XF.makeRotationY(Math.atan2(nx,ny));XF.setPosition(mx+nx*(T2+.02),0,my+ny*(T2+.02));FURN.art(Math.min(2.2,len*.4),.04,{id:r.id});XF.identity()}
    });
  }
  function windowSeg(s,inside,outN){
    const hor=s.y1===s.y2,len=hor?s.x2-s.x1:s.y2-s.y1;const big=bigGlass(inside);const pier=Math.min(.6,len*.2);
    if(len<1.6||!inside||inside.z==='core'||(isBase&&!(outN.north||outN.outdoor))||L.id==='B2'||has(inside.n,'시네마','보관','와인','통제','금고','수장고')){face(s.x1,s.y1,s.x2,s.y2,0,WH,{art:1});return}
    const sill=big?.08:(has(inside.n,'욕실','화장실','파우더')?1.5:.9),head=H-(big?.25:.5);
    const P=t=>hor?[s.x1+t,s.y1]:[s.x1,s.y1+t];const [ax,ay]=P(0),[bx,by]=P(pier),[cx,cy2]=P(len-pier),[dx,dy]=P(len);
    face(ax,ay,bx,by,0,WH);face(cx,cy2,dx,dy,0,WH);face(bx,by,cx,cy2,0,sill,{noBase:big});face(bx,by,cx,cy2,head,WH);
    const ow=len-2*pier,mx=(bx+cx)/2,my=(by+cy2)/2;XF.identity();
    box('glass',mx,sill,my,hor?ow:.02,head-sill,hor?.02:ow);const n=Math.max(1,Math.round(ow/(big?1.5:1.2)));
    for(let i=0;i<=n;i++){const [px,py]=P(pier+i*ow/n);box('blackMetal',px,sill,py,hor?.05:.09,head-sill,hor?.09:.05)}
    box('blackMetal',mx,sill,my,hor?ow:.1,.05,hor?.1:ow);box('blackMetal',mx,head-.05,my,hor?ow:.1,.05,hor?.1:ow);
    if(!big)box(inside.z==='family'?'oak':'stone',mx-outN.nx*.08,sill,my-outN.ny*.08,hor?ow+.1:.2,.03,hor?.2:ow+.1);
    if(big&&has(inside.n,'침실','라운지','스위트','선룸','손님 방','도련님')){const ix=-outN.nx*.22,iy=-outN.ny*.22;
      [[bx,by],[cx,cy2]].forEach(([qx,qy],k)=>{const off=k?-.35:.35;const px=qx+(hor?off:0)+ix,py=qy+(hor?0:off)+iy;for(let j=0;j<4;j++)cy('sheet',px+(hor?(j-1.5)*.12:0),0,py+(hor?0:(j-1.5)*.12),.07,head-.05,{zr:.6},10)});
      box('blackMetal',mx+ix,head-.02,my+iy,hor?ow+1:.02,.02,hor?.02:ow+1)}
  }
  segs.forEach(s=>{const hor=s.y1===s.y2,mx=(s.x1+s.x2)/2,my=(s.y1+s.y2)/2;
    const a=inR(mx+(hor?0:.3),my+(hor?.3:0)),b=inR(mx-(hor?0:.3),my-(hor?.3:0));COLL.push({t:'seg',x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2});
    if(a&&b){face(s.x1,s.y1,s.x2,s.y2,0,WH,{art:1});return}
    const inside=a||b,sg=a?-1:1,nx=hor?0:sg,ny=hor?sg:0;const out=roomAt(L,mx+nx*.3,my+ny*.3,false);
    windowSeg(s,inside,{nx,ny,north:ny<0,outdoor:out&&out.z==='outdoor'})});
  (L.doors||[]).forEach(d=>{
    const hor=d.o==='h',hd=Math.min(doorH(d),WH),x1=hor?d.x-d.w/2:d.x,y1=hor?d.y:d.y-d.w/2,x2=hor?d.x+d.w/2:d.x,y2=hor?d.y:d.y+d.w/2;
    const a=inR(d.x+(hor?0:.3),d.y+(hor?.3:0)),b=inR(d.x-(hor?0:.3),d.y-(hor?.3:0)),any=a||b;if(!any)return;
    if(hd<WH)face(x1,y1,x2,y2,hd,WH,{noBase:1});XF.identity();
    const trim=any.z==='guest'?'darkwood':'trimWhite';
    if(d.k!=='open'){[[x1,y1],[x2,y2]].forEach(([px,py])=>box(trim,px,0,py,hor?.07:.26,hd,hor?.26:.07));box(trim,d.x,hd-.07,d.y,hor?d.w+.14:.26,.07,hor?.26:d.w+.14)}
    if(['door','connect','service','locked'].includes(d.k)){
      const leaf=any.z==='family'?'oak':any.z==='guest'?'walnut':(d.k==='locked'?'steel':'lacquer');const lw=d.w-.04,lh=hd-.04,s=d.s||1;
      if(d.k==='locked'){box(leaf,d.x,0,d.y,hor?lw:.045,lh,hor?.045:lw);box('ledR',d.x+(hor?lw/2-.15:0),1.35,d.y+(hor?.03:lw/2-.15),.05,.08,.05);COLL.push({t:'seg',x1,y1,x2,y2})}
      else if(hor){const hx=d.x-d.w/2+.02;box(leaf,hx+.025,0,d.y-s*lw/2,.045,lh,lw);cy('brass',hx+.06,1.0,d.y-s*(lw-.08),.012,.12,{rx:Math.PI/2})}
      else{const hy=d.y-d.w/2+.02;box(leaf,d.x+s*lw/2,0,hy+.025,lw,lh,.045);cy('brass',d.x+s*(lw-.08),1.0,hy+.06,.012,.12,{rz:Math.PI/2})}
    }else if(d.k==='story'){SDOORS.push({d,hor,hd,x1,y1,x2,y2,coll:COLL.length});COLL.push({t:'seg',x1,y1,x2,y2,story:1})}
    else if(d.k==='glass'){const open=Math.min(1.6,d.w*.4),side=(d.w-open)/2;
      [-1,1].forEach(k=>{const c=k*(open/2+side/2),px=hor?d.x+c:d.x,py=hor?d.y:d.y+c;box('glass',px,0,py,hor?side:.02,hd,hor?.02:side);box('blackMetal',px,0,py,hor?side:.08,.05,hor?.08:side);
        const e1=hor?[d.x+k*open/2,d.y]:[d.x,d.y+k*open/2],e2=hor?[d.x+k*d.w/2,d.y]:[d.x,d.y+k*d.w/2];box('blackMetal',e1[0],0,e1[1],.06,hd,.06);COLL.push({t:'seg',x1:e1[0],y1:e1[1],x2:e2[0],y2:e2[1]})});
      box('blackMetal',d.x,hd-.05,d.y,hor?d.w:.08,.05,hor?.08:d.w);
    }else if(d.k==='main'){const lw=d.w/2-.03,s=-(d.s||1);
      [-1,1].forEach(k=>{if(hor){XF.makeRotationY(k*s*1.0);XF.setPosition(d.x+k*(d.w/2-.02),0,d.y);box('darkwood',-k*lw/2,0,0,lw,hd-.04,.07);box('brass',-k*(lw-.12),.5,.05,.03,1.2,.03)}
        else{XF.makeRotationY(-k*s*1.0);XF.setPosition(d.x,0,d.y+k*(d.w/2-.02));box('darkwood',0,0,-k*lw/2,.07,hd-.04,lw);box('brass',.05,.5,-k*(lw-.12),.03,1.2,.03)}XF.identity()});
    }else if(d.k==='vehicle')box('steel',d.x,hd-.35,d.y,hor?d.w:.3,.35,hor?.3:d.w);
  });
  // lifts
  L.rooms.filter(r=>r.z==='core').forEach(r=>{
    XF.identity();const ds=(L.doors||[]).filter(d=>d.x>=r.x-.05&&d.x<=r.x+r.w+.05&&d.y>=r.y-.05&&d.y<=r.y+r.h+.05);
    const corners=[[r.x,r.y,1,1],[r.x+r.w,r.y,-1,1],[r.x,r.y+r.h,1,-1],[r.x+r.w,r.y+r.h,-1,-1]];
    let best=corners[0],bd=-1;corners.forEach(c=>{const md=ds.length?Math.min(...ds.map(d=>Math.hypot(d.x-c[0],d.y-c[1]))):9;if(md>bd){bd=md;best=c}});
    const ew=Math.min(2.4,r.w-.3),ed=Math.min(2.2,r.h*.45);const cx=best[0]+best[2]*(ew/2+.1),cz=best[1]+best[3]*(ed/2+.1);
    const alongY=r.h>=r.w;const fx=alongY?0:best[2],fz=alongY?best[3]:0;
    box('steel',cx,0,cz,ew,WH,ed);const dw=Math.min(1.1,(alongY?ew:ed)*.55);
    box('chrome',cx+fx*(ew/2+.005),0,cz+fz*(ed/2+.005),alongY?dw:.01,2.2,alongY?.01:dw);
    box(r.owner==='family'?'ledG':'bulb',cx+fx*(ew/2+.02)+(alongY?dw/2+.15:0),1.2,cz+fz*(ed/2+.02)+(alongY?0:dw/2+.15),.05,.08,.05);
    COLL.push({t:'rect',x:cx-ew/2-.05,y:cz-ed/2-.05,w:ew+.1,h:ed+.1});
    if(E.LIFTS[r.owner]){const px=cx+fx*(ew/2+1.0),py=cz+fz*(ed/2+1.0);LIFTS.push({owner:r.owner,x:px,y:py,yaw:Math.atan2(fx,-fz),room:r})}
  });
  // ceilings
  ceils.forEach(r=>{XF.identity();box('ceiling',r.x+r.w/2,H,r.y+r.h/2,r.w,.08,r.h);
    const coveR=has(r.n,'라운지','침실','선룸','스위트','다이닝','응접','현관','갤러리','연회','도련님','서재')&&H>2.8&&r.w>2.4&&r.h>2.4;const hc=coveR?H-.3:H;
    const sx=r.w>4?Math.max(2,Math.round(r.w/2.6)):1,sz=r.h>4?Math.max(2,Math.round(r.h/2.6)):1;
    for(let i=0;i<sx;i++)for(let j=0;j<sz;j++){const x=r.x+(i+.5)*r.w/sx,z=r.y+(j+.5)*r.h/sz;cy('downlight',x,hc-.014,z,.07,.012,{},16);cy('chrome',x,hc-.01,z,.095,.008,{},16);LIGHTS.push({p:new T.Vector3(x,hc-.25,z),c:r.z==='family'?0xffcf98:0xffe2c0,i:1.1,d:6,k:'down'})}
    if(coveR){const y=H-.32,i=.3;[[r.x+r.w/2,r.y+i,r.w-2*i,.04],[r.x+r.w/2,r.y+r.h-i,r.w-2*i,.04],[r.x+i,r.y+r.h/2,.04,r.h-2*i],[r.x+r.w-i,r.y+r.h/2,.04,r.h-2*i]].forEach(([x,z,w,d])=>box('cove',x,y,z,w,.02,d));box('ceiling',r.x+r.w/2,H-.3,r.y+r.h/2,r.w-2*i-.3,.3,r.h-2*i-.3)}
    if(has(r.n,'라운지','선룸','식사실','높은 방')){const n=Math.floor(r.w/1.6);for(let i=1;i<n;i++)box('oak',r.x+i*r.w/n,H-.22,r.y+r.h/2,.14,.22,r.h-.1)}
  });
  L.furn.forEach(f=>placeFurn(L,f,0));
  const res={group:mergeParts(),colls:COLL,lights:LIGHTS,hots:HOTS,lifts:LIFTS,sdoors:[]};
  // story doors: separate pivots
  SDOORS.forEach(sd=>{const d=sd.d;PARTS=[];XF.identity();const lw=d.w-.04;
    if(sd.hor){box('darkwood',lw/2,0,0,lw,sd.hd-.04,.06);box('brass',lw-.1,.9,.05,.03,.4,.03);box('ledR',lw-.1,1.4,.05,.04,.04,.02)}else{box('darkwood',0,0,lw/2,.06,sd.hd-.04,lw);box('brass',.05,.9,lw-.1,.03,.4,.03);box('ledR',.05,1.4,lw-.1,.02,.04,.04)}
    const g=mergeParts();const piv=new T.Group();piv.position.set(sd.hor?d.x-d.w/2+.02:d.x,0,sd.hor?d.y:d.y-d.w/2+.02);piv.add(g);res.group.add(piv);
    res.sdoors.push({piv,hor:sd.hor,x:d.x,y:d.y,say:d.say,coll:res.colls[sd.coll],open:false,t:0})});
  return res;
}

/* ───────── site ───────── */
function hipRoofGeo(w,d,h){const key=`hip${w.toFixed(1)}_${d.toFixed(1)}_${h.toFixed(1)}`;if(GC[key])return GC[key];
  const x=w/2,z=d/2,r=Math.min(w,d)/2,rx=Math.max(0,x-r),rz=Math.max(0,z-r);
  const v=[[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z],[-rx,h,-rz],[rx,h,-rz],[rx,h,rz],[-rx,h,rz]];const idx=[0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4,0,1,2,0,2,3];
  const pos=[];idx.forEach(i=>pos.push(...v[i]));const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();return GC[key]=g}
const MAINR=()=>E.levels.site.rooms.filter(r=>/^s-m[123]$/.test(r.id));
function building(r,main){
  const trad=r.z==='trad'||r.roof==='hip';const H=r.b,cx=r.x+r.w/2,cz=r.y+r.h/2;const others=main?MAINR().filter(q=>q!==r):[];
  box('darkTile',cx,0,cz,r.w+.4,.6,r.h+.4);box(trad?'plasterWarm':'extStone',cx,.6,cz,r.w,H-.6,r.h);
  const fh=H>9?3.8:Math.max(3,H-1.4),nf=Math.max(1,Math.floor((H-.6)/fh));const fr=trad?'darkwood':'blackMetal';
  [[r.x,r.y,r.x+r.w,r.y,0,-1],[r.x,r.y+r.h,r.x+r.w,r.y+r.h,0,1],[r.x,r.y,r.x,r.y+r.h,-1,0],[r.x+r.w,r.y,r.x+r.w,r.y+r.h,1,0]].forEach(([x1,y1,x2,y2,nx,ny])=>{
    const hor=ny!==0,len=hor?x2-x1:y2-y1,sp=trad?2.4:3.0,n=Math.floor(len/sp);if(n<1)return;const step=len/n;
    for(let f=0;f<nf;f++){
      if(!trad&&f>0)box('stone',hor?(x1+x2)/2:x1+nx*.08,.6+f*fh-.12,hor?y1+ny*.08:(y1+y2)/2,hor?len+.1:.18,.2,hor?.18:len+.1);
      for(let i=0;i<n;i++){const t=(i+.5)*step,px=hor?x1+t:x1,pz=hor?y1:y1+t;
        if(others.some(q=>px+nx*.6>q.x&&px+nx*.6<q.x+q.w&&pz+ny*.6>q.y&&pz+ny*.6<q.y+q.h))continue;
        if(main&&r.id==='s-m1'&&ny===1&&f===0&&Math.abs(px-120)<5.5)continue;
        const ww=trad?1.3:Math.min(2.3,step-.7),wh=trad?1.5:fh-1.05,wy=.6+f*fh+(trad?1.0:.45);const lit=(hash(r.id+'_'+f+'_'+i)%10)<5;
        const ox=px+nx*.035,oz=pz+ny*.035;box(lit?'winGlow':'winDim',ox,wy,oz,hor?ww:.03,wh,hor?.03:ww);
        box(fr,ox+nx*.03,wy-.06,oz+ny*.03,hor?ww+.16:.08,.08,hor?.08:ww+.16);box(fr,ox+nx*.03,wy+wh-.02,oz+ny*.03,hor?ww+.16:.08,.08,hor?.08:ww+.16);
        [-1,0,1].forEach(k=>box(fr,ox+nx*.03+(hor?k*ww/2:0),wy,oz+ny*.03+(hor?0:k*ww/2),hor?(k?.08:.04):.08,wh,hor?.08:(k?.08:.04)));
        if(!trad)box('stone',ox+nx*.08,wy-.14,oz+ny*.08,hor?ww+.3:.22,.08,hor?.22:ww+.3)}}
    if(trad){for(let t=0;t<=len+.01;t+=2.4){const px=hor?x1+t:x1+nx*.06,pz=hor?y1+ny*.06:y1+t;box('darkwood',px,.6,pz,.24,H-.6,.24)}box('darkwood',hor?(x1+x2)/2:x1+nx*.06,H-.55,hor?y1+ny*.06:(y1+y2)/2,hor?len:.22,.3,hor?.22:len);box('darkwood',hor?(x1+x2)/2:x1+nx*.06,.6,hor?y1+ny*.06:(y1+y2)/2,hor?len:.22,.25,hor?.22:len)}
  });
  if(trad){const rh=Math.min(r.w,r.h)*.3;part(hipRoofGeo(r.w+2.8,r.h+2.8,rh),'roofTile',cx,H,cz);part(hipRoofGeo(r.w+2.2,r.h+2.2,rh*.92),'snowCap',cx,H+.16,cz)}
  else{box('roofDark',cx,H,cz,r.w+5.2,.35,r.h+5.2);part(hipRoofGeo(r.w+5.2,r.h+5.2,main?2.6:1.6),'roofTile',cx,H+.35,cz);part(hipRoofGeo(r.w+4.6,r.h+4.6,main?2.4:1.45),'snowCap',cx,H+.5,cz)}
}
function buildSite(){
  const L=E.levels.site;
  // pass 1: everything except the main building
  begin();
  L.rooms.forEach(r=>{XF.identity();
    if(r.z==='road'){box('deck',r.x+r.w/2,-.1,r.y+r.h/2,r.w,.12,r.h);return}
    if(r.z==='water'){const cp=.6;box('blackCeramic',r.x+r.w/2,0,r.y+r.h/2,r.w-cp,.02,r.h-cp);
      [[r.x+r.w/2,r.y+cp/2,r.w,cp],[r.x+r.w/2,r.y+r.h-cp/2,r.w,cp],[r.x+cp/2,r.y+r.h/2,cp,r.h-2*cp],[r.x+r.w-cp/2,r.y+r.h/2,cp,r.h-2*cp]].forEach(([x,z,w,d])=>box('stone',x,-.02,z,w,.26,d));
      plane('water',r.x+r.w/2,.12,r.y+r.h/2,r.w-2*cp+.04,r.h-2*cp+.04);COLL.push({t:'rect',x:r.x+.3,y:r.y+.3,w:r.w-.6,h:r.h-.6});return}
    if(r.walk){box('walnutFloor',r.x+r.w/2,-.08,r.y+r.h/2,r.w,.12,r.h);const hor=r.w>r.h,len=hor?r.w:r.h;
      for(let t=0;t<=len+.01;t+=2.25){[-1,1].forEach(k=>{const px=hor?r.x+t:r.x+r.w/2+k*(r.w/2-.15),pz=hor?r.y+r.h/2+k*(r.h/2-.15):r.y+t;box('darkwood',px,0,pz,.2,3,.2);COLL.push({t:'circ',x:px,y:pz,r:.15})})}
      part(hipRoofGeo(r.w+1.4,r.h+1.4,1.1),'roofTile',r.x+r.w/2,3,r.y+r.h/2);part(hipRoofGeo(r.w+1,r.h+1,1),'snowCap',r.x+r.w/2,3.1,r.y+r.h/2);
      for(let t=1.1;t<len;t+=4.5){const px=hor?r.x+t:r.x+r.w/2,pz=hor?r.y+r.h/2:r.y+t;box('bulb',px,2.75,pz,.18,.25,.18);LIGHTS.push({p:new T.Vector3(px,2.6,pz),c:0xffc27a,i:.7,d:5,k:'lamp'})}return}
    if(r.b&&!/^s-m[123]$/.test(r.id)){building(r,false);COLL.push({t:'rect',x:r.x-.3,y:r.y-.3,w:r.w+.6,h:r.h+.6})}
  });
  // estate wall
  L.estateWall.forEach(([a,b,c,d])=>{const hor=b===d,len=Math.hypot(c-a,d-b);XF.identity();box('extStone',(a+c)/2,0,(b+d)/2,hor?len+.6:.6,2.4,hor?.6:len+.6);
    part(hipRoofGeo(hor?len+1.2:1.2,hor?1.2:len+1.2,.35),'roofTile',(a+c)/2,2.4,(b+d)/2);part(hipRoofGeo(hor?len+.9:.9,hor?.9:len+.9,.3),'snowCap',(a+c)/2,2.47,(b+d)/2);COLL.push({t:'seg',x1:a,y1:b,x2:c,y2:d})});
  // gate
  const g=L.gate;[-1,1].forEach(k=>{const px=120+k*4.6;box('darkwood',px,0,237,.55,5.4,.55);COLL.push({t:'circ',x:px,y:237,r:.4});
    XF.makeRotationY(k*-1.25);XF.setPosition(120+k*4.3,0,237.3);box('darkwood',-k*2,0,0,4,4.6,.12);for(let i=0;i<4;i++)box('blackMetal',-k*(.6+i*.9),.4,.08,.05,3.8,.05);XF.identity()});
  box('darkwood',120,5.1,237,10.6,.4,.6);part(hipRoofGeo(13,6,1.8),'roofTile',120,5.5,237);part(hipRoofGeo(12.2,5.4,1.65),'snowCap',120,5.62,237);
  [-1,1].forEach(k=>{box('bulb',120+k*4.6,4.2,236.6,.3,.45,.3);LIGHTS.push({p:new T.Vector3(120+k*4.6,4,235.8),c:0xffbe73,i:1.1,d:7,k:'lamp'})});
  L.furn.forEach(f=>placeFurn(L,f,-.02));
  const rest={group:mergeParts(),colls:COLL,lights:LIGHTS,hots:HOTS};
  // pass 2: main building + entrance
  begin();
  L.rooms.filter(r=>/^s-m[123]$/.test(r.id)).forEach(r=>{building(r,true);COLL.push({t:'rect',x:r.x-.3,y:r.y-.3,w:r.w+.6,h:r.h+.6})});
  box('deck',141,4.35,97,14,.2,6);box('snowCap',141,4.55,97,13.6,.04,5.6);[[141,94,14,.02],[134,97,.02,6],[148,95,.02,2]].forEach(([x,z,w,d])=>{box('glass',x,4.55,z,w,1.1,d);box('blackMetal',x,5.65,z,Math.max(w,.05),.05,Math.max(d,.05))});
  box('winGlow',141,4.6,99.9,4,2.6,.04);
  const c=L.canopy;box('roofDark',c.x+c.w/2,4.3,c.y+c.d/2,c.w,.45,c.d);box('snowCap',c.x+c.w/2,4.75,c.y+c.d/2,c.w-.2,.1,c.d-.2);
  [[c.x+.4,c.y+c.d-.4],[c.x+c.w-.4,c.y+c.d-.4]].forEach(([x,z])=>{box('darkwood',x,0,z,.4,4.3,.4);COLL.push({t:'circ',x,y:z,r:.3})});
  for(let i=0;i<3;i++){const x=c.x+c.w*(i+1)/4;cy('downlight',x,4.29,c.y+c.d/2,.08,.01);LIGHTS.push({p:new T.Vector3(x,3.9,c.y+c.d/2),c:0xffd4a0,i:1.2,d:7,k:'down'})}
  box('winGlow',120,.5,140.03,4.2,3.2,.05);[-1,1].forEach(k=>{XF.makeRotationY(k*.6);XF.setPosition(120+k*2.05,0,140.1);box('darkwood',-k*1.0,.5,0,2,3.1,.1);XF.identity()});
  const main={group:mergeParts(),colls:COLL,lights:LIGHTS};
  return {rest,main};
}

/* ───────── sky / mountains / forest / snow ───────── */
function skyMat(){return new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new T.Color()},hor:{value:new T.Color()},bot:{value:new T.Color()},sunDir:{value:new T.Vector3()},sunC:{value:new T.Color()}},
  vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top,hor,bot,sunDir,sunC;varying vec3 vD;void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=h>0.?mix(hor,top,pow(clamp(h,0.,1.),.5)):mix(hor,bot,pow(clamp(-h*3.,0.,1.),.6));float s=max(dot(d,normalize(sunDir)),0.);c+=sunC*(pow(s,900.)*4.+pow(s,10.)*.18);gl_FragColor=vec4(c,1.);}'})}
function applySky(m,P){m.uniforms.top.value.setRGB(...P.top);m.uniforms.hor.value.setRGB(...P.hor);m.uniforms.bot.value.setRGB(...P.bot);m.uniforms.sunDir.value.set(...P.sun);m.uniforms.sunC.value.set(P.sunC)}
function mountains(){const g=new T.Group();const r=rng(77);
  const geoFor=(rad,h)=>{const geo=new T.ConeGeometry(rad,h,11,6,true);const p=geo.attributes.position;const cols=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){const y=p.getY(i)+h/2,t=y/h;const j=(1-t)*rad*.18;p.setX(i,p.getX(i)+(r()-.5)*j);p.setZ(i,p.getZ(i)+(r()-.5)*j);p.setY(i,p.getY(i)+(r()-.5)*h*.04*(1-t));
      const snow=t>.42-r()*.18;const k=snow?.95+r()*.05:.32+r()*.12;cols[i*3]=k*(snow?1:.9);cols[i*3+1]=k*(snow?1:.95);cols[i*3+2]=k*(snow?1.03:1.05)}
    geo.setAttribute('color',new T.BufferAttribute(cols,3));geo.computeVertexNormals();return geo};
  const m=new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.95});
  [[120,-330,170,230],[-90,-300,140,170],[320,-290,150,190],[-260,-220,130,130],[500,-230,140,150],[210,-250,90,110],[10,-240,85,100],[-400,-90,160,140],[640,-80,160,150]].forEach(([x,z,rad,h])=>{const me=new T.Mesh(geoFor(rad,h),m);me.position.set(x,h/2-6,z);g.add(me)});return g}
function forest(){const r=rng(31),N=700;
  const trunk=new T.InstancedMesh(new T.CylinderGeometry(.18,.25,2,6),mat('bark'),N),crown=new T.InstancedMesh(new T.ConeGeometry(2.2,6,8),mat('pine'),N),cap=new T.InstancedMesh(new T.ConeGeometry(1.4,2.6,8),mat('snowCap'),N);
  const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),p=new T.Vector3();let k=0;
  while(k<N){const x=-120+r()*480,z=-150+r()*520;if(x>0&&x<240&&z>36&&z<244)continue;const sc=.8+r()*1.2;q.setFromAxisAngle(_v.set(0,1,0),r()*6);s.set(sc,sc,sc);
    m.compose(p.set(x,1*sc,z),q,s);trunk.setMatrixAt(k,m);m.compose(p.set(x,4.5*sc,z),q,s);crown.setMatrixAt(k,m);m.compose(p.set(x,6.6*sc,z),q,s);cap.setMatrixAt(k,m);k++}
  const g=new T.Group();[trunk,crown,cap].forEach(i=>{i.receiveShadow=true;g.add(i)});return g}
function snowPoints(L,site){const [bx,by,bw,bh]=L.bounds;const n=S.quality==='high'?5000:2200;const pos=new Float32Array(n*3),sp=new Float32Array(n);const r=rng(5);
  for(let i=0;i<n;i++){let x,z,t=0;do{x=bx-30+r()*(bw+60);z=by-30+r()*(bh+60);t++}while(t<20&&(site?false:roomAt(L,x,z,true)));pos[i*3]=x;pos[i*3+1]=(L.elev<0?0:-L.elev)+r()*30;pos[i*3+2]=z;sp[i]=.6+r()*.9}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));const pts=new T.Points(g,new T.PointsMaterial({color:0xffffff,size:site?.12:.09,transparent:true,opacity:.9,depthWrite:false}));pts.userData={sp,base:(L.elev<0?0:-L.elev),top:30};return pts}

/* ───────── renderer ───────── */
function init(container){
  const R=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  R.outputEncoding=T.sRGBEncoding;R.toneMapping=T.ACESFilmicToneMapping;R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;
  S.renderer=R;S.container=container;container.appendChild(R.domElement);R.domElement.className='real-canvas';
  S.camera=new T.PerspectiveCamera(66,1,.08,1100);S.scene=new T.Scene();
  S.sky=new T.Mesh(new T.SphereGeometry(900,32,16),skyMat());S.scene.add(S.sky);
  S.hemi=new T.HemisphereLight(0xdfe8ff,0x8a7a66,.4);S.scene.add(S.hemi);
  S.sun=new T.DirectionalLight(0xffffff,1);S.sun.castShadow=true;S.sun.shadow.bias=-.0004;S.sun.shadow.normalBias=.03;S.scene.add(S.sun,S.sun.target);
  for(let i=0;i<14;i++){const pl=new T.PointLight(0xffd6a0,0,7,2);S.lightPool.push(pl);S.scene.add(pl)}
  S.spot=new T.SpotLight(0xffdcb0,0,9,1.25,1,2);S.spot.castShadow=true;S.spot.shadow.mapSize.set(1024,1024);S.spot.shadow.bias=-.0006;S.spot.shadow.camera.near=.2;S.spot.shadow.camera.far=9;S.scene.add(S.spot,S.spot.target);
  S.world=new T.Group();S.scene.add(S.world);
  S.mountains=mountains();S.world.add(S.mountains);S.forest=forest();S.world.add(S.forest);
  const ground=new T.Mesh(new T.PlaneGeometry(1800,1800),mat('snow').clone());ground.material.map=TEX.snow().clone();ground.material.map.repeat.set(280,280);ground.material.map.needsUpdate=true;ground.rotation.x=-Math.PI/2;ground.position.set(120,-.02,120);ground.receiveShadow=true;S.ground=ground;S.world.add(ground);
  S.markerMat=new T.SpriteMaterial({map:TEX.radial(),color:0xffd59a,transparent:true,depthWrite:false,opacity:.9});
  bindInput();
  new ResizeObserver(resize).observe(container);window.addEventListener('resize',resize);
}
function setupPost(){
  S.composer=null;S.ssao=null;if(S.quality!=='high'||!T.EffectComposer||!T.SSAOPass)return;
  const R=S.renderer,w=S.container.clientWidth,h=S.container.clientHeight;const comp=new T.EffectComposer(R);
  const ssao=new T.SSAOPass(S.scene,S.camera,w,h);ssao.kernelRadius=.55;ssao.minDistance=.00002;ssao.maxDistance=.0016;ssao.kernelSize=24;comp.addPass(ssao);S.ssao=ssao;
  if(T.UnrealBloomPass){S.bloom=new T.UnrealBloomPass(new T.Vector2(w,h),.32,.5,.86);comp.addPass(S.bloom)}
  comp.addPass(new T.ShaderPass({uniforms:{tDiffuse:{value:null},vig:{value:.24}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform sampler2D tDiffuse;uniform float vig;varying vec2 vUv;vec3 toS(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 s=toS(clamp(c.rgb,0.,1.));float d=distance(vUv,vec2(.5));s*=1.-vig*smoothstep(.35,.85,d);gl_FragColor=vec4(s,1.);}'}));
  if(T.FXAAShader){const fx=new T.ShaderPass(T.FXAAShader);comp.addPass(fx);S.fxaa=fx}
  S.composer=comp;resize();
}
function resize(){if(!S.renderer||!S.container)return;const w=Math.max(50,S.container.clientWidth),h=Math.max(50,S.container.clientHeight);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,S.quality==='high'?1.5:1.25));S.renderer.setSize(w,h,false);S.camera.aspect=w/h;S.camera.fov=w/h<.8?84:(w/h<1.2?74:66);S.camera.updateProjectionMatrix();
  if(S.composer){S.composer.setSize(w,h);if(S.fxaa)S.fxaa.uniforms.resolution.value.set(1/(w*S.renderer.getPixelRatio()),1/(h*S.renderer.getPixelRatio()))}}
function envWorks(envTex){try{const R=S.renderer,rt=new T.WebGLRenderTarget(8,8);const sc=new T.Scene();const m=new T.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:.4,envMap:envTex});
  sc.add(new T.Mesh(new T.SphereGeometry(1,16,12),m));const cam=new T.OrthographicCamera(-1,1,1,-1,.1,10);cam.position.z=5;R.setRenderTarget(rt);R.render(sc,cam);const px=new Uint8Array(256);R.readRenderTargetPixels(rt,0,0,8,8,px);R.setRenderTarget(null);
  let sum=0;for(let i=0;i<px.length;i+=4)sum+=px[i]+px[i+1]+px[i+2];rt.dispose();m.dispose();return sum>200}catch(e){return false}}
function applyPreset(){
  const P=PRESETS[S.preset];applySky(S.sky.material,P);S.scene.fog=new T.Fog(P.fog,160,800);S.hemi.intensity=P.hemi;S.hemi.color.set(S.preset==='day'?0xe6eeff:0xc9cde0);S.hemi.groundColor.set(0xa08060);
  S.sun.color.set(P.sunC);S.sun.intensity=P.sunI;S.renderer.toneMappingExposure=P.exp;S.ground.material.color.set(P.snowCol);
  const pm=new T.PMREMGenerator(S.renderer);const es=new T.Scene();const sk=new T.Mesh(new T.SphereGeometry(10,32,16),skyMat());applySky(sk.material,P);es.add(sk);
  const panel=new T.Mesh(new T.PlaneGeometry(6,3),new T.MeshBasicMaterial({color:new T.Color(1.6,1.45,1.25),side:T.DoubleSide}));panel.position.set(0,6,0);panel.rotation.x=Math.PI/2;es.add(panel);
  const fl=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshBasicMaterial({color:new T.Color(.35,.3,.26)}));fl.rotation.x=-Math.PI/2;fl.position.y=-3;es.add(fl);
  if(S.envTex)S.envTex.dispose();S.envTex=pm.fromScene(es,.04).texture;pm.dispose();if(S.envOK===undefined)S.envOK=envWorks(S.envTex);
  S.scene.environment=S.envOK?S.envTex:null;if(!S.envOK){S.hemi.intensity=P.hemi*1.8;Object.values(MAT).forEach(m=>{if(m.isMeshStandardMaterial&&m.metalness>.3){m.metalness=.3;m.roughness=Math.max(m.roughness,.35)}})}
  Object.values(MAT).forEach(m=>{if(m.isMeshStandardMaterial){m.envMapIntensity=(m.opacity<1?1.6:1)*P.env;m.needsUpdate=true}});
  Object.keys(MAT).forEach(k=>{const d=MD[k];if(d&&d.emissive!==undefined&&!d.keepShadow){MAT[k].emissiveIntensity=(d.ei||1)*(S.preset==='day'&&['downlight','cove','shade','bulb','winGlow'].includes(k)?.45:1)}});
  placeSun();S.lastLightUpdate=0;
}
function placeSun(){const P=PRESETS[S.preset],L=S.level;if(!L)return;const site=L.id==='site';const [bx,by,bw,bh]=site?[60,60,140,140]:L.bounds;const c=new T.Vector3(bx+bw/2,0,by+bh/2);const d=new T.Vector3(...P.sun).normalize();
  S.sun.position.copy(c).addScaledVector(d,site?220:120);S.sun.target.position.copy(c);const ext=Math.max(bw,bh)*.62+6;Object.assign(S.sun.shadow.camera,{left:-ext,right:ext,top:ext,bottom:-ext,near:20,far:site?480:260});S.sun.shadow.camera.updateProjectionMatrix();
  const sz=S.quality==='high'?4096:2048;if(S.sun.shadow.mapSize.x!==sz){S.sun.shadow.mapSize.set(sz,sz);if(S.sun.shadow.map){S.sun.shadow.map.dispose();S.sun.shadow.map=null}}}

/* ───────── level loading ───────── */
function siteBuilt(){const k='site|'+S.version;if(!S.cache[k])S.cache[k]=buildSite();return S.cache[k]}
function levelBuilt(id){const k=id+'|'+S.version;if(!S.cache[k])S.cache[k]=buildInterior(E.levels[id]);return S.cache[k]}
function load(id,sp){
  const L=E.levels[id];S.level=L;const site=id==='site';const sb=siteBuilt();
  if(S.cur&&S.cur.group&&S.cur.group.parent)S.cur.group.parent.remove(S.cur.group);
  if(S.siteRestG)S.world.remove(S.siteRestG);if(S.siteMainG)S.world.remove(S.siteMainG);
  S.siteRestG=sb.rest.group;S.siteMainG=sb.main.group;S.world.add(S.siteRestG);
  if(site){S.world.add(S.siteMainG);S.world.position.set(0,0,0);
    S.cur={group:null,colls:sb.rest.colls.concat(sb.main.colls),lights:sb.rest.lights.concat(sb.main.lights),hots:sb.rest.hots,lifts:[],sdoors:[],site:true}}
  else{const b=levelBuilt(id);S.scene.add(b.group);S.cur=b;S.world.position.set(-92,L.elev<0?0:-L.elev,-100);S.siteRestG.visible=L.elev>=0}
  S.siteRestG.visible=site||L.elev>=0;
  // markers
  S.markers.forEach(m=>S.scene.remove(m));S.markers=(S.cur.hots||[]).map(h=>{const s=new T.Sprite(S.markerMat);s.position.set(h.x,h.h,h.y);s.scale.set(.16,.16,.16);s.userData.h=h;S.scene.add(s);return s});
  if(S.snow){S.scene.remove(S.snow);S.snow.geometry.dispose()}S.snow=snowPoints(L,site);S.scene.add(S.snow);
  placeSun();
  // spawn
  let x=sp.x,y=sp.y,yaw=sp.yaw||0;
  if(sp.lift){const lf=S.cur.lifts.find(l=>l.owner===sp.lift);if(lf){x=lf.x;y=lf.y;yaw=lf.yaw}}
  S.pos.set(x,1.62,y);S.yaw=yaw;S.pitch=-.04;S.lastPlace=null;S.promptKey='';S.lastLightUpdate=0;
  if(S.cb.onLevel)S.cb.onLevel(L);
}
function go(id,sp){if(S.busy)return;S.busy=true;if(S.cb.onBusy)S.cb.onBusy(true);
  setTimeout(()=>{try{load(id,sp)}catch(e){console.error(e);if(S.cb.onError)S.cb.onError(e)}
    setTimeout(()=>{S.busy=false;if(S.cb.onBusy)S.cb.onBusy(false)},120)},S.renderer?260:0)}

/* ───────── movement & collision ───────── */
function walkable(x,y){
  const L=S.level;if(!L||!S.cur)return false;let inside=false;
  if(L.id==='site'){for(const [a,b,w,h] of L.walk)if(x>=a&&x<=a+w&&y>=b&&y<=b+h){inside=true;break}}
  else for(const r of L.rooms){if(r.z==='void')continue;if(x>=r.x+.15&&x<=r.x+r.w-.15&&y>=r.y+.15&&y<=r.y+r.h-.15){inside=true;break}}
  if(!inside)return false;const rad=.28;
  for(const c of S.cur.colls){
    if(c.off)continue;
    if(c.t==='seg'){const dx=c.x2-c.x1,dy=c.y2-c.y1,l2=dx*dx+dy*dy||1;let t=((x-c.x1)*dx+(y-c.y1)*dy)/l2;t=clamp(t,0,1);const px=c.x1+t*dx,py=c.y1+t*dy;if((x-px)**2+(y-py)**2<(rad+.1)**2)return false}
    else if(c.t==='rect'){if(x>c.x-rad&&x<c.x+c.w+rad&&y>c.y-rad&&y<c.y+c.h+rad)return false}
    else if(c.t==='circ'){if((x-c.x)**2+(y-c.y)**2<(c.r+rad)**2)return false}
    else if(c.t==='obb'){const ca=Math.cos(-c.a),sa=Math.sin(-c.a),lx=(x-c.x)*ca-(y-c.y)*sa,ly=(x-c.x)*sa+(y-c.y)*ca;if(Math.abs(lx)<c.hw+rad*.8&&Math.abs(ly)<c.hd+rad*.8)return false}
  }
  return true;
}
function updateLights(force){
  const now=performance.now();if(!force&&now-(S.lastLightUpdate||0)<250)return;S.lastLightUpdate=now;
  const P=PRESETS[S.preset],list=S.cur?S.cur.lights:[],n=S.quality==='high'?14:7;
  const scored=list.map(l=>({l,d:(l.p.x-S.pos.x)**2+(l.p.z-S.pos.z)**2+(l.p.y-1.6)**2*.3})).map(s=>(s.d/=(s.l.k==='down'?1:.45),s)).sort((a,b)=>a.d-b.d).slice(0,n);
  const sd=scored.find(s=>s.l.k==='down');if(sd&&S.level.id!=='site'){S.spot.position.copy(sd.l.p);S.spot.position.y+=.2;S.spot.target.position.set(sd.l.p.x,0,sd.l.p.z);S.spot.intensity=1.1*P.int}else S.spot.intensity=0;
  S.lightPool.forEach((pl,k)=>{const s=scored[k];if(!s||k>=n){pl.intensity=0;return}pl.position.copy(s.l.p);pl.color.set(s.l.c);pl.distance=s.l.d;pl.userData.base=s.l.i*P.int*(S.level.id==='site'?1.3:1);pl.userData.flick=s.l.k==='fire';pl.intensity=pl.userData.base});
}
function nearby(){
  // place & story
  const L=S.level,x=S.pos.x,y=S.pos.z;let place=null;
  if(L.id==='site'){place=(L.zones||[]).find(z=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h)||null}
  else place=roomAt(L,x,y,false);
  const pid=place?place.id:'_none';
  if(pid!==S.lastPlace){S.lastPlace=pid;if(S.cb.onPlace)S.cb.onPlace(L,place);
    if(place&&place.say){const key=S.version+':'+place.id;if(!S.visited.has(key)){S.visited.add(key);if(S.cb.onStory)S.cb.onStory(place.say,'room')}}}
  // story doors
  (S.cur.sdoors||[]).forEach(sd=>{if(!sd.open&&Math.hypot(sd.x-x,sd.y-y)<3.2){sd.open=true;sd.coll.off=true;if(S.cb.onStory&&sd.say)S.cb.onStory(sd.say,'door')}});
  // prompts
  const out=[];const fw=new T.Vector2(Math.sin(S.yaw),-Math.cos(S.yaw));
  (L.portals||[]).forEach(p=>{if(Math.hypot(p.x-x,p.y-y)<p.r)out.push({type:'portal',label:p.label,to:p.to,sp:p.sp,key:'p'+p.label})});
  (S.cur.lifts||[]).forEach(l=>{if(Math.hypot(l.x-x,l.y-y)<2.3)out.push({type:'lift',label:'승강기 타기',owner:l.owner,floors:E.LIFTS[l.owner].filter(f=>f!==L.id),key:'l'+l.owner})});
  let bh=null,bd=9;(S.cur.hots||[]).forEach(h=>{const dx=h.x-x,dy=h.y-y,d=Math.hypot(dx,dy);if(d>2.6)return;const dot=(dx*fw.x+dy*fw.y)/(d||1);if(d>.9&&dot<.35)return;if(d<bd){bd=d;bh=h}});
  if(bh)out.push({type:'hot',label:bh.say.t+' 살펴보기',say:bh.say,key:'h'+bh.id,x:bh.x,y:bh.y,h:bh.h});
  const key=out.map(o=>o.key).join('|');if(key!==S.promptKey){S.promptKey=key;if(S.cb.onPrompts)S.cb.onPrompts(out)}
}
let nearT=0;
const wrapA=a=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a};
function cancelAuto(){if(!S.auto)return;S.auto=null;if(S.cb.onManual)S.cb.onManual()}
function lookAngles(t){const dx=t[0]-S.pos.x,dz=t[1]-S.pos.z;return {yaw:Math.atan2(dx,-dz),pitch:Math.atan2((t[2]!==undefined?t[2]:1.4)-1.62,Math.max(.3,Math.hypot(dx,dz)))}}
function doorize(pts){const L=S.level;if(!L||L.id==='site'||!L.doors)return pts;const out=[];let a=[S.pos.x,S.pos.z];
  pts.forEach(b=>{const hits=[];L.doors.forEach(d=>{if(d.k==='locked')return;const hor=d.o==='h';const ca=hor?a[1]-d.y:a[0]-d.x,cb=hor?b[1]-d.y:b[0]-d.x;if(ca*cb>=0)return;
      const t=ca/(ca-cb),along=hor?a[0]+(b[0]-a[0])*t:a[1]+(b[1]-a[1])*t,c=hor?d.x:d.y;if(Math.abs(along-c)>d.w/2+.35)return;
      const sg=Math.sign(cb),off=Math.min(1.0,Math.max(.7,d.w*.45)),cen=d.k==='open'||d.w>2.6?Math.max(c-d.w/2+.5,Math.min(c+d.w/2-.5,along)):c;
      hits.push({t,cx:hor?cen:d.x,cy:hor?d.y:cen,p1:hor?[cen,d.y-sg*off]:[d.x-sg*off,cen],p2:hor?[cen,d.y+sg*off]:[d.x+sg*off,cen],off})});
    hits.sort((x,y)=>x.t-y.t).forEach(h=>{while(out.length&&Math.hypot(out[out.length-1][0]-h.cx,out[out.length-1][1]-h.cy)<h.off+.15)out.pop();out.push(h.p1,h.p2)});
    if(!(hits.length&&Math.hypot(b[0]-hits[hits.length-1].cx,b[1]-hits[hits.length-1].cy)<hits[hits.length-1].off-.05))out.push(b);a=b});
  const last=pts[pts.length-1];if(out.length&&(out[out.length-1][0]!==last[0]||out[out.length-1][1]!==last[1]))out.push(last);
  return out.filter((p,i)=>{const q=i?out[i-1]:[S.pos.x,S.pos.z];return Math.hypot(p[0]-q[0],p[1]-q[1])>.12})}
function buildCurve(pts){pts=doorize(pts);
  const P=[[S.pos.x,S.pos.z]].concat(pts);const clean=[P[0]];P.slice(1).forEach(p=>{const l=clean[clean.length-1];if(Math.hypot(p[0]-l[0],p[1]-l[1])>.05)clean.push(p)});
  if(clean.length<2)return null;const v=clean.map(p=>new T.Vector3(p[0],0,p[1]));
  const curve=clean.length===2?new T.LineCurve3(v[0],v[1]):new T.CatmullRomCurve3(v,false,'centripetal',.5);curve.arcLengthDivisions=Math.max(200,Math.round(curve.getLength?curve.getLength()*20:200));
  return {curve,len:curve.getLength()}}
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
function stepAuto(dt){const A=S.auto;
  if(A.pts){A.path=buildCurve(A.pts);A.pts=null;A.s=0;
    if(A.path){const q=A.path.curve.getPointAt(Math.min(1,.6/A.path.len));A.hold=Math.abs(wrapA(Math.atan2(q.x-S.pos.x,-(q.z-S.pos.z))-S.yaw))>1.1}}
  const look=A.look?lookAngles(A.look):null;
  if(A.path&&A.s<A.path.len){const L=A.path.len,cv=A.path.curve;
    const ahead=cv.getPointAt(Math.min(1,(A.s+1.3)/L)),here=cv.getPointAt(Math.min(1,A.s/L));
    let hd=Math.hypot(ahead.x-here.x,ahead.z-here.z)>.05?Math.atan2(ahead.x-here.x,-(ahead.z-here.z)):S.yaw;
    const rem=L-A.s;let pt=-.04;
    if(look){const w=smooth(1-rem/Math.min(3,L));hd=hd+wrapA(look.yaw-hd)*w;pt=pt+(look.pitch-pt)*w}
    const dy=wrapA(hd-S.yaw);S.yaw+=dy*Math.min(1,dt*(A.hold?3.2:4.2));S.pitch+=(pt-S.pitch)*Math.min(1,dt*2.5);
    if(A.hold){if(Math.abs(dy)<.45)A.hold=false;else return}
    const v=A.speed*Math.min(1,Math.sqrt((A.s+.12)/1.1),Math.sqrt((rem+.04)/1.4))*(Math.abs(dy)>.9?.55:1);
    A.s=Math.min(L,A.s+v*dt);const p=cv.getPointAt(A.s/L);S.pos.x=p.x;S.pos.z=p.z;S.bob+=dt*6.5*Math.min(1,v/A.speed);return}
  if(look){const dy=wrapA(look.yaw-S.yaw),dp=look.pitch-S.pitch,k=Math.min(1,dt*3.2);S.yaw+=dy*k;S.pitch+=dp*k;if(Math.abs(dy)>.012||Math.abs(dp)>.012)return}
  S.auto=null;if(A.cb)A.cb()}
function finishAuto(){const A=S.auto;if(!A)return;let last=null;if(A.pts&&A.pts.length)last=A.pts[A.pts.length-1];else if(A.path){const p=A.path.curve.getPointAt(1);last=[p.x,p.z]}if(last){S.pos.x=last[0];S.pos.z=last[1]}if(A.look){const g=lookAngles(A.look);S.yaw=g.yaw;S.pitch=g.pitch}S.auto=null;if(A.cb)A.cb()}
function frame(){
  S.raf=requestAnimationFrame(frame);S.frames=(S.frames||0)+1;if(!S.visible||!S.level)return;const dt=Math.min(.05,S.clock.getDelta()),t=S.clock.elapsedTime;
  const manual=S.keys.KeyW||S.keys.KeyA||S.keys.KeyS||S.keys.KeyD||S.keys.ArrowUp||S.keys.ArrowDown||S.keys.ArrowLeft||S.keys.ArrowRight||Math.hypot(S.joy.x,S.joy.y)>.15;
  if(S.auto&&manual)cancelAuto();
  if(S.auto&&!S.busy)stepAuto(Math.min(.1,dt));
  else if(!S.busy){const k=S.keys;let fw=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0)-S.joy.y,st=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0)+S.joy.x;
    const mag=Math.hypot(fw,st);if(mag>.05){const base=S.level.id==='site'?3.2:2.1;const sp=base*(k.ShiftLeft||k.ShiftRight?1.9:1)*dt/Math.max(1,mag);
      const dx=(Math.sin(S.yaw)*fw+Math.cos(S.yaw)*st)*sp,dz=(-Math.cos(S.yaw)*fw+Math.sin(S.yaw)*st)*sp;
      if(walkable(S.pos.x+dx,S.pos.z+dz)){S.pos.x+=dx;S.pos.z+=dz}else if(walkable(S.pos.x+dx,S.pos.z))S.pos.x+=dx;else if(walkable(S.pos.x,S.pos.z+dz))S.pos.z+=dz;S.bob+=dt*7*Math.min(1,mag)}
    if(k.KeyQ)S.yaw-=dt*1.6;if(k.KeyE&&false)S.yaw+=dt*1.6;}
  const by=Math.sin(S.bob)*.022;S.camera.position.set(S.pos.x,S.pos.y+by,S.pos.z);
  S.camera.lookAt(S.pos.x+Math.sin(S.yaw)*Math.cos(S.pitch),S.pos.y+by+Math.sin(S.pitch),S.pos.z-Math.cos(S.yaw)*Math.cos(S.pitch));
  const nowT=performance.now();if(nowT-nearT>120){nearT=nowT;nearby()}
  updateLights();
  S.lightPool.forEach(pl=>{if(pl.userData.flick)pl.intensity=pl.userData.base*(.8+Math.sin(t*13)*.08+Math.sin(t*7.3)*.1)});
  Object.values(MAT).forEach(m=>{if(m.normalMap&&m.transparent)m.normalMap.offset.set(t*.015,t*.01)});
  (S.cur.sdoors||[]).forEach(sd=>{if(sd.open&&sd.t<1){sd.t=Math.min(1,sd.t+dt*1.3);const e=1-Math.pow(1-sd.t,3);sd.piv.rotation.y=(sd.hor?1:-1)*e*1.45}});
  S.markers.forEach((m,i)=>{const d=Math.hypot(m.position.x-S.pos.x,m.position.z-S.pos.z);m.visible=d<10;const s=.11+Math.sin(t*2.6+i)*.03;m.scale.set(s,s,s)});
  if(S.snow){const a=S.snow.geometry.attributes.position.array,sp=S.snow.userData.sp;for(let i=0;i<sp.length;i++){a[i*3+1]-=sp[i]*dt;a[i*3]+=Math.sin(t+i)*dt*.15;if(a[i*3+1]<S.snow.userData.base)a[i*3+1]=S.snow.userData.base+S.snow.userData.top}S.snow.geometry.attributes.position.needsUpdate=true}
  if(S.composer)S.composer.render();else S.renderer.render(S.scene,S.camera);
  // automatic quality: drop to fast mode if the first seconds are slow
  if(S.autoQ&&S.quality==='high'){S.fps.push(dt);if(S.fps.length>90){const avg=S.fps.reduce((a,b)=>a+b,0)/S.fps.length;S.fps=[];if(avg>.045){S.quality='low';S.composer=null;S.renderer.setPixelRatio(1);resize();placeSun()}else S.autoQ=false}}
  if(S.cb.onFrame)S.cb.onFrame();
}

/* ───────── input ───────── */
function bindInput(){
  const cv=S.renderer.domElement;let drag=null;
  cv.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId)});
  cv.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;if(S.auto&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)cancelAuto();if(S.auto)return;S.yaw+=(e.clientX-drag.x)*.0042;S.pitch=clamp(S.pitch-(e.clientY-drag.y)*.0036,-1.2,1.2);drag.x=e.clientX;drag.y=e.clientY});
  const end=()=>drag=null;cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  cv.addEventListener('wheel',e=>{e.preventDefault();S.camera.fov=clamp(S.camera.fov+e.deltaY*.03,38,80);S.camera.updateProjectionMatrix()},{passive:false});
  window.addEventListener('keydown',e=>{if(!S.visible)return;if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;S.keys[e.code]=true;if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault()});
  window.addEventListener('keyup',e=>{S.keys[e.code]=false});window.addEventListener('blur',()=>S.keys={});
}

/* ───────── public API ───────── */
window.Walk3D={
  init(container,cb){S.cb=cb||{};if(!S.renderer)init(container);S.visible=true;if(!S.raf)frame()},
  start(id,sp,opts){opts=opts||{};if(opts.version)S.version=opts.version;if(opts.preset)S.preset=opts.preset;S.busy=true;if(S.cb.onBusy)S.cb.onBusy(true);
    setTimeout(()=>{try{load(id,sp);applyPreset();setupPost();resize()}catch(e){console.error(e);if(S.cb.onError)S.cb.onError(e)}S.busy=false;if(S.cb.onBusy)S.cb.onBusy(false)},60)},
  go,
  setPreset(p){S.preset=p;applyPreset()},
  setVersion(v){if(v===S.version)return;S.version=v;S.visited.clear();const id=S.level.id,sp={x:S.pos.x,y:S.pos.z,yaw:S.yaw};go(id,sp)},
  teleport(x,y){if(walkable(x,y)){S.pos.x=x;S.pos.z=y;return true}return false},
  look(dx,dy){S.yaw+=dx;S.pitch=clamp(S.pitch+dy,-1.2,1.2)},
  setJoy(x,y){S.joy.x=x;S.joy.y=y},
  state(){return {level:S.level?S.level.id:null,x:S.pos.x,y:S.pos.z,yaw:S.yaw,version:S.version,preset:S.preset}},
  snapshot(){if(S.composer)S.composer.render();else S.renderer.render(S.scene,S.camera);return S.renderer.domElement.toDataURL('image/png')},
  setVisible(v){S.visible=v;if(!v)S.keys={}},
  autoWalk(pts,look,cb,speed){S.auto={pts:(pts||[]).map(p=>p.slice()),look,cb,speed:speed||(S.level&&S.level.id==='site'?3.4:1.9)}},
  finishAuto,cancelAuto(){S.auto=null},
  isAuto(){return !!S.auto},
  findHot(keys){const ks=keys.split('|');let best=null,bd=1e9;(S.cur&&S.cur.hots||[]).forEach(h=>{if(!ks.includes(h.k))return;const d=Math.hypot(h.x-S.pos.x,h.y-S.pos.z);if(d<bd){bd=d;best=h}});return best},
  isBusy(){return S.busy},
  _S:S,_near:()=>nearby()
};
})();
