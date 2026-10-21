'use strict';
const failure = () => Object.assign(new Error('Account request failed'), { code: 'NETEASE_AUTH' });
const options = cookie => ({ cookie: cookie || {}, timestamp: Date.now(), timeout: 15000 });
async function status(api, cookie) {
  const response = await api.login_status(options(cookie));
  const data = response.body?.data;
  if (data?.code === 301 || (data?.code === 200 && data.profile === null)) return { loggedIn: false };
  const profile = data?.profile;
  if (data?.code !== 200 || !Number.isSafeInteger(profile?.userId) || profile.userId <= 0
      || typeof profile.nickname !== 'string' || !profile.nickname || profile.nickname.length > 200) throw failure();
  return { loggedIn: true, userId: profile.userId, nickname: profile.nickname };
}
module.exports = {
  status,
  async start(api) {
    const response = await api.login_qr_key(options());
    const key = response.body?.data?.unikey;
    if (response.body?.code !== 200 || typeof key !== 'string' || !key || key.length > 1024 || /[\s\x00-\x1f]/.test(key)) throw failure();
    const qr = await api.login_qr_create({ ...options(), key, qrimg: true, platform: 'web' });
    const image = qr.body?.data?.qrimg;
    if (qr.body?.code !== 200 || typeof image !== 'string' || image.length > 131072 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)) throw failure();
    return { key, image };
  },
  async check(api, key) {
    const response = await api.login_qr_check({ ...options(), key, noCookie: true });
    const code = response.body?.code;
    if (![800, 801, 802, 803].includes(code)) throw failure();
    // This credential travels only over the private pipe to Rust, never to a webview.
    if (code === 803) {
      const cookie = response.body.cookie;
      if (typeof cookie !== 'string' || !cookie || cookie.length > 16384) throw failure();
      return { code, cookie };
    }
    return { code };
  },
  async logout(api, cookie) { await api.logout(options(cookie)); return {}; },
};
