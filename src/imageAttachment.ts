export function imageWidgetMarkdown(markdown:string,position:{x:number;y:number;width:number;z:number}) {
 if(!markdown.startsWith('!['))return markdown;
 const {x,y,width,z}=position;
 return markdown.replace(/\)$/,`#noteapp-width=${Math.round(width)}&x=${Math.round(x)}&y=${Math.round(y)}&z=${Math.round(z)})`);
}
