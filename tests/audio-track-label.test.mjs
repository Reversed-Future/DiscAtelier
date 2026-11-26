import test from 'node:test';
import assert from 'node:assert/strict';
import { audioTrackLabel, channelsLabel, codecLabel, languageLabel } from '../apps/desktop/src/playback/audioTrackLabel.ts';

const track = (extra = {}) => ({
  id: 4352, title: '', language: '', codec: '', channels: null, ...extra,
});

test('Blu-ray generic track names become language + layout + codec', () => {
  assert.equal(
    audioTrackLabel(track({ title: '轨道 1 - [日语]', language: 'jpn', codec: 'DTS-HD Master Audio', channels: 6 })),
    '日语 · 5.1 环绕 · DTS-HD MA',
  );
  assert.equal(
    audioTrackLabel(track({ id: 4353, title: '轨道 2 - [日语]', language: 'jpn', codec: 'DTS-HD Master Audio', channels: 2 })),
    '日语 · 2.0 立体声 · DTS-HD MA',
  );
  assert.equal(
    audioTrackLabel(track({ title: '', language: 'eng', codec: 'DTS-HD Master Audio', channels: 6 })),
    '英语 · 5.1 环绕 · DTS-HD MA',
  );
});

test('authored descriptions survive while generic VLC names are dropped', () => {
  assert.equal(
    audioTrackLabel(track({ title: 'Voice Guide', language: 'jpn', codec: 'DTS-HD Master Audio', channels: 2 })),
    'Voice Guide · 日语 · 2.0 立体声 · DTS-HD MA',
  );
  assert.equal(
    audioTrackLabel(track({ title: 'Japanese', language: 'jpn', codec: 'DTS', channels: 2 })),
    '日语 · 2.0 立体声 · DTS',
  );
  assert.equal(audioTrackLabel(track({ title: '轨道 4 - [日语]' })), '日语');
  assert.equal(audioTrackLabel(track({ title: '' })), '音轨 4352');
});

test('language, channel and codec labels cover common Blu-ray values', () => {
  assert.equal(languageLabel('jpn'), '日语');
  assert.equal(languageLabel('eng'), '英语');
  assert.equal(languageLabel('fra'), '法语');
  assert.equal(languageLabel(''), '');
  assert.equal(channelsLabel(1), '单声道');
  assert.equal(channelsLabel(6), '5.1 环绕');
  assert.equal(channelsLabel(8), '7.1 环绕');
  assert.equal(codecLabel('DTS-HD High Resolution Audio'), 'DTS-HD HRA');
  assert.equal(codecLabel('Dolby Digital Plus'), 'DD+');
  assert.equal(codecLabel('A52 Audio (aka AC3)'), 'AC3');
  assert.equal(codecLabel('LPCM Audio'), 'LPCM');
});
