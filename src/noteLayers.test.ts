import {describe,expect,it} from 'vitest';
import {nextNoteLayer} from './noteLayers';
import {imageLayout,assetPath} from './noteImages';
import {noteTextPosition} from './noteTextBlocks';

describe('Порядок слоёв заметки',()=>{
  it('поддерживает старые изображения и текстовые блоки',()=>{
    expect(imageLayout('photo.png#noteapp-width=320&x=10&y=20')).toMatchObject({width:320,x:10,y:20,z:2});
    expect(noteTextPosition('noteapp-text-10-20')).toEqual({x:10,y:20,z:2});
    expect(nextNoteLayer('Обычный текст -z999')).toBe(3);
  });
  it('поднимает объект поверх изображений и текста в общем порядке',()=>{
    const content='![Фото](photo.png#noteapp-width=320&x=10&y=20&z=7)\n\n'+
      '```noteapp-text-10-20-z11\nТекст\n```';
    expect(nextNoteLayer(content)).toBe(12);
    expect(imageLayout('photo.png#noteapp-width=320&x=10&y=20&z=12').z).toBe(12);
    expect(noteTextPosition('noteapp-text-10-20-z12')?.z).toBe(12);
    expect(assetPath('Проект/Заметка.md','photo.png#noteapp-width=320&x=10&y=20&z=12')).toBe('Проект/photo.png');
  });
});
