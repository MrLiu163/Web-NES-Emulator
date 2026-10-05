import Mapper0 from '../node_modules/jsnes/src/mappers/mapper0.js';
// VRC4b/d address wiring and IRQ: NESdev VRC2_and_VRC4 and VRC_IRQ.
export default class Mapper25 extends Mapper0 {
  static mapperName='Konami VRC4 (25)';
  constructor(nes){super(nes);this.prg=[0,1];this.chr=Array.from({length:8},(_,i)=>i);this.swap=0;this.wram=0;this.mirror=0;this.irqLatch=0;this.irqCounter=0;this.irqControl=0;this.prescaler=341;this.cycleDots=0;this.irqPending=false;}
  sub(address){const sub=this.nes.rom.isNES2?this.nes.rom.header[8]>>4:0;return sub===2?((address>>3)&1)|((address>>1)&2):sub===1||sub===3?((address>>1)&1)|((address<<1)&2):(((address>>1)|(address>>3))&1)|(((address<<1)|(address>>1))&2);}
  syncPrg(){const last=this.nes.rom.romCount*2-1;this.load8kRomBank(this.swap?last-1:this.prg[0],0x8000);this.load8kRomBank(this.prg[1],0xa000);this.load8kRomBank(this.swap?this.prg[0]:last-1,0xc000);this.load8kRomBank(last,0xe000);}
  syncMirror(){this.nes.ppu.setMirroring([this.nes.rom.VERTICAL_MIRRORING,this.nes.rom.HORIZONTAL_MIRRORING,this.nes.rom.SINGLESCREEN_MIRRORING,this.nes.rom.SINGLESCREEN_MIRRORING2][this.mirror]);}
  clearIrq(){if(this.irqPending&&this.nes.cpu.irqType===this.nes.cpu.IRQ_NORMAL)this.nes.cpu.irqRequested=false;this.irqPending=false;}
  write(address,value){if(address<0x8000){if(address>=0x6000&&!this.wram)return;super.write(address,value);return;}const region=address&0xf000,sub=this.sub(address);
    if(region===0x8000||region===0xa000){this.prg[region===0x8000?0:1]=value&31;this.syncPrg();}
    else if(region===0x9000){if(sub<2){this.mirror=value&3;this.syncMirror();}else{this.swap=(value>>1)&1;this.wram=value&1;this.syncPrg();}}
    else if(region>=0xb000&&region<=0xe000){const bank=((region-0xb000)>>11)+(sub>>1);this.chr[bank]=sub&1?(this.chr[bank]&15)|((value&31)<<4):(this.chr[bank]&0x1f0)|(value&15);this.load1kVromBank(this.chr[bank],bank*1024);}
    else if(region===0xf000){if(sub===0)this.irqLatch=(this.irqLatch&240)|(value&15);if(sub===1)this.irqLatch=(this.irqLatch&15)|((value&15)<<4);if(sub===2){this.clearIrq();this.irqControl=value&7;this.prescaler=341;this.cycleDots=0;if(value&2)this.irqCounter=this.irqLatch;}if(sub===3){this.clearIrq();this.irqControl=(this.irqControl&5)|((this.irqControl&1)<<1);}}
  }
  load(address){if(address>=0x6000&&address<0x8000&&!this.wram)return this.nes.cpu.mem[address];return super.load(address);}
  tickIrq(){if(this.irqCounter===255){this.irqCounter=this.irqLatch;this.irqPending=true;this.nes.cpu.requestIrq(this.nes.cpu.IRQ_NORMAL);}else this.irqCounter++;}
  clockCpuDots(dots){if(this.irqPending)this.nes.cpu.requestIrq(this.nes.cpu.IRQ_NORMAL);if(!(this.irqControl&2))return;if(this.irqControl&4){this.cycleDots+=dots;while(this.cycleDots>=3){this.cycleDots-=3;this.tickIrq();}}else{this.prescaler-=dots;while(this.prescaler<=0){this.prescaler+=341;this.tickIrq();}}}
  loadROM(){this.syncPrg();for(let i=0;i<8;i++)this.load1kVromBank(this.chr[i],i*1024);this.loadBatteryRam();this.nes.cpu.requestIrq(this.nes.cpu.IRQ_RESET);}
  toJSON(){const s=super.toJSON();for(const key of ['prg','chr','swap','wram','mirror','irqLatch','irqCounter','irqControl','prescaler','cycleDots','irqPending'])s[key]=Array.isArray(this[key])?[...this[key]]:this[key];return s;}
  fromJSON(s){super.fromJSON(s);for(const key of ['prg','chr','swap','wram','mirror','irqLatch','irqCounter','irqControl','prescaler','cycleDots','irqPending'])this[key]=Array.isArray(s[key])?[...s[key]]:s[key];}
}
