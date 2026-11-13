import {expect,it} from 'vitest';
import {ALL_PROJECTS,allProjectsGraph} from './allProjectsGraph';
import {locationTabKey,tabLocation} from './workspaceTabs';
import type {ExplorerItem} from './Explorer';
import type {Settings} from './types';
const children=(item:ExplorerItem):ExplorerItem[]=>item.kind==='project'?[{kind:'note',project:item.project,path:item.project+'/note.md',name:'Note'}]:[];
it('combines project structures and links but keeps project insertions off the shared canvas',()=>{
 const settings:Settings={projectMaps:{A:{blocks:[{id:'same',text:'Private A',position:{x:0,y:0}}]},B:{blocks:[{id:'same',text:'Private B',position:{x:0,y:0}}]},[ALL_PROJECTS]:{blocks:[{id:'global',text:'Shared',position:{x:0,y:0}}]}},projectConnections:{A:[{from:'project:A',to:'A/note.md'},{from:'annotation:same',to:'A/note.md'}]}};
 const before=JSON.stringify(settings),model=allProjectsGraph(['A','B'],settings,children);
 expect(model.roots.map(root=>root.project)).toEqual(['A','B']);
 expect(Object.keys(model.map.cards!)).toEqual(expect.arrayContaining(['project:A','project:B','A/note.md','B/note.md']));
 expect(model.map.blocks?.map(block=>block.id)).toEqual(['global']);
 expect(model.connections).toEqual([{from:'project:A',to:'A/note.md'}]);expect(JSON.stringify(settings)).toBe(before);
});
it('persists shared layout and cross-project links independently',()=>{
 const link={from:'A/note.md',to:'B/note.md'},position={x:750,y:330};
 const model=allProjectsGraph(['A','B'],{projectMaps:{[ALL_PROJECTS]:{cards:{'A/note.md':{position}}}},projectConnections:{[ALL_PROJECTS]:[link]}},children);
 expect(model.map.cards?.['A/note.md'].position).toEqual(position);expect(model.connections).toContainEqual(link);
});
it('hides inherited links only on the shared canvas',()=>{
 const link={from:'project:A',to:'A/note.md'},settings:Settings={projectConnections:{A:[link]},projectMaps:{[ALL_PROJECTS]:{hiddenConnections:[link]}}};
 expect(allProjectsGraph(['A'],settings,children).connections).toEqual([]);expect(settings.projectConnections?.A).toEqual([link]);
});
it('handles an empty vault and restores the shared-map tab',()=>{
 const model=allProjectsGraph([],{},children);expect(model.roots).toEqual([]);expect(model.map.blocks).toEqual([]);
 const location={kind:'graph' as const,project:ALL_PROJECTS};expect(tabLocation(locationTabKey(location))).toEqual(location);
});
it('packs branches by occupied card bounds instead of reserving a viewport for each project',()=>{
 const model=allProjectsGraph(['A','B'],{},children),a=model.map.cards!['project:A'].position!,b=model.map.cards!['project:B'].position!;
 expect(b.x-a.x).toBeGreaterThan(250);expect(b.x-a.x).toBeLessThan(500);
 expect(model.map.cards!['project:'+ALL_PROJECTS].position!.x).toBe((a.x+b.x)/2);
});
