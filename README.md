<p align="center"><img src="banner.svg" alt="ROM to PSP" width="100%"></p>

**ROM to PSP** is a single web page that turns your own game dumps into standalone apps for a PSP running custom firmware. Drop in a ROM and you get a ready-to-copy folder with its own icon, background and menu sound on the XMB Memory Stick menu. Pressing X boots straight into the game: no RetroArch menus, no playlists.

Everything runs in your browser. ROMs are never uploaded anywhere.

## Use it

1. Open the page (`docs/index.html`, or the GitHub Pages link once you enable it, see below).
2. Drop one or more ROMs. Check the title. Optionally pick your own **Icon** (small box, 144x80), **Background** (full screen, 480x272) and **Sound** (plays while the game is highlighted). Each is independent; the ✕ goes back to automatic.
3. Press **Build my PSP folders** and download `PSP_Games.zip`.
4. Unzip it and copy the whole **`PSP`** folder onto the Memory Stick's `PSP` folder (merge). It holds `GAME` (your games) **and** `RETROARCH` (the save settings). Copying only the game folders means nothing is saved.
5. In ARK's settings set **Use extra memory** to **Max**. Large games such as Zelda: The Minish Cap (16 MB GBA) crash to a black screen and power the PSP off without it.
6. Open **Game > Memory Stick** on the PSP. Press HOME to quit a game.

Saves (`.srm`) and the automatic resume point (`.state.auto`) are written inside each game's own folder next to its ROM, so every game keeps its own progress. Do not delete them, or `PSP/RETROARCH/retroarch.cfg`.

## Supported systems

Only systems that run well on a PSP-3000 are accepted. Anything else is turned away with a short explanation.

| System | Extensions | Core |
| --- | --- | --- |
| Game Boy Advance | `.gba` | gpSP |
| Super Nintendo | `.sfc` `.smc` `.swc` `.fig` | snes9x2005 |
| NES | `.nes` | FCEUmm |
| Game Boy / Game Boy Color | `.gb` `.gbc` | Gambatte |
| Mega Drive / Genesis, Master System, Game Gear | `.md` `.gen` `.smd` `.sms` `.gg` | PicoDrive |
| PC Engine / TurboGrafx-16 | `.pce` | Mednafen PCE Fast |

Not supported on purpose: N64 (too slow on PSP hardware), PS2, GameCube, Dreamcast and Saturn. For PS1, use the PSP's built-in PS1 support instead.

## How it works

Each game folder is self-contained:

```
PSP/GAME/SONIC_THE_HEDGEHOG_2/
  EBOOT.PBP            launcher with the game's title, icon (144x80) and background (480x272)
  CORE.PBP             the libretro core for that system
  kernel_functions.prx RetroArch helper module that lets the launcher start another executable
  launch.txt           two lines: core file name, ROM file name
  SONIC_THE_HEDGEHOG_2.md   the ROM (its .srm save and .state.auto resume point appear next to it)
PSP/RETROARCH/
  retroarch.cfg        the ONE settings file the cores read: saves next to the ROM, autosave, resume
  savefiles/ savestates/ system/   fallback folders the cores expect
```

The launcher reads `launch.txt`, loads `kernel_functions.prx`, and calls `exitspawn_kernel` with the core as the target and the ROM path as its second argument. That is the same argument layout RetroArch's own Salamander launcher uses, and a RetroArch PSP core treats `argv[1]` as the content to load.

The page builds the `EBOOT.PBP` itself in JavaScript: it writes a `PARAM.SFO`, adds the two PNGs, and appends the prebuilt launcher binary. The zip is written by a small built-in zip writer, so the page has no runtime dependencies.

### Sound

Any MP3, WAV, OGG, M4A or FLAC works. The page decodes it in your browser, lets you choose the start point and previews it, then encodes it to ATRAC3 (132 kbps, stereo) as `SND0.AT3` inside `EBOOT.PBP`. The PSP limit is about 29 s / 500 KB, so longer clips are cut. A ready-made `.at3` is used as it is. The encoder (`src/at3.js`) is written from scratch for this project; its output decodes cleanly in FFmpeg, but it has **not been tried on real hardware yet**. If a PSP refuses the sound, leave Sound empty or supply an `.at3` made with Sony's tools.

### Artwork

When the page is served over http(s) with internet access, it looks up the matching title screen and gameplay screenshot from the [libretro-thumbnails](https://github.com/libretro-thumbnails) repositories, using the ROM's filename (No-Intro naming works best). If nothing matches, or you are offline, it draws a title card instead. **Own picture** lets you use any image. Pages hosted in sandboxes that block outside requests will always use the generated card.

## Repo layout

```
docs/index.html        the built, self-contained site (what GitHub Pages serves)
src/template.html      page markup, styles and UI code
src/lib.js             PBP, SFO and zip writers, EBOOT self-check, system and extension tables
src/at3.js             ATRAC3 encoder for SND0.AT3
src/launcher/          C source of the PSP launcher (PSP SDK)
assets/cores/          the libretro PSP cores embedded in the page
assets/kernel_functions.prx
assets/launcher/launcher.psp   prebuilt launcher binary
tools/build.py         assembles docs/index.html from the above
tests/unit.js          checks the PBP, SFO and zip writers
```

## Build from source

```
python3 tools/build.py                      # needs only Python 3
node tests/unit.js                          # optional checks

# only if you change src/launcher:
export PSPDEV=/path/to/pspdev               # https://pspdev.github.io/
python3 tools/build.py --rebuild-launcher
```

To add a system, drop its PSP core into `assets/cores/`, add it to `CORES` in `tools/build.py`, and add its entries to `SYS` and `EXT` in `src/lib.js`. The page embeds every core compressed, so keep the total under about 16 MB if you host it somewhere with a file size limit.

## Host it

GitHub Pages: **Settings > Pages > Deploy from a branch > `main` / `/docs`**. Any static host works, since the site is one HTML file.

## Status

The folder layout and launcher approach were checked on a PSP-3000 with ARK custom firmware using GBA, SNES and Mega Drive games. The `launch.txt`-based launcher in this repo is a later revision of that launcher and the NES, Game Boy, Master System, Game Gear and PC Engine cores have not been run on hardware yet. Test one game of each system before loading many, and please open an issue with what the PSP shows if something fails: the launcher prints the name of any file it cannot find.

## Legal

No ROMs, BIOS files or game art are included. Use dumps of games you own. The bundled cores and helper module are third-party software with their own licences; see [NOTICE.md](NOTICE.md). This project is not affiliated with Sony, Nintendo, Sega, NEC or the libretro project.

## Core fixes (Nov 2026)

Found by running every core through the real launcher chain in PPSSPP (headless) with test ROMs:

- **Game Boy / Game Boy Color (Gambatte) crashed on load.** The buildbot core keeps its C++ static constructors in `.init_array`, but the PSP startup code only runs the legacy `.ctors` list, so the global `GB` object was never constructed (NULL pointer write). `tools/corefix.py` patches `_init` to also run `.init_array`; `tools/build.py` applies it while embedding (same fix applies to PC Engine). The files in `assets/cores` stay byte-identical to upstream.
- **GBA (gpSP) crashed when the user memory partition was the small one.** The generated launcher EBOOT now sets `MEMSIZE=1`, the same as the cores and RetroArch's own launcher.
- `--rebuild-launcher` works with current pspdev (no `pack-pbp`).

Verified in PPSSPP: NES, GBA, GB, GBC, SNES, Mega Drive, Master System, Game Gear, PC Engine all boot and render. Not verified on real hardware.

## Fixes (Nov 2026, round 2)

- **Corrupted-data folders.** The zip writer stored every file with Unix permissions `----------`, so unzipping on a Mac produced unreadable files and a partly copied game folder, which the XMB shows as corrupted data. Entries are now `-rw-r--r--`. The page also checks each finished EBOOT (header, SFO keys, PNG sizes, sound) before zipping.
- Icon, background and sound are chosen separately.
- New `SND0.AT3` support (see Sound). Not verified on real hardware.

- **Extra memory.** Minish Cap boots in PPSSPP in 2000/3000 mode but crashes in PSP-1000 mode, and on a real PSP-3000 with ARK 5 it needed **Use extra memory = Max**. The page and README now say so.

## Fixes (Nov 2026, round 3): saves

- **Saves and save states were never written; every launch started a fresh game.** The RetroArch cores skip saving when their save folder does not exist (they log `"savefile_directory" is not a directory, ignoring`), and the generated folders never created one. Every game folder now ships with `savefiles/` and `savestates/` (plus `PSP/RETROARCH/savefiles|savestates|system`, which the cores fall back to) and a `retroarch.cfg` that sets:
  `savefiles_in_content_dir` and `savestates_in_content_dir` (saves live next to the ROM), `savestate_auto_save` and `savestate_auto_load` (resume exactly where you quit), `autosave_interval = 10` (in-game saves are flushed every 10 s, so quitting with HOME cannot lose them).
  To start a game from scratch, delete `savestates/<game>.state.auto` (and `savefiles/<game>.srm` to wipe the in-game save).
- **Repair zips you already built.** New section on the page: drop one or many old `PSP_Games.zip` files and download fixed copies. It adds the save folders and `retroarch.cfg` to every game folder it finds, resets file permissions to `-rw-r--r--` (fixes old `----------` zips too) and copies everything else byte for byte without recompressing. A `retroarch.cfg` you edited yourself is kept. Zips with no game folders are left alone. Library functions: `zipList`, `repairZip`, `saveFiles` in `src/lib.js`.
- Tested with desktop unzip on old-style stored and deflated zips (games intact, folders created, repeat repair adds nothing). **Not yet confirmed on real PSP hardware.**

## Fixes (Nov 2026, round 4): saves really persist

Round 3 still lost progress (play, save in-game, quit, relaunch = blank game). Reading the core's startup code showed why: the PSP RetroArch cores hard-code `ms0:/PSP/RETROARCH` as their home and read `retroarch.cfg` only from there, **never from the game folder**. The per-game `retroarch.cfg` from round 3 was ignored, so autosave stayed off and a HOME exit dropped the unsaved in-game save.

- The settings now live in `PSP/RETROARCH/retroarch.cfg` (written by every build and by Repair). `savefiles_in_content_dir` / `savestates_in_content_dir` keep each game's `.srm` and `.state.auto` next to its ROM; `autosave_interval = 10` flushes in-game saves every 10 s; `savestate_auto_save` / `savestate_auto_load` resume where you quit.
- The Install step and README now say to copy the whole `PSP` folder, since `PSP/RETROARCH` is required.
- Per-game `retroarch.cfg`, `savefiles/` and `savestates/` are no longer generated (they did nothing). Repair adds only `PSP/RETROARCH`.
- If you already run real RetroArch on the PSP and have your own `PSP/RETROARCH/retroarch.cfg`, do not overwrite it. Add these lines to it:
  `savefiles_in_content_dir = "true"`, `savestates_in_content_dir = "true"`, `savestate_auto_save = "true"`, `savestate_auto_load = "true"`, `autosave_interval = "10"`.
- Not yet confirmed on real PSP hardware. After saving in-game, wait about 10 s before pressing HOME the first time.
