#include <pspkernel.h>
#include <pspdebug.h>
#include <pspsdk.h>
#include <string.h>
#include <stdio.h>
#include "kernel_functions.h"


PSP_MODULE_INFO("RALauncher", PSP_MODULE_USER, 1, 0);
PSP_MAIN_THREAD_ATTR(PSP_THREAD_ATTR_USER);

static int fail(const char *msg, const char *what)
{
   pspDebugScreenInit();
   pspDebugScreenPrintf("\n  Launch failed: %s\n  %s\n\n  Press HOME to exit.", msg, what);
   sceKernelSleepThread();
   return 0;
}

int main(int argc, char **argv)
{
   char dir[256], self[256], prx[300], core[300], rom[300], argp[640];
   SceUID f;
   int n, len;
   char *slash;

   strncpy(self, argv[0], sizeof(self) - 1); self[sizeof(self) - 1] = 0;
   strcpy(dir, self);
   slash = strrchr(dir, '/');
   if (!slash) return fail("bad path", self);
   slash[1] = 0;

   /* launch.txt: line 1 = core file, line 2 = rom file (both in this folder) */
   {
      char cfg[300], buf[300], cf[128], rf[160];
      int got, i, line = 0, p = 0;
      snprintf(cfg, sizeof(cfg), "%slaunch.txt", dir);
      if ((f = sceIoOpen(cfg, PSP_O_RDONLY, 0)) < 0) return fail("launch.txt missing", cfg);
      got = sceIoRead(f, buf, sizeof(buf) - 1);
      sceIoClose(f);
      if (got <= 0) return fail("launch.txt empty", cfg);
      buf[got] = 0; cf[0] = rf[0] = 0;
      for (i = 0; i <= got && line < 2; i++)
      {
         char c = buf[i];
         if (c == '\r' || c == '\n' || c == 0)
         {
            if (p) { (line ? rf : cf)[p] = 0; line++; p = 0; }
         }
         else if (p < (line ? 159 : 127)) (line ? rf : cf)[p++] = c;
      }
      if (!cf[0] || !rf[0]) return fail("launch.txt needs 2 lines", cfg);
      snprintf(prx,  sizeof(prx),  "%skernel_functions.prx", dir);
      snprintf(core, sizeof(core), "%s%s", dir, cf);
      snprintf(rom,  sizeof(rom),  "%s%s", dir, rf);
   }

   if ((f = sceIoOpen(core, PSP_O_RDONLY, 0)) < 0) return fail("core missing", core);
   sceIoClose(f);
   if ((f = sceIoOpen(rom, PSP_O_RDONLY, 0)) < 0) return fail("game missing", rom);
   sceIoClose(f);

   n = pspSdkLoadStartModule(prx, PSP_MEMORY_PARTITION_KERNEL);
   if (n < 0) return fail("kernel_functions.prx failed to load", prx);

   /* same argument layout RetroArch Salamander uses: argv[0] = EBOOT path, argv[1] = content */
   len = strlen(self) + 1;
   memcpy(argp, self, len);
   n = strlen(rom) + 1;
   memcpy(argp + len, rom, n);
   len += n;

   exitspawn_kernel(core, len, argp);
   sceKernelSleepThread();
   return 0;
}
