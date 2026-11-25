export type CanvasExportPreset={scale:number;format?:'png'|'jpeg'};

export function CanvasExportControls({value,change,run}:{value?:CanvasExportPreset;change:(value:CanvasExportPreset|undefined)=>void;run:()=>void}) {
 return <section className="canvas-export-controls">
  <div className="canvas-export-heading"><strong>Экспорт</strong><button type="button" aria-label={value?'Удалить настройки экспорта':'Добавить настройки экспорта'} title={value?'Удалить настройки экспорта':'Добавить настройки экспорта'} onClick={()=>change(value?undefined:{scale:1})}>{value?'−':'+'}</button></div>
  {value&&<>
   <label className="note-widget-color">Масштаб<select aria-label="Масштаб экспорта" value={value.scale} onChange={event=>change({...value,scale:Number(event.target.value)})}><option value={0.5}>0,5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option></select></label>
   <label className="note-widget-color">Формат<select aria-label="Формат экспорта" value={value.format??'png'} onChange={event=>change({...value,format:event.target.value as 'png'|'jpeg'})}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
   <button type="button" onClick={run}>Экспортировать {value.format==='jpeg'?'JPEG':'PNG'}…</button>
  </>}
 </section>;
}
