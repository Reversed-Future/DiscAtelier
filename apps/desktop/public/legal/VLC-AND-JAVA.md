# Third-party media runtime

This installation includes:

- VLC 3.0.22 (VideoLAN), licensed under GPL-2.0-or-later and LGPL-2.1-or-later.
  License texts are included in the installed `vlc/` directory (notably `COPYING.txt`,
  `AUTHORS.txt`, and `NEWS.txt`). Corresponding source:
  https://download.videolan.org/pub/videolan/vlc/3.0.22/
- Eclipse Temurin JRE 8.0.504+1, licensed under GPL-2.0 with the Classpath
  Exception. License and notices are included in the installed `jre/` directory
  (`LICENSE`, `NOTICE`, `ASSEMBLY_EXCEPTION`, `THIRD_PARTY_README`). Corresponding source:
  https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u504-b01

These runtimes are used only by DiscAtelier's disc playback features. They are
not added to the system PATH or installed as system-wide applications.
