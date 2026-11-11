#!/usr/bin/env python3
"""Make a RetroArch-PSP core run its C++ static constructors (.init_array).

The PSP crt0 calls _init(), whose __do_global_ctors_aux only walks the legacy .ctors list.
Cores built with a toolchain that emits .init_array (Gambatte, PCE Fast...) therefore never
construct their global objects, and the first use of one dereferences NULL.
"""
import struct

MIPS_REGS = dict(v0=2, s0=16, s1=17, sp=29, ra=31)

def _i(op, rs=0, rt=0, imm=0):  return struct.pack('<I', (op << 26) | (rs << 21) | (rt << 16) | (imm & 0xFFFF))
def _hilo(a):                    lo = a & 0xFFFF; hi = (a >> 16) + (1 if lo & 0x8000 else 0); return hi & 0xFFFF, lo

def runner(start, end):
    s0, s1, v0, sp, ra = 16, 17, 2, 29, 31
    hs, ls = _hilo(start); he, le = _hilo(end)
    code = [
        _i(0x09, sp, sp, -16),                 # addiu sp,sp,-16
        _i(0x2B, sp, ra, 12),                  # sw ra,12(sp)
        _i(0x2B, sp, s1, 8),                   # sw s1,8(sp)
        _i(0x2B, sp, s0, 4),                   # sw s0,4(sp)
        _i(0x0F, 0, s0, hs), _i(0x09, s0, s0, ls),   # s0 = start
        _i(0x0F, 0, s1, he), _i(0x09, s1, s1, le),   # s1 = end
        # loop:
        _i(0x04, s0, s1, 6), _i(0, 0, 0, 0),   # beq s0,s1,done ; nop
        _i(0x23, s0, v0, 0),                   # lw v0,0(s0)
        struct.pack('<I', (v0 << 21) | (ra << 11) | 9),  # jalr ra,v0
        _i(0x09, s0, s0, 4),                   # (delay) addiu s0,s0,4
        _i(0x04, 0, 0, -6), _i(0, 0, 0, 0),    # b loop ; nop
        # done:
        _i(0x23, sp, ra, 12), _i(0x23, sp, s1, 8), _i(0x23, sp, s0, 4),
        struct.pack('<I', (ra << 21) | 8),     # jr ra
        _i(0x09, sp, sp, 16),                  # (delay) addiu sp,sp,16
    ]
    return b''.join(code)

def parse_sections(d):
    shoff, = struct.unpack_from('<I', d, 32); shentsize, shnum, shstrndx = struct.unpack_from('<3H', d, 46)
    secs = [struct.unpack_from('<10I', d, shoff + i * shentsize) for i in range(shnum)]
    stro = secs[shstrndx][4]
    out = {}
    for s in secs:
        n = d[stro + s[0]:d.index(b'\0', stro + s[0])].decode()
        out[n] = dict(type=s[1], addr=s[3], off=s[4], size=s[5])
    return out

def patch_elf(elf):
    """Return (patched_elf, info). Raises ValueError if the layout is not the one we know how to fix."""
    d = bytearray(elf); S = parse_sections(d)
    ia = S.get('.init_array')
    if not ia or ia['size'] == 0:
        return bytes(d), 'no .init_array: nothing to do'
    ct = S['.ctors']
    if bytes(d[ct['off']:ct['off'] + ct['size']]) != struct.pack('<II', 0xFFFFFFFF, 0):
        raise ValueError('.ctors is not empty')
    init = S['.init']
    ws = struct.unpack_from('<%dI' % (init['size'] // 4), d, init['off'])
    jals = [(i, w) for i, w in enumerate(ws) if w >> 26 == 3]
    if len(jals) != 2: raise ValueError('unexpected _init layout')
    target = (jals[1][1] & 0x3FFFFFF) << 2
    text = next(v for k, v in S.items() if k == '.text')
    fo = target - text['addr'] + text['off']
    # the callee must be crtstuff's __do_global_ctors_aux: lw $2,off($2); addiu $3,$0,-1; beq $2,$3,..
    w = struct.unpack_from('<4I', d, fo)
    if not ((w[0] >> 26) == 0x0F and (w[1] >> 26) == 0x23 and w[2] == 0x2403FFFF and (w[3] >> 26) == 0x04):
        raise ValueError('callee is not __do_global_ctors_aux')
    code = runner(ia['addr'], ia['addr'] + ia['size'])
    if len(code) > 0x58: raise ValueError('patch too large')
    d[fo:fo + len(code)] = code
    return bytes(d), 'init_array patched: %d entries' % (ia['size'] // 4)

def patch_pbp(pbp):
    o = struct.unpack_from('<8I', pbp, 8); a, b = o[6], o[7]
    elf, info = patch_elf(pbp[a:b])
    assert len(elf) == b - a
    return pbp[:a] + elf + pbp[b:], info
