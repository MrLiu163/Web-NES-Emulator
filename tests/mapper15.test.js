import assert from 'node:assert/strict';
import {NES} from '../src/nes-core.js';
const rom=new Uint8Array(16+16*16384);rom.set([78,69,83,26,16,0,0xf0,0]);
for(let i=0;i<32;i++)rom.fill(i,16+i*8192,16+(i+1)*8192);
const n=new NES({emulateSound:false});n.loadROM(rom);
const banks=()=>[0x8000,0xa000,0xc000,0xe000].map(a=>n.cpu.mem[a]);
assert.deepEqual(banks(),[0,1,2,3]);
n.mmap.write(0x8000,3);assert.deepEqual(banks(),[6,7,8,9]);
n.mmap.write(0x8001,2);assert.deepEqual(banks(),[4,5,14,15]);
n.mmap.write(0x8002,0x82);assert.deepEqual(banks(),[5,5,5,5]);
n.mmap.write(0x8003,4);assert.deepEqual(banks(),[8,9,8,9]);
n.mmap.write(0x9000,0x43);assert.equal(n.ppu.currentMirroring,n.rom.HORIZONTAL_MIRRORING);
n.mmap.write(0x6000,123);assert.equal(n.mmap.load(0x6000),123);
for(let mode=0;mode<4;mode++){
  n.mmap.write(0x8000+mode,2);assert.equal(n.mmap.canWriteChr(0),true);
  n.ppu.writeVRAMAddress(0);n.ppu.writeVRAMAddress(0);n.ppu.vramWrite(0xaa);assert.equal(n.ppu.vramMem[0],0xaa);
}
const s=JSON.parse(JSON.stringify(n.toJSON()));n.mmap.write(0x8000,7);n.fromJSON(s);
assert.deepEqual(n.mmap.toJSON(),s.mmap);assert.equal(n.cpu.mem[0x6000],123);assert.equal(n.ppu.vramMem[0],0xaa);
console.log('PASS: Mapper 15 four banking modes, address aliases, mirroring, writable CHR/WRAM and save restore');
