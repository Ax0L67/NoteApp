import type {DockLayout,DockPanel} from './dockLayout';
export interface Note {path:string;content:string;revision:string}
export interface Template {name:string;content:string}
export interface Task {id:string;title:string;description:string;due?:string;priority:'low'|'normal'|'high';status:string;notes:string[]}
export interface TaskBoard {id:string;name:string;project:string;columns:string[];tasks:Task[];hiddenColumns?:string[];compact?:boolean}
export type TextAppearance = {lineHeight?:number;textColor?:string};
export interface NoteAppearance extends TextAppearance {palette?:string;background?:string|null;fontFamily?:string;fontSize?:number;paper?:'graphite'}
export interface ProjectConnection {from:string;to:string;label?:string}
export interface MapPoint {x:number;y:number}
export interface MapCard {texture?:string;position?:MapPoint;size?:{width:number;height:number};comments?:string[]}
export interface MapBlock extends TextAppearance {texture?:string;id:string;position:MapPoint;size?:{width:number;height:number};text:string;fontFamily?:string}
export interface ProjectMap extends TextAppearance {cards?:Record<string,MapCard>;hiddenConnections?:ProjectConnection[];text?:string;blocks?:MapBlock[];fontFamily?:string}
export interface PanelAppearance {palette:string;blend?:string|null}
export interface Settings {textureColors?:Record<string,string>;taskBoards?:TaskBoard[];centralWindows?:import('./centralWindowState').CentralWindow[];shortcuts?:Partial<Record<import('./shortcuts').ShortcutAction,string>>;borderBrightness?:number;customPaletteColor?:string;appTransparency?:number;paletteBlend?:string;panelAppearance?:Partial<Record<DockPanel,PanelAppearance>>;overviewGridOpacity?:number;projectGridOpacity?:Record<string,number>;dailyNotes?:Record<string,string>;overviewPaletteBlend?:string;projectPaletteBlends?:Record<string,string|null>;overviewPalette?:string;overviewPattern?:string;projectPatterns?:Record<string,string>;contrast?:number;workspaceLayout?:DockLayout;palette?:string;theme?:string;fontFamily?:string;fontSize?:number;uiFontSize?:number;textWidth?:number;background?:string;favorites?:string[];recent?:string[];leftWidth?:number;rightWidth?:number;wallpaper?:boolean;active?:string;projects?:string[];projectOrder?:string[];archivedProjects?:string[];noteAppearance?:Record<string,NoteAppearance>;projectBackgrounds?:Record<string,string|null>;projectNotes?:Record<string,string>;projectPalettes?:Record<string,string|null>;projectConnections?:Record<string,ProjectConnection[]>;projectMaps?:Record<string,ProjectMap>}
export interface Snapshot {root:string;name:string;notes:Note[];folders:string[];settings:Settings;trash:{id:string;path:string;kind?:'folder'}[];templates:Template[]}
export interface SaveResult {revision:string|null;conflict?:boolean;content?:string|null}
export interface Draft {content:string;revision:string|null}

