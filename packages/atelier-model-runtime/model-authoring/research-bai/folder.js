import {THREE,rounded,polygon,sheet,line} from './geometry.js';
export const cardIds=Array.from({length:14},(_,i)=>'card-'+(i+1));
export function addFolder(root,p,m){
 const folder=p.group('folder',root);folder.rotation.z=Math.PI/2;folder.position.set(0,-.5,.68);
 // 14.3 cm includes the 1 cm index tab: main body 13.3 cm.
 const outline=rounded(13.3,18.8,.14,-9.4);
 sheet(p,folder,'folder-board',outline,m.navy,m.navy,.035);
 sheet(p,folder,'folder-tab',polygon([[6.64,2.4],[7.64,3.4],[7.64,8.4],[6.64,9.4]]),m.navy);
 const cover=p.group('folder-cover',folder);cover.position.set(-6.65,0,.85);
 const coverBoard=p.group('folder-cover-board',cover,false);coverBoard.position.x=6.65;sheet(p,coverBoard,'folder-cover',rounded(13.3,18.8,.18,-9.4),m.navy);
 const emboss=m.navy.clone();emboss.bumpMap=p.textures['folder-emboss'];emboss.bumpScale=.035;p.mesh(coverBoard,'folder-emboss',new THREE.PlaneGeometry(12.6,1.7),emboss,[0,-7.95,.019]);
 // Spine bridges the one centimetre storage depth.
 const spine=p.group('folder-spine',folder,false);spine.position.set(-6.67,0,.43);spine.rotation.y=Math.PI/2;sheet(p,spine,'spine',rounded(.85,18.8,.02,-9.4),m.navy);
 const list=p.group('list',coverBoard);list.position.set(-.15,1.15,.045);sheet(p,list,'list-paper',rounded(7,15.8,.03,-7.9),p.photo('list'),m.orange,.012);
 const label=p.group('label',coverBoard);label.position.set(-.1,3.9,.069);sheet(p,label,'label-paper',rounded(6.5,10.2,.025,-5.1),p.photo('label'),m.white,.012);
 const clip=p.group('clip',coverBoard);clip.position.set(.15,9.2,.1);clip.rotation.z=-.55;
 line(p,clip,'clip-wire',[[.12,-1.3,.01],[.12,.36,.01],[.35,.67,.01],[.62,.37,.01],[.62,-1.32,.01],[.29,-1.66,.01],[-.09,-1.3,.01],[-.09,.15,-.04],[.11,.43,-.04],[.35,.2,-.04],[.35,-1.13,-.04]],.037,m.metal);
 const cards={};
 for(let i=0;i<14;i++){const id=cardIds[i],card=p.group(id,folder);card.position.set(0,0,.1+(13-i)*.026);sheet(p,card,id,rounded(12.9,18.7,.04,-9.35),p.photo(id+'-front'),p.photo(id+'-back'),.026);cards[id]=card;}
 // Two continuous folds bridge the base to the raised retaining face.
 const retainerWall=p.group('folder-retainer',folder);retainerWall.position.set(0,-9.4,0);retainerWall.rotation.x=-Math.PI/2;
 sheet(p,retainerWall,'retainer-fold-strip',polygon([[-6.65,0],[6.65,0],[6.65,-.63],[-6.65,-.63]]),m.navy);
 const retainer=p.group('retainer-face-pivot',retainerWall,false);retainer.position.y=-.63;retainer.rotation.x=-Math.PI/2;
 sheet(p,retainer,'retainer-paper',polygon([[-6.65,0],[6.65,0],[6.1,-8],[-6.1,-8]]),m.navy);
 // An actual slit and semicircular finger cut, without a photographed shadow.
 line(p,retainer,'retainer-slit',[[4.1,-3.45,.025],[4.12,-4.1,.025],[4.2,-4.28,.025],[4.2,-4.95,.025]],.012,new THREE.MeshStandardMaterial({color:'#060d1d',roughness:1}));
 const tongueWall=p.group('folder-tongue',folder);tongueWall.position.set(6.65,-5.4,0);tongueWall.rotation.y=-Math.PI/2;
 sheet(p,tongueWall,'tongue-fold-strip',polygon([[0,-4],[.69,-4],[.69,4],[0,4]]),m.navy);
 const tongue=p.group('tongue-face-pivot',tongueWall,false);tongue.position.x=.69;tongue.rotation.y=-Math.PI/2;
 // The photographed tongue runs the full height of the 8 cm retaining flap.
 // Its unfolded 4 cm width includes the fold strip and the 1.7 cm round latch.
 const edge=4-.69-.85,r=.18,tongueShape=new THREE.Shape();tongueShape.moveTo(0,-4);tongueShape.lineTo(edge-r,-4);tongueShape.quadraticCurveTo(edge,-4,edge,-4+r);tongueShape.lineTo(edge,-.85);tongueShape.absarc(edge,0,.85,-Math.PI/2,Math.PI/2);tongueShape.lineTo(edge,4-r);tongueShape.quadraticCurveTo(edge,4,edge-r,4);tongueShape.lineTo(0,4);tongueShape.closePath();sheet(p,tongue,'tongue-paper',tongueShape,m.navy);
 return {folder,cover,coverBoard,retainer,retainerWall,tongue,tongueWall,cards,list,label,clip};
}

