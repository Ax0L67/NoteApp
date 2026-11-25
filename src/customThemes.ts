import type {CSSProperties} from 'react';

export type CustomTheme={id:string;name:string;colors:string[]};

export function paletteColors(input:string):string[] {
 const source=input.trim();
 let parts:string[];
 try {const url=new URL(source);if(url.hostname!=='coolors.co'&&url.hostname!=='www.coolors.co')return [];parts=url.pathname.split('/').filter(Boolean).at(-1)?.split('-')??[];}
 catch {parts=source.split(/[\s,;]+/);}
 return [...new Set(parts.map(value=>value.trim().replace(/^#/,'')) .filter(value=>/^[\da-f]{6}$/i.test(value)).map(value=>'#'+value.toLowerCase()))];
}

export function customThemeStyle(theme:CustomTheme):CSSProperties {
 const colors=(Array.isArray(theme.colors)?theme.colors:[]).filter(color=>typeof color==='string'&&/^#[\da-f]{6}$/i.test(color));
 if(colors.length<2)return {};
 const luminance=(color:string)=>{const channels=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722};
 const sorted=[...colors].sort((a,b)=>luminance(a)-luminance(b));
 return {'--theme-deep':sorted[0],'--theme-mid':sorted[Math.floor((sorted.length-1)/2)],'--theme-bright':colors[1],'--theme-pale':sorted[sorted.length-1]} as CSSProperties;
}
