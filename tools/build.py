#!/usr/bin/env python3
"""Build docs/index.html: one self-contained page with every core, the launcher and the
kernel prx embedded (raw-deflate + base64). Needs only Python 3. No ROMs are bundled.

  python3 tools/build.py                    # build from the committed assets
  python3 tools/build.py --rebuild-launcher # recompile src/launcher first (needs the pspdev toolchain)
"""
import base64, os, shutil, subprocess, sys, urllib.parse, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corefix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)

# core id used by src/lib.js  ->  libretro core file in assets/cores
CORES = {
    "gba": "gpsp",               # Game Boy Advance
    "snes": "snes9x2005",        # Super Nintendo
    "md": "picodrive",           # Mega Drive / Genesis, Master System, Game Gear
    "nes": "fceumm",             # NES
    "gb": "gambatte",            # Game Boy / Game Boy Color
    "pce": "mednafen_pce_fast",  # PC Engine
}

def deflate_b64(data: bytes) -> str:
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return base64.b64encode(c.compress(data) + c.flush()).decode()

def rebuild_launcher():
    pspdev = os.environ.get("PSPDEV")
    if not pspdev:
        sys.exit("Set PSPDEV to your pspdev install (https://pspdev.github.io/) to rebuild the launcher.")
    env = dict(os.environ, PATH=os.environ["PATH"] + os.pathsep + os.path.join(pspdev, "bin"))
    work = P("build-launcher"); shutil.rmtree(work, ignore_errors=True); shutil.copytree(P("src", "launcher"), work)
    # the stripped ELF is exactly the PBP's data.psp section; newer pack-pbp rejects our empty ICON/PIC, so skip packing
    subprocess.check_call(["make", "launcher_strip.elf"], cwd=work, env=env)
    shutil.copy(os.path.join(work, "launcher_strip.elf"), P("assets", "launcher", "launcher.psp"))
    shutil.rmtree(work)

def main():
    if "--rebuild-launcher" in sys.argv:
        rebuild_launcher()
    blobs = {}
    for k, v in CORES.items():
        pbp, info = corefix.patch_pbp(open(P("assets", "cores", v + "_libretro.PBP"), "rb").read())
        print("%-18s %s" % (v, info))
        blobs[k] = deflate_b64(pbp)
    blobs["prx"] = deflate_b64(open(P("assets", "kernel_functions.prx"), "rb").read())
    blobs["launcher"] = deflate_b64(open(P("assets", "launcher", "launcher.psp"), "rb").read())
    lib = open(P("src", "lib.js")).read()
    lib = "\n".join(l for l in lib.splitlines() if not l.startswith("if(typeof module"))
    fav = "data:image/svg+xml," + urllib.parse.quote(open(P("logo.svg")).read().replace("\n", ""))
    html = open(P("src", "template.html")).read()
    html = html.replace("<!--FAVICON-->", '<link rel="icon" href="%s">' % fav)
    html = html.replace("/*LIB*/", lib).replace("/*BLOBS*/", "const BL=" + str(blobs).replace("'", '"') + ";")
    os.makedirs(P("docs"), exist_ok=True)
    open(P("docs", "index.html"), "w").write(html)
    print("docs/index.html  %.1f MB" % (len(html) / 1048576))

main()
