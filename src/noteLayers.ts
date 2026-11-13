export function nextNoteLayer(content:string) {
  let layer=2;
  for(const match of content.matchAll(/#noteapp-width=\d+(?:&x=\d+&y=\d+)?&z=(\d{1,9})(?=\s|\)|>|$)|noteapp-text-\d+-\d+-z(\d{1,9})(?=\s|$)/g)){
    layer=Math.max(layer,Number(match[1]??match[2]));
  }
  return layer+1;
}
