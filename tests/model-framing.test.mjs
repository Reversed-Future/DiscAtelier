import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../packages/atelier-model-runtime/src/discs/interactive/vendor/three.module.js';
import { fitParts } from '../packages/atelier-model-runtime/src/discs/interactive/model/framing.js';

test('初始陈列正对封面，四边平行且匹配 80% 封面区域；检视仍使用原视角', () => {
  const scene = new THREE.Scene();
  const object = new THREE.Mesh(new THREE.BoxGeometry(4, .3, 4));
  object.position.set(2, 1, -3); scene.add(object);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 150);
  const controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); camera.updateMatrixWorld(); } };
  const viewer = { scene, camera, controls, updateClipping() {} };
  fitParts(viewer, [object], { overview: true });
  const points = [[0,-5],[4,-5],[4,-1],[0,-1]].map(([x,z]) => new THREE.Vector3(x,1.15,z).project(camera));
  const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
  close(points[0].y,points[1].y); close(points[2].y,points[3].y);
  close(points[0].x,points[3].x); close(points[1].x,points[2].x);
  close(points[0].x,-.8); close(points[1].x,.8);
  close(points[0].y,.8); close(points[2].y,-.8);
  fitParts(viewer, [object], { front: true });
  const direction = camera.position.clone().sub(controls.target).normalize();
  close(direction.x/direction.y,.12); close(direction.z/direction.y,.18);
  object.geometry.dispose(); object.material.dispose();
});
