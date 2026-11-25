import {describe,expect,it} from 'vitest';
import {conceptDefinitions,markdownBlock} from './noteFeatureBlocks';

describe('term definitions',()=>{
 it('collects repeated terms from widgets, selected text and canvases',()=>{
  const marker=encodeURIComponent(JSON.stringify({term:'Множество',definition:'Второе'}));
  const notes=[
   {path:'a.md',revision:'1',content:markdownBlock('concept',{id:'same',term:'Множество',definition:'Первое'})},
   {path:'b.md',revision:'1',content:`Множество — Второе<!-- noteapp-definition:${marker} -->`},
   {path:'c.canvas',revision:'1',content:JSON.stringify({widgets:[{id:'w',kind:'concept',text:JSON.stringify({id:'same',term:'множество',definition:'Третье'})}]})},
  ];
  expect([...conceptDefinitions(notes).values()].map(value=>value.definition)).toEqual(['Первое','Второе','Третье']);
 });
 it('refreshes cached definitions when the same notes array changes',()=>{
  const notes=[{path:'a.md',revision:'1',content:markdownBlock('concept',{id:'a',term:'Термин',definition:'Первое'})}];
  expect([...conceptDefinitions(notes).values()][0].definition).toBe('Первое');
  notes[0].content=markdownBlock('concept',{id:'a',term:'Термин',definition:'Второе'});
  expect([...conceptDefinitions(notes).values()][0].definition).toBe('Второе');
 });
});
