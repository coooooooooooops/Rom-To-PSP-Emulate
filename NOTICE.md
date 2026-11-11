# Third-party components

This repository's own code (`src/template.html`, `src/lib.js`, `tools/`, `tests/`, logo and banner) is released under the MIT licence, see `LICENSE`.

It also redistributes unmodified third-party binaries and builds against RetroArch-derived files. Their licences apply to them, not to the MIT grant above. Check each upstream before you redistribute or use this commercially.

| Item | Where | Upstream |
| --- | --- | --- |
| gpSP core | `assets/cores/gpsp_libretro.PBP` | https://github.com/libretro/gpsp |
| snes9x2005 core | `assets/cores/snes9x2005_libretro.PBP` | https://github.com/libretro/snes9x2005 (non-commercial licence) |
| FCEUmm core | `assets/cores/fceumm_libretro.PBP` | https://github.com/libretro/libretro-fceumm |
| Gambatte core | `assets/cores/gambatte_libretro.PBP` | https://github.com/libretro/gambatte-libretro |
| PicoDrive core | `assets/cores/picodrive_libretro.PBP` | https://github.com/libretro/picodrive (non-commercial licence) |
| Mednafen PCE Fast core | `assets/cores/mednafen_pce_fast_libretro.PBP` | https://github.com/libretro/beetle-pce-fast-libretro |
| kernel_functions.prx, and the headers and import stub in `src/launcher/` | `assets/`, `src/launcher/` | https://github.com/libretro/RetroArch (`os/psp1/kernel_functions_prx`, GPLv3) |
| Box art lookup | fetched at runtime | https://github.com/libretro-thumbnails (artwork belongs to its respective owners) |

The cores were taken from a RetroArch PSP build. Source code for each is available at the upstream links above.

I am not a lawyer; this table is a pointer, not legal advice.

`src/at3.js` is original code implementing the ATRAC3 bitstream. Its filter-bank constants and window shape are format constants that are identical to those used by FFmpeg's ATRAC3 decoder (LGPL-2.1+), against which it was verified; no FFmpeg code is included. ATRAC is a Sony technology; this project is not affiliated with Sony.

Note: `tools/corefix.py` modifies the cores' startup code (runs `.init_array`) at build time. The shipped assets are unmodified upstream binaries.
