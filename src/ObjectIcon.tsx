import {House,Folder,FileText,Stack,SquaresFour,BookOpen,BookmarkSimple,Star,Heart,Lightbulb,CalendarBlank,CheckCircle,Gear,Globe,Compass,MapPin,Flag,Tag,Briefcase,GraduationCap,Code,Camera,Image,MusicNotes,Video,ChartBar,Atom,Flask,Leaf,Sun,Moon,Cloud,Lock,Key,Clock,Archive,Notebook,Palette,PenNib,Buildings,Gift,Target} from '@phosphor-icons/react';
import type {ComponentType} from 'react';
import type {ExplorerItem} from './Explorer';
type Icon=ComponentType<{size?:number;weight?:'regular'|'fill';className?:string}>;
export const objectIcons={House,Folder,FileText,Stack,SquaresFour,BookOpen,BookmarkSimple,Star,Heart,Lightbulb,CalendarBlank,CheckCircle,Gear,Globe,Compass,MapPin,Flag,Tag,Briefcase,GraduationCap,Code,Camera,Image,MusicNotes,Video,ChartBar,Atom,Flask,Leaf,Sun,Moon,Cloud,Lock,Key,Clock,Archive,Notebook,Palette,PenNib,Buildings,Gift,Target} as Record<string,Icon>;
export const objectIconKey=(item:Pick<ExplorerItem,'kind'|'path'>)=>item.kind+':'+item.path;
export function ObjectIcon({item,icons,size=20,expanded=false}:{item:Pick<ExplorerItem,'kind'|'path'>;icons?:Record<string,string>;size?:number;expanded?:boolean}) {
 const chosen=icons?.[objectIconKey(item)],Icon=objectIcons[chosen??'']??(item.kind==='project'?Stack:item.kind==='folder'?Folder:item.path.endsWith('.canvas')?SquaresFour:FileText);
 return <Icon size={size} weight={expanded&&item.kind==='folder'?'fill':'regular'}/>;
}
