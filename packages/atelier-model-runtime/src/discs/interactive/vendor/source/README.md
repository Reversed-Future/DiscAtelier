# Direct-format loaders

Pinned to Three.js **0.186.0**, matching the existing renderer (REVISION 186).
Source: `https://registry.npmjs.org/three/-/three-0.186.0.tgz`, `examples/jsm/`.
Includes GLTFLoader, OBJLoader, MTLLoader, FBXLoader, BufferGeometryUtils,
SkeletonUtils, NURBSCurve, NURBSUtils and fflate 0.8.2.
Three.js and fflate MIT notices are retained alongside these files.

Local changes:

- Bare `three` imports resolve to the existing vendored renderer.
- FBX external images retain exact relative paths; no basename search.
- FBX embedded Blob URLs use the session manager's `sourceObjectURL` hook for disposal.
- FBX compressed arrays decode into a bounded, declared-size output buffer.

`source/resources.js` supplies the manager. Do not use this patched FBX loader
without that resource manager for embedded-texture models.
