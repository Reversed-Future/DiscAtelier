'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let ready = false;
// Follow api-enhanced 4.41.1 generateConfig.js for the playback protocol only.
// Search/album reads do not need this key. The Rust host supplies a private TMP.
module.exports = async function songUrl(api, id) {
  if (!ready) {
    try {
      const keyPath = path.join(os.tmpdir(), 'xeapi_public_key');
      let current = {};
      try { current = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch { /* Missing or damaged cache is renewed. */ }
      const { getXeapiPublicKey } = require('@neteasecloudmusicapienhanced/api/util/xeapiKey');
      const key = await getXeapiPublicKey(current, global.deviceId);
      if (!key?.sk) throw new Error('Missing playback public key');
      fs.writeFileSync(keyPath, JSON.stringify(key), 'utf8');
      ready = true;
    } catch {
      throw Object.assign(new Error('Playback initialization failed'), { code: 'NETEASE_PLAYBACK_INIT' });
    }
  }
  try {
    return await api.song_url_v1({ id, level: 'standard', unblock: 'false' });
  } catch (error) {
    // Only carry a numeric upstream status; never forward headers, URLs or cookies.
    throw Object.assign(new Error('Playback request failed'), {
      code: 'NETEASE_PLAYBACK_REQUEST',
      status: Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined,
    });
  }
};
