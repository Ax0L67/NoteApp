import {widgetBorderWidth,type NoteWidgetPosition} from './noteWidgetChrome';

export type CodeLanguage='python'|'cpp';
export type CodeOptions={id?:string;fileName:string;stdin:string;color?:string;scale?:number;widget?:NoteWidgetPosition};
export type NoteCodeBlock={from:number;to:number;source:string;code:string;language:CodeLanguage;options:CodeOptions};
export const CODE_LIMIT=128*1024;
export const STDIN_LIMIT=64*1024;
export const codeExample:Record<CodeLanguage,string>={
  python:'name = input("Имя: ")\nprint("Привет, " + name + "!")',
  cpp:'#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}',
};
export function codeLanguage(value:string):CodeLanguage|undefined {
  if(/^(python|py)$/i.test(value))return 'python';
  if(/^(cpp|c\+\+|cxx)$/i.test(value))return 'cpp';
}
export function codeFileName(value:unknown,language:CodeLanguage) {
  const fallback=language==='python'?'main.py':'main.cpp';
  return typeof value==='string'&&/^[\p{L}\p{N}_ .-]{1,80}$/u.test(value)&&!value.startsWith('.')&&value.endsWith(language==='python'?'.py':'.cpp')?value:fallback;
}
export function codeOptions(language:CodeLanguage,raw:unknown={}):CodeOptions {
  const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const options:CodeOptions={fileName:codeFileName(value.fileName,language),stdin:typeof value.stdin==='string'?value.stdin.slice(0,STDIN_LIMIT):''};
  if(typeof value.id==='string'&&/^[\w-]{1,80}$/.test(value.id))options.id=value.id;
  if(typeof value.color==='string'&&/^#[\da-f]{6}$/i.test(value.color))options.color=value.color;
  if(typeof value.scale==='number'&&Number.isFinite(value.scale))options.scale=Math.max(.5,Math.min(2,value.scale));
  const w=value.widget as Record<string,unknown>|undefined;
  if(w&&typeof w==='object'&&['x','y','width','height','z'].every(key=>typeof w[key]==='number'&&Number.isFinite(w[key]))){
    const n=(key:string,min:number,max:number)=>Math.max(min,Math.min(max,w[key] as number));
    options.widget={x:n('x',0,100000),y:n('y',0,100000),width:n('width',64,1600),height:n('height',64,1200),z:n('z',1,1000000000)};
    if(typeof w.borderWidth==='number'&&Number.isFinite(w.borderWidth))options.widget.borderWidth=widgetBorderWidth(w.borderWidth);
    if(typeof w.scale==='number'&&Number.isFinite(w.scale))options.widget.scale=n('scale',.5,2);
    for(const key of ['color','fill'] as const)if(typeof w[key]==='string'&&/^#[\da-f]{6}$/i.test(w[key]))options.widget[key]=w[key];
    if(typeof w.texture==='string'&&/^[\w-]{1,80}$/.test(w.texture))options.widget.texture=w.texture;
  }
  return options;
}
export function codeMarkdown(language:CodeLanguage,code:string,options:CodeOptions) {
  const ticks='`'.repeat(Math.max(3,...[...code.matchAll(/`+/g)].map(m=>m[0].length+1)));
  return `${ticks}${language} noteapp-code=${encodeURIComponent(JSON.stringify(codeOptions(language,options)))}\n${code}\n${ticks}`;
}
// Scan every fence, including unsupported languages, so nested examples stay plain text.
export function noteCodeBlocks(text:string):NoteCodeBlock[] {
  const blocks:NoteCodeBlock[]=[];
  const lines=[...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(m=>m[0]);
  for(let i=0;i<lines.length;i++){
    const open=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(lines[i][0]);
    if(!open||(open[1][0]==='`'&&open[2].includes('`')))continue;
    const close=new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}[ \\t]*\\r?\\n?$`);
    let end=i+1;while(end<lines.length&&!close.test(lines[end][0]))end++;
    if(end===lines.length)break;
    const from=lines[i].index!,to=lines[end].index!+lines[end][0].replace(/\r?\n$/,'').length;
    const language=codeLanguage(open[2].trim().split(/\s/)[0]);
    if(language){
      let raw:unknown={};
      const meta=/(?:^|\s)noteapp-code=(\S+)/.exec(open[2]);
      if(meta&&meta[1].length<300000)try{raw=JSON.parse(decodeURIComponent(meta[1]));}catch{/* Invalid metadata must never hide the code. */}
      const start=lines[i].index!+lines[i][0].length;
      blocks.push({from,to,source:text.slice(from,to),code:text.slice(start,lines[end].index!).replace(/\r?\n$/,''),language,options:codeOptions(language,raw)});
    }
    i=end;
  }
  return blocks;
}
