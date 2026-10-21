import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const auth = require('../packages/netease-sidecar/auth.cjs');
test('QR flow uses documented fields, returns only image/key and bounds polling states', async () => {
  const calls=[];
  const api={
    login_qr_key:async args=>{calls.push(args);return {body:{code:200,data:{unikey:'key'}}};},
    login_qr_create:async args=>{assert.equal(args.key,'key');assert.equal(args.platform,'web');return {body:{code:200,data:{qrimg:'data:image/png;base64,dGVzdA==',qrurl:'unused'}}};},
    login_qr_check:async args=>{assert.equal(args.noCookie,true);return {body:{code:802,cookie:'must-not-forward',nickname:'unused'}};},
  };
  assert.deepEqual(await auth.start(api),{key:'key',image:'data:image/png;base64,dGVzdA=='});
  assert.deepEqual(calls[0].cookie,{});
  assert.deepEqual(await auth.check(api,'key'),{code:802});
  api.login_qr_check=async()=>({body:{code:803,cookie:'MUSIC_U=secret; Path=/'}});
  assert.equal((await auth.check(api,'key')).cookie,'MUSIC_U=secret; Path=/');
  api.login_qr_check=async()=>({body:{code:502,message:'private details'}});
  await assert.rejects(auth.check(api,'key'), e=>e.code==='NETEASE_AUTH'&&!e.message.includes('private'));
});
test('account projection keeps only nickname and ID; expired credentials remain distinct from network errors', async()=>{
  const api={login_status:async args=>{
    assert.equal(args.cookie,'MUSIC_U=secret');
    return {body:{data:{code:200,profile:{userId:42,nickname:'Name',email:'private',avatarUrl:'private'},cookie:'private'}}};
  }};
  assert.deepEqual(await auth.status(api,'MUSIC_U=secret'),{loggedIn:true,userId:42,nickname:'Name'});
  api.login_status=async()=>({body:{data:{code:200,profile:null}}});
  assert.deepEqual(await auth.status(api,'MUSIC_U=secret'),{loggedIn:false});
  api.login_status=async()=>({body:{data:{code:502}}});
  await assert.rejects(auth.status(api,'MUSIC_U=secret'), e=>e.code==='NETEASE_AUTH');
});
