import Mapper0 from '../node_modules/jsnes/src/mappers/mapper0.js';
// Mapper 15, including the writable CHR RAM / PRG RAM needed by mapper hacks.
// Reference: https://www.nesdev.org/wiki/INES_Mapper_015
export default class Mapper15 extends Mapper0 {
  static mapperName='K-1029 / Mapper 15 compatibility';
  constructor(nes){super(nes);this.mode=0;this.bankData=0;}
  sync(){
    const bank=this.bankData&63;
    for(let slot=0;slot<4;slot++){
      let page;
      switch(this.mode){
        case 0:page=bank*2+slot;break;
        case 1:page=(slot<2?bank:bank|7)*2+(slot&1);break;
        case 2:page=bank*2+(this.bankData>>7);break;
        case 3:page=bank*2+(slot&1);break;
      }
      this.load8kRomBank(page,0x8000+slot*8192);
    }
    this.nes.ppu.setMirroring(this.bankData&64?this.nes.rom.HORIZONTAL_MIRRORING:this.nes.rom.VERTICAL_MIRRORING);
  }
  write(address,value){if(address<0x8000)return super.write(address,value);this.mode=address&3;this.bankData=value;this.sync();}
  // Mapper-hacked single games require writable CHR in every mode, plus WRAM.
  canWriteChr(address){return address<0x2000&&this.nes.rom.vromCount===0;}
  loadROM(){this.sync();this.loadCHRROM();this.loadBatteryRam();this.nes.cpu.requestIrq(this.nes.cpu.IRQ_RESET);}
  toJSON(){return {...super.toJSON(),mode:this.mode,bankData:this.bankData};}
  fromJSON(s){super.fromJSON(s);this.mode=s.mode;this.bankData=s.bankData;}
}
