export function noteFenceRanges(text:string) {
 const ranges:{from:number;to:number}[]=[];let open:{from:number;char:string;length:number}|undefined;
 for(const match of text.matchAll(/[^\n]*(?:\n|$)/g)){
  if(!match[0])continue;const marker=/^ {0,3}([\x60]{3,}|~{3,})([^\r\n]*)/.exec(match[0]);if(!marker)continue;
  if(!open){open={from:match.index!,char:marker[1][0],length:marker[1].length};continue;}
  if(marker[1][0]===open.char&&marker[1].length>=open.length&&!marker[2].trim()){ranges.push({from:open.from,to:match.index!+match[0].replace(/\r?\n$/, '').length});open=undefined;}
 }
 if(open)ranges.push({from:open.from,to:text.length});return ranges;
}
