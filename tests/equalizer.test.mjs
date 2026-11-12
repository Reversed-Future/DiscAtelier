import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_PROFILES, EQ_BANDS, activeProfile, allProfiles, defaultEqualizer, profileState,
} from '../apps/desktop/src/playback/equalizer.ts';

test('built-in equalizer profiles have ten bounded bands', () => {
  assert.equal(EQ_BANDS.length, 10);
  assert.equal(BUILTIN_PROFILES.length, 8);
  for (const profile of BUILTIN_PROFILES) {
    assert.equal(profile.bands.length, 10);
    assert.ok(profile.bands.every(value => value >= -12 && value <= 12));
  }
});

test('default equalizer is disabled flat and profile selection enables it', () => {
  const flat = defaultEqualizer();
  assert.equal(flat.enabled, false);
  assert.equal(activeProfile(flat).id, 'flat');
  const rock = profileState(flat, 'rock');
  assert.equal(rock.enabled, true);
  assert.equal(rock.activeProfile, 'rock');
  assert.deepEqual(rock.bands, BUILTIN_PROFILES.find(value => value.id === 'rock').bands);
  assert.notEqual(rock.bands, BUILTIN_PROFILES.find(value => value.id === 'rock').bands);
});

test('custom profiles join the quick-switch list', () => {
  const state = { ...defaultEqualizer(), profiles: [{ id: 'custom:1', name: '耳机', preamp: 1, bands: EQ_BANDS.map(() => 1) }] };
  assert.equal(allProfiles(state).length, 9);
  assert.equal(profileState(state, 'custom:1').activeProfile, 'custom:1');
  assert.equal(activeProfile(profileState(state, 'missing')).id, 'flat');
});
