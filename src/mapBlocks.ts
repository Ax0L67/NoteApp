import type {MapBlock,ProjectMap} from './types';

export const mapNotesPath = 'map-notes.md';
export const mapBlockKey = (id:string) => 'annotation:'+id;

export function mapBlocks(map:ProjectMap): MapBlock[] {
  return map.blocks ?? (map.text ? [{id:'legacy-map-notes',position:{x:48,y:210},text:map.text}] : []);
}
