type FramePreset = {name:string;width:number;height:number};

const categories:{name:string;presets:FramePreset[]}[]=[
 {name:'Телефон',presets:[{name:'iPhone SE',width:375,height:667},{name:'iPhone 13 / 14',width:390,height:844},{name:'iPhone 14 Pro Max',width:430,height:932},{name:'Android',width:360,height:800},{name:'Android Large',width:412,height:915}]},
 {name:'Планшет',presets:[{name:'iPad mini',width:768,height:1024},{name:'iPad Pro 11″',width:834,height:1194},{name:'iPad Pro 12.9″',width:1024,height:1366},{name:'Android Tablet',width:800,height:1280}]},
 {name:'Desktop',presets:[{name:'Ноутбук',width:1366,height:768},{name:'MacBook',width:1440,height:900},{name:'Desktop HD',width:1920,height:1080},{name:'Desktop QHD',width:2560,height:1440},{name:'Desktop 4K',width:3840,height:2160}]},
 {name:'Презентация',presets:[{name:'Широкий экран',width:1920,height:1080},{name:'HD',width:1280,height:720},{name:'Стандартная 4:3',width:1024,height:768}]},
 {name:'Часы',presets:[{name:'Apple Watch 41 мм',width:176,height:215},{name:'Apple Watch 45 мм',width:198,height:242},{name:'Watch 49 мм',width:205,height:251}]},
 {name:'Бумага',presets:[{name:'A4',width:794,height:1123},{name:'A3',width:1123,height:1587},{name:'Letter',width:816,height:1056}]},
 {name:'Соцсети',presets:[{name:'Квадратный пост',width:1080,height:1080},{name:'Вертикальный пост',width:1080,height:1350},{name:'История / Reels',width:1080,height:1920},{name:'Обложка видео',width:1280,height:720}]},
];

export default function CanvasFramePresets({choose}:{choose:(preset:FramePreset)=>void}) {
 return <section className="canvas-frame-preset-panel" aria-label="Размеры Frame">
  <header><strong>Frame</strong><span>Выберите размер</span></header>
  {categories.map(category=><details key={category.name}>
   <summary>{category.name}</summary>
   <div>{category.presets.map(preset=><button type="button" key={preset.name} onClick={()=>choose(preset)}><span>{preset.name}</span><small>{preset.width} × {preset.height}</small></button>)}</div>
  </details>)}
 </section>;
}
