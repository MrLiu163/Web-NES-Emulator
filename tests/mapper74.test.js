import assert from 'node:assert/strict';
import { NES, Mapper74 } from '../src/nes-core.js';
// Original synthetic ROM: four PRG banks and 128 distinctive 1 KiB CHR banks.
const rom=new Uint8Array(16+65536+131072);
rom.set([78,69,83,26,4,16,0xa0,0x40]);
rom.set([0x4c,0x00,0x80],16);
for(const offset of [65536-6,65536-4,65536-2])rom.set([0,0x80],16+offset);
for(let bank=0;bank<128;bank++)rom.fill(bank,16+65536+bank*1024,16+65536+(bank+1)*1024);
const nes=new NES({emulateSound:false});nes.loadROM(rom);
assert.equal(nes.rom.mapperType,74);assert.ok(nes.mmap instanceof Mapper74);
let m=nes.mmap;
function select(cmd,bank){m.write(0x8000,cmd);m.write(0x8001,bank);}
function ppuWrite(address,value){nes.ppu.writeVRAMAddress(address>>8);nes.ppu.writeVRAMAddress(address&255);nes.ppu.vramWrite(value);}
select(2,8);assert.equal(m.canWriteChr(0x1000),true);
ppuWrite(0x1000,0xa5);select(2,10);assert.equal(nes.ppu.vramMem[0x1000],10);assert.equal(m.canWriteChr(0x1000),false);
ppuWrite(0x1000,0xee);assert.equal(nes.ppu.vramMem[0x1000],10);
select(2,8);assert.equal(nes.ppu.vramMem[0x1000],0xa5);
select(3,9);ppuWrite(0x1400,0x5a);assert.equal(nes.ppu.vramMem[0x1000],0xa5);
select(4,70);assert.equal(nes.ppu.vramMem[0x1800],70);assert.equal(m.canWriteChr(0x1800),false);
select(0,9);assert.deepEqual(m.chrRamSlots.slice(0,2),[0,1]); // 2 KiB alignment
select(0x82,9);assert.equal(m.chrRamSlots[0],1); // CHR inversion
select(6,3);assert.equal(nes.cpu.mem[0x8000],rom[16+3*8192]);
const state=JSON.parse(JSON.stringify(nes.toJSON()));
assert.equal(state.mmap.chrRam.length,2048);
ppuWrite(0,0x33);select(0x82,12);nes.fromJSON(state);m=nes.mmap;
assert.equal(nes.ppu.vramMem[0],0x5a);assert.equal(m.canWriteChr(0),true);
select(0x82,12);select(0x82,9);assert.equal(nes.ppu.vramMem[0],0x5a);
nes.frame();
console.log('PASS: Mapper 74 import, CHR RAM/ROM switching, ROM write protection, high banks, 2 KiB alignment, inversion, PRG selection, save/load and frame execution');
