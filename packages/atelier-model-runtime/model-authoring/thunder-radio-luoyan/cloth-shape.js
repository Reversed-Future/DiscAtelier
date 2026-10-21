// Curved folds follow the loose bundles in the tray reference. Distances are cm.
// Each curve has an independent width, height and shoulder, so the surface has
// broad slack pockets separated by narrow creases rather than repeated ribs.
const curves=[
 [[-5.75,7.2],[-4.6,6.0],[-5.2,4.4],[-3.85,4.9],.19,.36],
 [[-5.7,6.8],[-5.5,6.0],[-4.0,6.8],[-2.8,5.75],.30,.24],
 [[-3.3,7.55],[-2.9,6.4],[-1.6,6.25],[-.4,6.8],.26,.23],
 [[5.7,7.4],[4.3,7.2],[4.9,5.7],[3.75,5.6],.14,.40],
 [[5.75,6.7],[5.0,5.8],[4.0,6.5],[3.9,4.4],.28,.28],
 [[5.7,2.5],[4.5,3.2],[4.6,1.0],[3.75,.7],.29,.25],
 [[5.7,-.7],[5.3,-1.4],[4.2,-.2],[3.72,-1.5],.13,.24],
 [[5.7,-6.8],[4.7,-5.7],[5.0,-4.9],[3.8,-4.4],.24,.32],
 [[5.5,-7.5],[4.2,-6.4],[3.5,-7.7],[2.8,-5.7],.13,.38],
 [[2.0,-7.5],[1.2,-6.7],[.6,-6.0],[-1.1,-6.8],.35,.24],
 [[-5.7,-7.1],[-4.5,-6.2],[-3.8,-7.5],[-3.6,-5.5],.18,.42],
 [[-5.6,-6.4],[-5.9,-5.4],[-4.1,-5.6],[-3.8,-3.7],.30,.30],
 [[-5.7,-4.9],[-4.6,-4.4],[-5.2,-3.6],[-4.1,-3.1],.13,.30],
 [[-5.75,.1],[-4.5,-.5],[-5.0,1.1],[-3.78,1.8],.25,.28]
];

function bezier(a,b,c,d,t){const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;}
const paths=curves.map(([a,b,c,d,width,height])=>({width,height,points:Array.from({length:49},(_,i)=>{
 const t=i/48;return [bezier(a[0],b[0],c[0],d[0],t),bezier(a[1],b[1],c[1],d[1],t)];
})}));

export function clothHeight(x,y){
 let height=.08*Math.sin(x*.85+y*.47)+.055*Math.cos(y*1.35-x*.23)+.03*Math.sin(x*2.3+y*1.9);
 for(const {points,width,height:rise}of paths){
  let closest=Infinity,along=0,signed=0;
  for(let i=0;i<points.length-1;i++){
   const [ax,ay]=points[i],[bx,by]=points[i+1],dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
   const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length));
   const ex=x-ax-t*dx,ey=y-ay-t*dy,distance=ex*ex+ey*ey;
   if(distance<closest){closest=distance;along=(i+t)/(points.length-1);signed=(ex*dy-ey*dx)/Math.sqrt(length);}
  }
  const taper=1-.8*Math.pow(along,6),w=width*(1+.45*Math.sin(along*4));
  const tip=Math.exp(-closest/(w*w*9));
  height+=rise*taper*tip*(Math.exp(-Math.pow((signed-w*.35)/w,2))-.85*Math.exp(-Math.pow((signed+w*.75)/(w*.55),2)));
 }
 return 2.36+.39*Math.tanh(height/.39);
}

export function floorHeight(u,v,floor){
 const envelope=Math.pow(Math.sin(Math.PI*u)*Math.sin(Math.PI*v),.65);
 const billow=.14*(1+Math.sin(u*10+v*7+.7*Math.sin(v*8)));
 const cross=.095*(1+Math.sin(v*14-u*6));
 return floor-envelope*(.018+billow+cross);
}

// The upper lip is loose and wavy; the cavity below still clears the cassette.
export function lipRadius(x,y){return .18+.08*Math.sin(x*1.8+y*.75)+.045*Math.sin(y*2.4-x);}
