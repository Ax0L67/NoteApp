export function nextNoteLayer(content:string) {
  let layer=2;
  for(const match of content.matchAll(/#noteapp-width=\d+(?:&x=\d+&y=\d+)?&z=(\d{1,9})(?=\s|\)|>|$)|noteapp-(?:text|widget)-\d+-\d+(?:-w\d+-h\d+)?-z(\d{1,9})(?=\s|$)/g)){
    layer=Math.max(layer,Number(match[1]??match[2]));
  }
  for(const match of content.matchAll(/(?:"z"\s*:\s*|\bz=)(\d{1,9})/g))layer=Math.max(layer,Number(match[1]));
  for(const match of content.matchAll(/noteapp-code=([^\s]+)/g))try{const data=JSON.parse(decodeURIComponent(match[1]));if(Number.isFinite(data.widget?.z))layer=Math.max(layer,data.widget.z);}catch{/* Ignore invalid widget metadata. */}
  return Math.min(1000000000,layer+1);
}
