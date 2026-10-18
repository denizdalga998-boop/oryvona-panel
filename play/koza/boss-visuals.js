'use strict';
window.KozaBossVisuals=(()=>{
 function draw(g,b,image,atlas,reduced,low){const r=atlas.rects[4+b.index],scale=b.size/Math.max(r[2],r[3]),w=r[2]*scale,h=r[3]*scale,t=reduced?0:b.age,gait=reduced?0:b.walk,lift=b.lift;
 // Ground plane stays fixed while height changes the apparent body scale and shadow.
 g.save();g.translate(b.x,b.y);g.fillStyle='#031e2859';g.beginPath();g.ellipse(0,h*.32,w*(.36-lift*.002),h*.13,0,0,Math.PI*2);g.fill();
 if(!reduced)for(const e of b.echoes){g.strokeStyle='#c7f7d4';g.globalAlpha=e.life*.35;g.lineWidth=2;g.beginPath();g.ellipse(e.x-b.x,e.y-b.y+h*.3,(1-e.life)*38+12,(1-e.life)*14+5,0,0,Math.PI*2);g.stroke();}g.globalAlpha=1;
 g.translate(0,-lift);const breath=1+Math.sin(t*2.2)*.018;g.scale(breath*(1+lift*.001),2-breath);g.rotate(b.index===2?Math.sin(t*1.2)*.045:b.index===3?Math.sin(t)*.03:0);
 const rows=low?4:8,cols=low?4:6,charge=b.charge>0,hit=b.recoil>0;
 // Shared vertices keep the image continuous as feet, wings and tail deform.
 function point(u,v){let x=(u-.5)*w,y=(v-.5)*h;if(!reduced){
 if(b.index===0){const leg=Math.max(0,(v-.6)/.4);y+=Math.sin(gait+u*9)*3*leg;x+=Math.cos(gait+u*9)*leg+Math.sin(t*1.4)*2*Math.max(0,(.34-v)/.34);}
 if(b.index===1){const edge=Math.max(0,(Math.abs(u-.5)-.25)/.25);y+=Math.sin(gait*1.2+v*10+u*3)*3*edge;x+=(u-.5)*(charge?3:Math.sin(t*1.7));}
 if(b.index===2){const edge=Math.max(0,(Math.abs(u-.5)-.15)/.35),side=u<.5?-1:1,fold=b.action?.55:.82+.18*Math.sin(t*4);x-=side*edge*w*(1-fold)*.23;y+=edge*Math.cos(t*4)*6;}
 if(b.index===3){x+=Math.sin(t*2.2-v*6)*w*.035*(.35+v);y+=Math.cos(t*2-v*4)*2;}}
 return {x,y};}
 function triangle(src,dst,sx,sy,sw,sh,x,y,cw,ch){const [a,b,c]=src,[p,q,rp]=dst,dx1=b.x-a.x,dy1=b.y-a.y,dx2=c.x-a.x,dy2=c.y-a.y,det=dx1*dy2-dx2*dy1,A=((q.x-p.x)*dy2-(rp.x-p.x)*dy1)/det,B=((q.y-p.y)*dy2-(rp.y-p.y)*dy1)/det,C=(dx1*(rp.x-p.x)-dx2*(q.x-p.x))/det,D=(dx1*(rp.y-p.y)-dx2*(q.y-p.y))/det;
 const cx=(p.x+q.x+rp.x)/3,cy=(p.y+q.y+rp.y)/3,expand=v=>{const d=Math.hypot(v.x-cx,v.y-cy)||1;return {x:v.x+(v.x-cx)/d*.65,y:v.y+(v.y-cy)/d*.65};},ep=expand(p),eq=expand(q),er=expand(rp);g.save();g.beginPath();g.moveTo(ep.x,ep.y);g.lineTo(eq.x,eq.y);g.lineTo(er.x,er.y);g.closePath();g.clip();g.transform(A,B,C,D,p.x-A*a.x-C*a.y,p.y-B*a.x-D*a.y);g.drawImage(image,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);g.restore();}
 if(reduced)g.drawImage(image,r[0],r[1],r[2],r[3],-w/2,-h/2,w,h);else for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const u=col/cols,v=row/rows,un=(col+1)/cols,vn=(row+1)/rows,x=(u-.5)*w,y=(v-.5)*h,cw=w/cols,ch=h/rows,src=[{x,y},{x:x+cw,y},{x:x+cw,y:y+ch},{x,y:y+ch}],dst=[point(u,v),point(un,v),point(un,vn),point(u,vn)],args=[r[0]+u*r[2],r[1]+v*r[3],r[2]/cols,r[3]/rows,x,y,cw,ch];triangle([src[0],src[1],src[2]],[dst[0],dst[1],dst[2]],...args);triangle([src[0],src[2],src[3]],[dst[0],dst[2],dst[3]],...args);}

 if(charge||hit){g.globalAlpha=hit?.65:.25+Math.sin(t*8)*.1;g.fillStyle=b.index===3?'#b8e8ff':'#ffdf91';g.beginPath();g.ellipse(0,-h*.12,w*.11,h*.08,0,0,Math.PI*2);g.fill();}g.restore();
 }
 return {draw};
})();
