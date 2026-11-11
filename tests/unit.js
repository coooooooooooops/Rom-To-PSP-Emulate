// node tests/unit.js  — checks the pure functions the page relies on
const assert = require("assert"), L = require("../src/lib.js");
(async () => {
  assert.strictEqual(L.cleanTitle("Pokemon - Fire Red Version (U) (V1.1).gba"), "Pokemon - Fire Red Version");
  assert.strictEqual(L.cleanTitle("FIFA 2007 # GBA.GBA"), "FIFA 2007");
  assert.strictEqual(L.slug("Zelda: A Link to the Past"), "Zelda_A_Link_to_the_Past");
  assert.strictEqual(L.EXT.sfc, "snes"); assert.strictEqual(L.SYS[L.EXT.gg].core, "md");
  // PARAM.SFO layout must match what the PSP toolchain produces (9 entries, 328 bytes for a short title)
  const s = L.sfo("Sonic the Hedgehog 2"); assert.strictEqual(s.length, 328);
  assert.strictEqual(Buffer.from(s.subarray(0, 4)).toString("latin1"), "\0PSF");
  // PBP header offsets are consistent
  const icon = new Uint8Array([1, 2, 3]), pic = new Uint8Array([4, 5]), psp = new Uint8Array([6]);
  const b = Buffer.from(await L.pbp(s, icon, pic, psp).arrayBuffer());
  const o = []; for (let i = 0; i < 8; i++) o.push(b.readUInt32LE(8 + 4 * i));
  assert.strictEqual(o[1], 40 + s.length); assert.strictEqual(o[4] - o[1], 3); assert.strictEqual(o[6] - o[4], 2); assert.strictEqual(o[7], b.length);
  // zip: CRC32 of "123456789" is the standard check value
  assert.strictEqual(L.crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
  console.log("ok");
})();
