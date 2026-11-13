import {describe,it,expect} from 'vitest';
import {backlinks,resolveLink,tags,headings} from './indexing';
import {search} from './search';
import {title} from './indexing';
import type {ExplorerItem} from './Explorer';
const notes=[{path:'Знания/Память.md',content:'# Память\n\n#обучение\n## Практика\nИнтервалы помогают.',revision:'1'},{path:'Идея.md',content:'См. [[Знания/Память#Практика|пример]]',revision:'2'}];
const items:ExplorerItem[]=notes.map(note=>({kind:'note',project:'Личное',path:note.path,name:title(note.path)}));
describe('Индекс и поиск',()=>{it('разрешает пути, заголовки, псевдонимы и обратные ссылки',()=>{expect(resolveLink('Знания/Память#Практика|пример',notes)).toBe(notes[0]);expect(backlinks(notes[0],notes)).toEqual([notes[1]])});it('находит русское содержимое и фрагмент',()=>{expect(search(notes,'интервалы',items)[0].snippet).toContain('Интервалы');expect(search(notes,'память',items)[0].item.path).toBe(notes[0].path)});it('различает заголовки и теги',()=>{expect(tags(notes[0].content)).toEqual(['обучение']);expect(headings(notes[0].content).map(h=>h.text)).toEqual(['Память','Практика'])})});
