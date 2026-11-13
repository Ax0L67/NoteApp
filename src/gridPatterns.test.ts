import {describe,it,expect} from 'vitest';
import {gridPatterns,gridStyle} from './gridPatterns';

describe('Фоновая сетка',()=>{
  it('содержит пятнадцать разных узоров и вариант без сетки',()=>{
    expect(gridPatterns).toHaveLength(16);
    expect(new Set(gridPatterns.map(pattern=>pattern.id)).size).toBe(16);
    expect(gridPatterns.find(pattern=>pattern.id==='none')?.shape).toBe('');
  });
  it('ограничивает видимость диапазоном 0–200% и сохраняет прежний уровень по умолчанию',()=>{
    expect(gridStyle('dot',-10)).toEqual(gridStyle('dot',0));
    expect(gridStyle('dot',500)).toEqual(gridStyle('dot',200));
    expect(gridStyle('dot',NaN)).toEqual(gridStyle('dot',100));
    expect(gridStyle('dot',0)).toHaveProperty('--grid-opacity',0);
    expect(gridStyle('dot',200)).toHaveProperty('--grid-boost','35%');
  });
  it('по умолчанию и при неизвестном значении использует точки',()=>{
    expect(gridStyle()).toEqual(gridStyle('dot'));
    expect(gridStyle('invalid')).toEqual(gridStyle('dot'));
    expect(gridStyle('none')).not.toEqual(gridStyle());
  });
});
