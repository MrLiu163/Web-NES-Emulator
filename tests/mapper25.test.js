import assert from 'node:assert/strict';
import {NES} from '../src/nes-core.js';
const rom=new Uint8Array(16+65536+32768);rom.set([78,69,83,26,4,4,0x90,0x10]);
for(let i=0;i<8;i++)rom.fill(i,16+i*8192,16+(i+1)*8192);
for(let i=0;i<32;i++)rom.fill(i,16+65536+i*1024,16+65536+(i+1)*1024);
const n=new NES({emulateSound:false});n.loadROM(rom);let m=n.mmap;
assert.equal(n.rom.mapperType,25);
m.write(0x8000,3);assert.equal(n.cpu.mem[0x8000],3);assert.equal(n.cpu.mem[0xc000],6);
m.write(0x9001,3);assert.equal(n.cpu.mem[0x8000],6);assert.equal(n.cpu.mem[0xc000],3);
m.write(0xb000,5);m.write(0xb002,1);assert.equal(n.ppu.vramMem[0],21);
m.write(0xb001,6);m.write(0xb003,0);assert.equal(n.ppu.vramMem[1024],6);
m.write(0xc000,7);m.write(0xc008,1);assert.equal(n.ppu.vramMem[2048],23); // VRC4d
m.write(0xf000,14);m.write(0xf002,15);m.write(0xf001,6);
m.clockCpuDots(3);assert.equal(m.irqCounter,255);m.clockCpuDots(3);assert.equal(m.irqPending,true);
m.write(0xf003,0);assert.equal(m.irqPending,false);assert.equal(m.irqControl&2,0);
m.write(0xf004,2); // d wiring: control, scanline mode
m.clockCpuDots(340);assert.equal(m.irqCounter,254);m.clockCpuDots(1);assert.equal(m.irqCounter,255);
const saved=JSON.parse(JSON.stringify(n.toJSON()));n.fromJSON(saved);m=n.mmap;assert.deepEqual(m.toJSON(),saved.mmap);
n.ppu.advanceDots(341);assert.equal(m.irqPending,true);
console.log('PASS: Mapper 25 PRG swap, both address wirings, split CHR registers, cycle/scanline IRQ, acknowledgement and save restore');
