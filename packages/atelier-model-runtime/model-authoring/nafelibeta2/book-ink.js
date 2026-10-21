import {THREE,print} from './surfaces.js';
import {d} from './dimensions.js';
import {overlayCalibration} from './overlay-calibration.js';
import {paperCoordinates} from './paper-boundaries.js';

// Coordinates are measured in the photographed viewing side, top-left origin.
// Both physical faces sample exactly the same ink, viewed from opposite sides.
export function addBookInk(p,node,index,id){
 const fit=overlayCalibration[id], [sx,sy,shx,shy,tx,ty]=fit.affine;
 const determinant=sx*sy-shx*shy;
 for(const back of [false,true]){
  const mesh=print(p,node,back?'leaf-print-back-'+index:'leaf-print-'+index,d.bookWidth,d.bookHeight,'clear-'+id,[d.bookWidth/2,0,back?-.011:.011],{back});
  mesh.geometry.dispose();mesh.geometry=new THREE.PlaneGeometry(d.bookWidth,d.bookHeight,64,64);
  const uv=mesh.geometry.attributes.uv;
  for(let i=0;i<uv.count;i++){
   const frontX=back?1-uv.getX(i):uv.getX(i);
   const [paperX,paperY]=paperCoordinates('page-'+fit.paper,fit.mirror?frontX:1-frontX,1-uv.getY(i));
   const x=paperX-tx, y=paperY-ty;
   const inputX=(sy*x-shx*y)/determinant,inputY=(-shy*x+sx*y)/determinant;
   uv.setXY(i,fit.mirror?1-inputX:inputX,1-inputY);
  }
  uv.needsUpdate=true;
  // A second DoubleSide face would paint the same ink twice through the film.
  mesh.material.side=THREE.FrontSide;
  mesh.material.opacity=fit.opacity;
  mesh.material.color.setRGB(...fit.inkRgb.map(v=>Math.min(1,v/250)),THREE.SRGBColorSpace);
  mesh.material.onBeforeCompile=shader=>{
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
    'if(any(lessThan(vMapUv,vec2(0.0))) || any(greaterThan(vMapUv,vec2(1.0)))) discard;\n#include <map_fragment>');
  };
  mesh.material.customProgramCacheKey=()=> 'book-ink-bounded-v1';
 }
}
