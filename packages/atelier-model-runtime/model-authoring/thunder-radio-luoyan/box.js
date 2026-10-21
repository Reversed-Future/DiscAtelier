import {THREE} from './surfaces.js';
import {rounded,sheet,polygon,line} from '../research-bai/geometry.js';
import {d} from './dimensions.js';
import {addFlexibleTongue} from './tongue.js';

export function addBox(p,parent,m,holePoints){
 const box=p.group('box',parent),w=d.width,h=d.height,z=d.depth,t=d.paper;
 const back=rounded(w,h+d.header,.06,-h/2);back.holes.push(new THREE.Path(holePoints.map(v=>new THREE.Vector2(...v))));
 const backPrint=new THREE.MeshBasicMaterial({map:p.textures['box-back'],toneMapped:false});
 sheet(p,box,'backboard',back,m.paper,backPrint,t);
 const frame=rounded(w,h,.08,-h/2);frame.holes.push(new THREE.Path(rounded(d.windowWidth,d.windowHeight,.55,-d.windowHeight/2).getPoints(48)));
 const front=p.group('window-frame',box);front.position.z=z;sheet(p,front,'window-paper',frame,m.paper,m.paper,t);
 const glazing=p.mesh(front,'clear-window',new THREE.ShapeGeometry(rounded(d.windowWidth+.14,d.windowHeight+.14,.56,-(d.windowHeight+.14)/2)),m.clear,[0,0,-.035]);glazing.castShadow=false;
 for(const sign of [-1,1])p.box(box,'box-side-'+sign,[t,h,z],[sign*(w-t)/2,0,z/2],m.paper);
 p.box(box,'box-bottom',[w,t,z],[0,-h/2+t/2,z/2],m.paper);
 const flap=p.group('top-flap',box);flap.position.set(0,h/2,z);flap.rotation.x=-Math.PI/2;
 sheet(p,flap,'flap-panel',rounded(w-.12,z-.04,.1,0),m.paper,m.paper,t);
 const tongue=p.group('tongue',flap);tongue.position.y=z-.04;tongue.rotation.x=-Math.PI/2;
 const bendTongue=addFlexibleTongue(p,tongue,m.paper);
 const tabs=[];
 for(const sign of [-1,1]){
  const tab=p.group('side-tab-'+sign,box);tab.position.set(sign*(w/2-t),h/2,0);
  const panel=p.group('tab-panel-'+sign,tab,false);panel.rotation.x=Math.PI/2;
  sheet(p,panel,'tab-paper-'+sign,polygon([[0,.08],[-sign*2.3,.26],[-sign*2.65,z-.3],[0,z-.08]]),m.paper,m.paper,t);tabs.push(tab);
 }
 const crease=new THREE.MeshStandardMaterial({color:'#c6c5c1',roughness:1});
 line(p,flap,'flap-crease',[[-w/2+.15,.02,.022],[0,.02,.022],[w/2-.15,.02,.022]],.012,crease);
 box.traverse(n=>{if(n.userData.modelId==='flap-crease')n.castShadow=false;});
 return {box,flap,tongue,tabs,bendTongue};
}
