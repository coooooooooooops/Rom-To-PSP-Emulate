TARGET = launcher
OBJS = launcher.o kernel_functions.o
CFLAGS = -O2 -G0 -Wall $(EXTRA)
LIBS = -lpspdebug -lpspdisplay -lpspge -lpspctrl -lpspsdk
EXTRA_TARGETS = EBOOT.PBP
PSP_EBOOT_TITLE = $(TITLE)
PSP_EBOOT_ICON = $(ICON)
PSP_EBOOT_PIC1 = $(PIC)
PSPSDK = $(shell psp-config --pspsdk-path)
include $(PSPSDK)/lib/build.mak
