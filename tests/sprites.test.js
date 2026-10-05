import assert from 'node:assert/strict';
import { NES } from '../src/nes-core.js';
const nes=new NES({emulateSound:false});
const p=nes.ppu;
nes.mmap={latchAccess(){},getSpritePatternTile:i=>p.ptTile[i]};
p.f_spVisibility=1;p.f_spriteSize=1;
// Distinct tile colors catch accidentally reading the preceding tile.
for(let i=0;i<512;i++){p.ptTile[i].pix.fill(i%3+1);}
p.sprPalette[1]=101;p.sprPalette[2]=202;p.sprPalette[3]=303;
for(const tile of [0,1,2,3,254,255])for(const flip of [0,128]){
  p.buffer.fill(0);p.pixrendered.fill(255);
  for(let scan=20;scan<36;scan++){
    p.scanlineSpriteCount[scan]=1;p.scanlineSecondaryOAM.set([19,tile,flip,30],scan*32);
  }
  p.renderSpritesPartially(20,16,0);
  const top=(tile&254)+(tile&1?256:0);
  for(let row=0;row<16;row++){
    const sourceRow=flip?15-row:row;
    const expected=p.sprPalette[(top+(sourceRow>>3))%3+1];
    assert.equal(p.buffer[(20+row)*256+30],expected,`tile ${tile} flip ${flip} row ${row}`);
  }
  // Sprite-zero overlap uses the same table, tile half and flipped fine Y.
  let fetched=[];nes.mmap.getSpritePatternTile=i=>{fetched.push(i);return p.ptTile[i];};
  p.scanlineSprite0[20]=1;p.pixrendered.fill(256);p.f_spClipping=p.f_bgClipping=1;
  assert.equal(p.checkSprite0(20),true);
  assert.equal(fetched[0],top+(flip?1:0));
}
nes.mmap=null;nes.reset();assert.equal(nes.ppu.renderSpritesPartially,p.renderSpritesPartially);
console.log('PASS: 8x16 even/odd tiles, both pattern tables, vertical flip, all 16 rows, sprite-zero hits and reset');
