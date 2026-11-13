import {describe,expect,it} from 'vitest';
import {textures,textureById} from './textures';
import {readPaletteDrop} from './appearance';
import {noteTextPosition} from './noteTextBlocks';

describe('textures',()=>{
  it('contains texture images and accepts them as palette drops',()=>{
    expect(textures.length).toBe(15);
    for(const texture of textures){
      expect(texture.file).toMatch(/^[a-z0-9]+\.jpg$/);
      expect(readPaletteDrop(JSON.stringify({palette:texture.id}))).toEqual({palette:texture.id,blend:undefined});
    }
    expect(textureById('texture-unknown')).toBeUndefined();
  });
  it('restores a texture from a note widget marker',()=>{
    expect(noteTextPosition('noteapp-widget-16-16-w320-h160-z2-tt-ppaper001')?.texture).toBe('texture-paper001');
    expect(noteTextPosition('noteapp-widget-16-16-w320-h160-z2-tt')?.texture).toBeUndefined();
  });
});
