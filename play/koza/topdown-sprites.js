'use strict';
window.KozaTopdown=(()=>{
 const heroes=['lumi','koru','pera'],atlases={};
 const bounds={"koru":[[[87,31,84,172],[337,24,92,179],[598,32,82,171],[851,23,90,180],[1111,32,83,171],[1365,23,88,180]],[[80,242,97,209],[332,236,102,215],[592,242,95,209],[843,236,103,213],[1108,242,93,204],[1360,236,98,215]],[[70,474,111,240],[325,472,116,243],[584,473,109,242],[835,472,118,239],[1099,473,108,239],[1351,472,114,243]],[[50,732,157,275],[308,730,153,277],[558,730,164,277],[817,729,159,278],[1071,730,162,275],[1329,730,158,277]]],"lumi":[[[64,37,138,155],[318,36,139,160],[566,36,138,160],[829,36,139,160],[1078,36,138,160],[1334,36,139,160]],[[57,240,144,188],[313,240,142,191],[567,240,144,191],[825,240,142,186],[1080,240,144,194],[1337,240,141,199]],[[45,462,169,227],[302,459,166,234],[559,460,166,228],[812,460,166,228],[1070,460,166,233],[1324,460,168,224]],[[31,706,190,281],[290,706,188,286],[550,707,187,277],[799,706,187,277],[1057,705,188,286],[1317,706,186,275]]],"pera":[[[40,37,211,143],[319,37,144,143],[587,37,107,145],[802,37,175,143],[1038,37,210,143],[1318,37,146,143]],[[19,209,252,200],[308,209,179,198],[593,209,96,206],[784,209,207,201],[1015,209,253,201],[1304,209,178,198]],[[13,431,266,242],[291,432,214,238],[590,432,100,243],[770,431,233,238],[1011,431,270,241],[1289,431,211,239]],[[13,687,266,290],[287,691,220,282],[582,689,115,289],[764,691,247,285],[1010,687,265,291],[1282,690,219,283]]]};
 // Transparent gameplay atlases are prepared during the build.
 const pending={};
 async function prepare(kind){const image=new Image();image.src=kind+'-topdown-v18.png?v=21'+(retryTag?'&retry='+retryTag:'');await ready(image);const frames=bounds[kind].map(boxes=>{const centers=kind==='pera'?[145,397,640,889,1144,1397]:kind==='lumi'?[132,388,640,900,1156,1412]:[128,384,640,896,1152,1408];const strip=boxes.map(([x,y,w,h],i)=>({x,y,w,h,cx:centers[i]}));return {strip,extent:Math.max(...strip.flatMap(f=>[f.w,f.h])),height:Math.max(...strip.map(f=>f.h))};});return {sheet:image,frames};}
 // v5.14: image.decode() can stay pending on some mobile browsers (background tab,
 // memory pressure). Wait for load/error, then give decode a short bound only.
 let retryTag=0;
 function ready(image){if(typeof image.addEventListener!=='function')return Promise.resolve(image.decode?.());return new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth)return resolve();image.addEventListener('load',resolve,{once:true});image.addEventListener('error',()=>reject(Error('Kahraman görseli yüklenemedi')),{once:true});}).then(()=>Promise.race([image.decode?image.decode().catch(()=>{}):null,new Promise(r=>setTimeout(r,1500))]));}
 // Retry forgets a pending (possibly stuck) request so the next load is real.
 function reset(kind){retryTag=Date.now();if(kind)delete pending[kind];else for(const k of Object.keys(pending))delete pending[k];}
 async function load(kind){if(!kind)return Promise.all(heroes.map(load));if(atlases[kind])return;if(!pending[kind]){const job=prepare(kind).then(a=>{atlases[kind]=a;}).finally(()=>{if(pending[kind]===job)delete pending[kind];});pending[kind]=job;}return pending[kind];}
 function frameIndex(kind,m,reduced){if(reduced)return 0;return kind==='pera'?Math.floor(m.flightPhase/Math.PI*3)%6:Math.floor(m.phase/Math.PI*3)%6;}
 function draw(ctx,kind,stage,m,size,reduced){const atlas=atlases[kind];if(!atlas)return false;const row=atlas.frames[stage],frame=row.strip[frameIndex(kind,m,reduced)],scale=size*(.78+stage*.04)/row.extent,w=frame.w*scale,h=frame.h*scale;
  ctx.save();ctx.rotate(m.heading);
  // Head leads the turn; the displacement tapers continuously into the neck.
  const rows=reduced||Math.abs(m.headTurn)<.005?1:12;
  for(let i=0;i<rows;i++){
   const v=i/rows,next=(i+1)/rows,center=(v+next)/2,weight=Math.max(0,(.42-center)/.42);
   const lead=reduced?0:Math.sin(m.headTurn)*h*.22*weight;
   ctx.drawImage(atlas.sheet,frame.x,frame.y+frame.h*v,frame.w,frame.h/rows,(frame.x-frame.cx)*scale+lead,-row.height*scale/2+h*v,w,h/rows+(rows>1?.3:0));
  }
  ctx.restore();return true;
 }
 function margin(kind,stage,size=88){const row=atlases[kind]?.frames[stage];if(!row)return 62;const scale=size*(.78+stage*.04)/row.extent;let radius=0;for(const f of row.strip){const x=Math.max(Math.abs(f.x-f.cx),Math.abs(f.x+f.w-f.cx))+Math.sin(.26)*f.h*.22;const y=Math.max(row.height/2,Math.abs(f.h-row.height/2));radius=Math.max(radius,Math.hypot(x,y)*scale);}return Math.ceil(radius+3);}
 function edges(kind,stage,m,size=88){const row=atlases[kind]?.frames[stage];if(!row)return {left:40,right:40,top:40,bottom:40};const scale=size*(.78+stage*.04)/row.extent,c=Math.cos(m.heading),s=Math.sin(m.heading);let minX=0,maxX=0,minY=0,maxY=0;for(const f of row.strip){const lead=Math.sin(m.headTurn)*f.h*.22;for(const x of [(f.x-f.cx+Math.min(0,lead))*scale,(f.x+f.w-f.cx+Math.max(0,lead))*scale])for(const y of [-row.height/2*scale,(f.h-row.height/2)*scale]){const rx=x*c-y*s,ry=x*s+y*c;minX=Math.min(minX,rx);maxX=Math.max(maxX,rx);minY=Math.min(minY,ry);maxY=Math.max(maxY,ry);}}return {left:Math.ceil(-minX+2),right:Math.ceil(maxX+2),top:Math.ceil(-minY+2),bottom:Math.ceil(maxY+2)};}
 return {load,reset,draw,frameIndex,margin,edges,has:kind=>!!atlases[kind],get ready(){return Object.keys(atlases).length>0;}};
})();
