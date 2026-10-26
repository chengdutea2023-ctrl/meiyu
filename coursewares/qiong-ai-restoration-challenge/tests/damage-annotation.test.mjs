import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { damageContours } from '../client/damage-annotation.js';
import { RESTORATION_CASES } from '../shared/restoration-cases.mjs';

function checkContour(mask, width, height) {
  const paths = damageContours(mask, width, height), drawn = new Set(), expected = new Set();
  const key = (a, b) => [a.join(','), b.join(',')].sort().join(':');
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    for (const [dx, dy, a, b] of [[0,-1,[x,y],[x+1,y]], [1,0,[x+1,y],[x+1,y+1]], [0,1,[x+1,y+1],[x,y+1]], [-1,0,[x,y+1],[x,y]]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) expected.add(key(a,b));
    }
  }
  for (const path of paths) {
    assert.deepEqual(path[0], path.at(-1), 'every outline must close');
    for (let i = 1; i < path.length; i++) {
      const a = path[i-1], b = path[i];
      assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]), 1, 'no invented connecting lines across the picture');
      const edge = key(a,b); assert.ok(!drawn.has(edge), 'no repeated edge'); drawn.add(edge);
    }
  }
  assert.deepEqual(drawn, expected, 'outlines follow the exact mask including holes and disconnected marks');
}

test('damage boundaries handle edges, holes, diagonal contacts and empty masks without altering the mask', () => {
  const width=9,height=9,mask=new Uint8Array(width*height);
  for(let y=0;y<6;y++)for(let x=0;x<6;x++)mask[y*width+x]=255;
  mask[2*width+2]=0; mask[6*width+6]=255; mask[8*width+8]=255;
  const before=mask.slice(); checkContour(mask,width,height); assert.deepEqual(mask,before);
  assert.deepEqual(damageContours(new Uint8Array(4),2,2),[]);
  assert.throws(()=>damageContours(mask,1,1),/尺寸/);
});

test('all three real teaching masks get exact display boundaries while source images and masks remain separate',async()=>{
  for(const item of RESTORATION_CASES){
    const path=new URL('../static/assets/'+item.maskFile,import.meta.url);
    const {data,info}=await sharp(await readFile(path)).greyscale().raw().toBuffer({resolveWithObject:true});
    const before=Buffer.from(data);checkContour(data,info.width,info.height);assert.deepEqual(data,before);
  }
});
