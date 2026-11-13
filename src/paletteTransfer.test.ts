import {describe,it,expect} from 'vitest';
import {palettes,readPaletteDrop} from './appearance';

describe('Перетаскивание палитры',()=>{
  it('переносит одиночную палитру или пару градиента',()=>{
    expect(readPaletteDrop('{"palette":"nord"}')).toEqual({palette:'nord'});
    expect(readPaletteDrop('{"palette":"dracula","blend":"nord"}')).toEqual({palette:'dracula',blend:'nord'});
    expect(new Set(palettes.map(p=>p.id)).size).toBe(palettes.length);
  });
  it('отклоняет повреждённые данные и неизвестные цвета',()=>{
    for(const data of ['', 'null','123','{"palette":"unknown"}','{"palette":"nord","blend":123}',
      '{"palette":"nord","blend":"<script>"}'])expect(readPaletteDrop(data)).toBeNull();
  });
});
