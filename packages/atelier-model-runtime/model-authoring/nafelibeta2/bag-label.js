import {THREE} from './surfaces.js';

// Complete label corners measured on the 1600 px source-photo inspection.
// Sample the original photograph without replacing or regenerating its text.
export function bagLabelGeometry(){
 const [a,b,c,d]=[[154,1103],[970,1087],[978,1382],[143,1399]];
 const dx=b[0]-c[0],ex=d[0]-c[0],sx=a[0]-b[0]+c[0]-d[0];
 const dy=b[1]-c[1],ey=d[1]-c[1],sy=a[1]-b[1]+c[1]-d[1];
 const det=dx*ey-ex*dy,g=(sx*ey-ex*sy)/det,h=(dx*sy-sx*dy)/det;
 const geometry=new THREE.PlaneGeometry(8.4,3.2,32,16),uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++){
  const u=uv.getX(i),v=1-uv.getY(i),w=1+g*u+h*v;
  const x=((b[0]-a[0]+g*b[0])*u+(d[0]-a[0]+h*d[0])*v+a[0])/w;
  const y=((b[1]-a[1]+g*b[1])*u+(d[1]-a[1]+h*d[1])*v+a[1])/w;
  uv.setXY(i,x/1600,1-y/1600);
 }
 return geometry;
}
