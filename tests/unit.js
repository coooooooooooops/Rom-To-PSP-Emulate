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
  // SND0 slot: offsets shift correctly when a sound is supplied
  const snd = new Uint8Array([9, 9, 9, 9]);
  const b2 = Buffer.from(await L.pbp(s, icon, pic, psp, snd).arrayBuffer());
  assert.strictEqual(b2.readUInt32LE(8 + 4 * 6) - b2.readUInt32LE(8 + 4 * 5), 4); // SND0 length
  // zip entries must carry -rw-r--r-- (attr 0 made macOS unzip files as ----------)
  const z = Buffer.from(await L.zipStore([{ name: "a/b.txt", data: new Uint8Array([1, 2, 3]) }]).arrayBuffer());
  const cd = z.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  assert.strictEqual(z.readUInt32LE(cd + 38) >>> 16, 0o100644);
  // zip reader round trip + folder entries
  const enc = new TextEncoder(), dec = new TextDecoder();
  const zz = Buffer.from(await L.zipStore([{ name: "d/" }, { name: "d/a.txt", data: enc.encode("hello") }]).arrayBuffer());
  const zl = L.zipList(new Uint8Array(zz)); assert.deepStrictEqual(zl.map((e) => e.name), ["d/", "d/a.txt"]);
  assert.strictEqual(dec.decode(zl[1].bytes), "hello"); assert.strictEqual(zl[1].crc, L.crc32(enc.encode("hello")));
  const cd0 = zz.indexOf(Buffer.from([0x50, 0x4b, 1, 2])); assert.strictEqual(zz.readUInt32LE(cd0 + 38), 0x41ED0010);
  // repair: an old-style zip gains PSP/RETROARCH/retroarch.cfg and its save folders; a second pass changes nothing
  const old = Buffer.from(await L.zipStore(["EBOOT.PBP", "CORE.PBP", "launch.txt", "G.gba"].map((n) => ({ name: "PSP/GAME/G/" + n, data: enc.encode(n) }))).arrayBuffer());
  const r1 = L.repairZip(new Uint8Array(old)); assert.strictEqual(r1.games, 1);
  const names = r1.entries.map((e) => e.name);
  for (const n of ["PSP/RETROARCH/retroarch.cfg", "PSP/RETROARCH/savefiles/", "PSP/RETROARCH/savestates/", "PSP/RETROARCH/system/"]) assert.ok(names.includes(n), "missing " + n);
  const fixedZip = Buffer.from(await L.zipStore(r1.entries).arrayBuffer());
  const r2 = L.repairZip(new Uint8Array(fixedZip)); assert.strictEqual(r2.added, 0); assert.strictEqual(r2.entries.length, r1.entries.length);
  const cfgE = L.zipList(new Uint8Array(fixedZip)).find((e) => e.name.endsWith("retroarch.cfg")); assert.ok(dec.decode(cfgE.bytes).startsWith(L.CFG_MARK));
  assert.strictEqual(L.repairZip(new Uint8Array(await L.zipStore([{ name: "x.txt", data: enc.encode("x") }]).arrayBuffer())).games, 0);
  assert.throws(() => L.zipList(new Uint8Array(10)), /not a zip/);
  // AT3 encoder: header and frame layout
  const A = require("../src/at3.js"), n = 44100, l = new Float32Array(n).map((_, i) => 0.3 * Math.sin(i * 0.06));
  const at3 = Buffer.from(A.encode(l, l));
  assert.strictEqual(at3.toString("latin1", 0, 4), "RIFF"); assert.strictEqual(at3.readUInt16LE(20), 0x270);
  const di = at3.indexOf("data"), dl = at3.readUInt32LE(di + 4);
  assert.strictEqual(dl % 384, 0); assert.strictEqual(at3[di + 8] >> 2, 0x28); assert.strictEqual(at3[di + 8 + 192] >> 2, 0x28);
  assert.ok(at3.length < 500000);
  // optional: decode with ffmpeg if installed and check fidelity
  try {
    const cp = require("child_process"), fs = require("fs"), f = require("os").tmpdir() + "/u.at3"; fs.writeFileSync(f, at3);
    const pcm = cp.execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "s16le", "-ac", "1", "-"], { maxBuffer: 1 << 26 });
    let sig = 0, err = 0; for (let i = 4000; i < n - 4000; i++) { const x = l[i] * 32768, y = pcm.readInt16LE(2 * i); sig += x * x; err += (x - y) * (x - y) }
    assert.ok(10 * Math.log10(sig / err) > 25, "AT3 round trip SNR too low");
  } catch (e) { if (e.code !== "ENOENT" && !/spawn|ffmpeg/.test(String(e.message))) throw e; }
  console.log("ok");
})();
