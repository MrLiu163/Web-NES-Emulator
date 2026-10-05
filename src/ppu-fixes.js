// Adapted from JSNES 2.1.0 PPU (Apache-2.0); see jsnes-LICENSE.
// Fix 8x16 odd tile addressing and vertical-flip sprite-zero hit checks.
import PPU from '../node_modules/jsnes/src/ppu/index.js';
export default class FixedPPU extends PPU {
  advanceDots(dots) {
    super.advanceDots(dots);
    this.nes.mmap?.clockCpuDots?.(dots);
  }

  renderSpritesPartially(startscan, scancount, bgPri) {
    if (this.f_spVisibility !== 1) return;

    let mmap = this.nes.mmap;
    let ptTile = this.ptTile;
    let buffer = this.buffer;
    let sprPalette = this.sprPalette;
    let pixrendered = this.pixrendered;

    for (let scan = startscan; scan < startscan + scancount; scan++) {
      if (scan < 0 || scan >= 240) continue;

      let count = this.scanlineSpriteCount[scan];
      let oamBase = scan * 32;

      for (let i = 0; i < count; i++) {
        let sprY = this.scanlineSecondaryOAM[oamBase + i * 4 + 0];
        let sprTile = this.scanlineSecondaryOAM[oamBase + i * 4 + 1];
        let sprAttr = this.scanlineSecondaryOAM[oamBase + i * 4 + 2];
        let sprX = this.scanlineSecondaryOAM[oamBase + i * 4 + 3];

        let vertFlip = (sprAttr >> 7) & 1;
        let horiFlip = (sprAttr >> 6) & 1;
        let priority = (sprAttr >> 5) & 1;
        let palAdd = (sprAttr & 3) << 2;

        if (priority !== bgPri) continue;
        if (this.f_spriteSize === 0) {
          // 8x8 sprites
          let tileIndex = this.f_spPatternTable === 0 ? sprTile : sprTile + 256;
          let sprBaseAddr = this.f_spPatternTable === 0 ? 0x0000 : 0x1000;

          // Render only the one scanline row that falls on 'scan'
          let dy = sprY + 1; // +1 because sprite Y in OAM is display line - 1
          let fineY = scan - dy;
          if (fineY < 0 || fineY >= 8) continue;

          ptTile[tileIndex].render(
            buffer,
            0,
            fineY,
            8,
            fineY + 1,
            sprX,
            dy,
            palAdd,
            sprPalette,
            horiFlip,
            vertFlip,
            i, // priority: lower index in secondary OAM = higher priority
            pixrendered,
          );

          // Mapper latch: simulate PPU's sprite pattern table fetch.
          mmap.latchAccess(sprBaseAddr + sprTile * 16 + 8);
        } else {
          // 8x16 sprites: tile index bit 0 selects pattern table ($0000/$1000),
          // top tile is (index & $FE), bottom tile is (index & $FE) + 1.
          let sprBaseAddr = (sprTile & 1) !== 0 ? 0x1000 : 0x0000;
          let topTileNum = sprTile & 0xfe;
          let top = (sprTile & 1) !== 0 ? topTileNum + 256 : topTileNum;

          let dy = sprY + 1;
          let fineY = scan - dy;
          if (fineY < 0 || fineY >= 16) continue;

          // Determine which half (top/bottom) this scanline falls in
          let tileOffset, tileFineY;
          if (fineY < 8) {
            tileOffset = vertFlip ? 1 : 0;
            tileFineY = fineY;
          } else {
            tileOffset = vertFlip ? 0 : 1;
            tileFineY = fineY - 8;
          }

          ptTile[top + tileOffset].render(
            buffer,
            0,
            tileFineY,
            8,
            tileFineY + 1,
            sprX,
            dy + (fineY < 8 ? 0 : 8),
            palAdd,
            sprPalette,
            horiFlip,
            vertFlip,
            i,
            pixrendered,
          );

          // Mapper latch: simulate fetches for both halves of 8x16 sprite.
          mmap.latchAccess(sprBaseAddr + topTileNum * 16 + 8);
          mmap.latchAccess(sprBaseAddr + (topTileNum + 1) * 16 + 8);
        }
      }
    }
  }

  checkSprite0(scan) {
    this.spr0HitX = -1;
    this.spr0HitY = -1;

    if (scan < 0 || scan >= 240) return false;
    if (!this.scanlineSprite0[scan]) return false;
    if (this.scanlineSpriteCount[scan] === 0) return false;

    // Read sprite 0's data from secondary OAM (first entry, slot 0).
    let oamBase = scan * 32;
    let sprY = this.scanlineSecondaryOAM[oamBase + 0];
    let sprTile = this.scanlineSecondaryOAM[oamBase + 1];
    let sprAttr = this.scanlineSecondaryOAM[oamBase + 2];
    let x = this.scanlineSecondaryOAM[oamBase + 3];
    let y = sprY + 1; // +1 because sprite Y in OAM is display line - 1

    let vertFlip = (sprAttr >> 7) & 1;
    let horiFlip = (sprAttr >> 6) & 1;

    // Sprite 0 hit has additional conditions beyond pixel overlap:
    // - No hit at x=255 (hardware doesn't check the last pixel)
    // - No hit at x=0..7 when left-side clipping is enabled for either
    //   sprites (f_spClipping===0) or background (f_bgClipping===0)
    // See https://www.nesdev.org/wiki/PPU_OAM#Sprite_zero_hits
    let leftClip = this.f_spClipping === 0 || this.f_bgClipping === 0;

    // Check each pixel of the sprite for overlap with background.
    // Returns the first x position where hit occurs, or -1 if no hit.
    let toffset;
    let t;

    // Use the mapper's getSpritePatternTile() instead of ptTile directly.
    // On MMC5 in 8x16 mode, ptTile may have BG data (Set B) after
    // renderBgScanline, but sprite 0 needs sprite data (Set A).
    let mmap = this.nes.mmap;

    if (this.f_spriteSize === 0) {
      // 8x8 sprites.
      let tIndexAdd = this.f_spPatternTable === 0 ? 0 : 256;
      if (y <= scan && y + 8 > scan && x < 256) {
        t = mmap.getSpritePatternTile(sprTile + tIndexAdd);
        toffset = vertFlip ? 7 - (scan - y) : scan - y;
        toffset *= 8;
        return this._checkSpr0Pixels(t, toffset, x, horiFlip, scan, leftClip);
      }
    } else {
      // 8x16 sprites: tile index bit 0 selects pattern table.
      if (y <= scan && y + 16 > scan && x < 256) {
        toffset = vertFlip ? 15 - (scan - y) : scan - y;

        // Bit 0 selects the table, not an odd starting tile. Flip the
        // full 16-row sprite once, then choose the correct tile and row.
        const top = (sprTile & 0xfe) + ((sprTile & 1) ? 256 : 0);
        t = mmap.getSpritePatternTile(top + (toffset >> 3));
        toffset &= 7;
        toffset *= 8;
        return this._checkSpr0Pixels(t, toffset, x, horiFlip, scan, leftClip);
      }
    }

    return false;
  }

}
