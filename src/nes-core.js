import Mapper15 from './mapper15.js';
import Mapper25 from './mapper25.js';
import FixedPPU from './ppu-fixes.js';
// Import the pinned source graph so registration and NES share one mapper table.
// Keep extensions in the project; never patch installed node_modules files.
import { NES as BaseNES, Controller } from '../node_modules/jsnes/src/index.js';
import Mappers from '../node_modules/jsnes/src/mappers/index.js';
import Mapper4 from '../node_modules/jsnes/src/mappers/mapper4.js';
import Mapper119 from '../node_modules/jsnes/src/mappers/mapper119.js';

// Waixing MMC3: CHR banks 8/9 select the two 1 KiB RAM pages, all others ROM.
// Hardware reference: https://www.nesdev.org/wiki/INES_Mapper_074
export class Mapper74 extends Mapper119 {
  static mapperName = 'Waixing MMC3 (Mapper 74)';

  constructor(nes) {
    super(nes);
    this.chrRam = new Uint8Array(2048);
    // A physical RAM page can appear in several PPU slots at once. Keep the
    // backing bytes and aliases coherent on $2007 writes, before bank flushes.
    const ppu = nes.ppu, writeMem = ppu.writeMem.bind(ppu);
    ppu.writeMem = (address, value) => {
      writeMem(address, value);
      if (address >= 0x2000) return;
      const bank = this.chrRamSlots[address >> 10];
      if (bank < 0) return;
      const offset = address & 1023;
      this.chrRam[bank * 1024 + offset] = value;
      for (let slot = 0; slot < 8; slot++) {
        if (this.chrRamSlots[slot] === bank) ppu.vramMem[slot * 1024 + offset] = value;
      }
    };
  }

  executeCommand(cmd, arg) {
    // MMC3's 2 KiB registers ignore bit 0. Keep all 8 ROM bank bits;
    // TQROM's bit-6 RAM selector and 6-bit ROM mask do not apply here.
    Mapper4.prototype.executeCommand.call(this, cmd, cmd < 2 ? arg & 0xfe : arg);
  }

  load1kVromBank(bank, address) {
    if (bank === 8 || bank === 9) {
      this.load1kChrRamBank(bank - 8, address);
      return;
    }
    this.nes.ppu.triggerRendering();
    this.saveChrRamSlot(address);
    this.chrRamSlots[address >> 10] = -1;
    super.load1kVromBank(bank, address);
  }

  rebuildChrRamTiles(bank) {
    if (bank < 2) super.rebuildChrRamTiles(bank);
  }
}

Mappers[74] = Mapper74;
Mappers[25] = Mapper25;
Mappers[15] = Mapper15;
export class NES extends BaseNES {
  constructor(options) { super(options); Object.setPrototypeOf(this.ppu, FixedPPU.prototype); }
  reset() { super.reset(); Object.setPrototypeOf(this.ppu, FixedPPU.prototype); }
}
export { Controller };
