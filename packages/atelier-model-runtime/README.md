# Atelier model runtime

Private, locally vendored v2 runtime from the user's AtelierPublisher project.
`upstream.json` records exact original file hashes. No collection content, credentials
or authoring server is included. Three.js retains its MIT license in `vendor`.

Local integration changes: v2-only public adapter, non-interactive shelf mode,
React-owned controls instead of upstream inline UI, modifier-key handling and
on-demand shelf rendering, bounded four-way texture loading, cancellation during
loading, and drawing the first complete frame before resolving mount. Texture
resolution, filtering, anisotropy, renderer quality and lighting remain unchanged.
Shader preparation includes the pinned renderer's transmission variants and
program reflection before drawing. PCFShadowMap is selected up front: this Three
version already replaced the old PCFSoftShadowMap with PCFShadowMap at first draw.
This preserves the effective shadow algorithm and avoids invalidating precompiled
programs. Shader error checks remain enabled. Recheck prepare-renderer.js against
renderTransmissionPass and the program wrapper API when updating Three. Generic animation,
reading framing and authored action/return tracks remain upstream code. The overview
camera uses a straight-on, centered presentation aligned with the cover; reset restores that overview after
assembly. A live session can toggle interactivity without remounting. Drawing-buffer
size uses the host layout dimensions rather than CSS travel transforms.
An optional lossless preview capture copies the current drawing buffer without
creating another WebGL context. The desktop schedules and bounds this cache.

The adapter is the only desktop entry point. A model is data, never an executable
plugin. Full upstream validation runs in a disposable worker before rendering.
