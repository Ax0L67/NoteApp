export const textures = [
  {id:'texture-paper001',name:'Белая бумага',file:'paper001.jpg',color:'#ddd9ce'},
  {id:'texture-paper006',name:'Бежевая бумага',file:'paper006.jpg',color:'#bca386'},
  {id:'texture-wood048',name:'Светлое дерево',file:'wood048.jpg',color:'#b79870'},
  {id:'texture-fabric004',name:'Карбон',file:'fabric004.jpg',color:'#373b40'},
  {id:'texture-fabric030',name:'Серая ткань',file:'fabric030.jpg',color:'#898989'},
  {id:'texture-fabric036',name:'Тканое полотно',file:'fabric036.jpg',color:'#96918a'},
  {id:'texture-concrete015',name:'Тёмный бетон',file:'concrete015.jpg',color:'#656463'},
  {id:'texture-concrete026',name:'Бетон',file:'concrete026.jpg',color:'#898c82'},
  {id:'texture-foil001',name:'Фольга',file:'foil001.jpg',color:'#b7b9ba'},
  {id:'texture-marble002',name:'Чёрный мрамор',file:'marble002.jpg',color:'#3e4144'},
  {id:'texture-marble026',name:'Бежевый мрамор',file:'marble026.jpg',color:'#b7a28d'},
  {id:'texture-metal011',name:'Шлифованный металл',file:'metal011.jpg',color:'#999c9d'},
  {id:'texture-metal060c',name:'Матовый никель',file:'metal060c.jpg',color:'#8f9290'},
  {id:'texture-sheetmetal001',name:'Металлическая сетка',file:'sheetmetal001.jpg',color:'#929597'},
  {id:'texture-tiles072',name:'Чёрные соты',file:'tiles072.jpg',color:'#343537'},
] as const;
export const textureById=(id?:string)=>textures.find(texture=>texture.id===id);
export function applyTextureClass(element:HTMLElement,id?:string) {
  for(const name of [...element.classList])if(name.startsWith('palette-texture-'))element.classList.remove(name);
  if(textureById(id))element.classList.add(`palette-${id}`);
}
