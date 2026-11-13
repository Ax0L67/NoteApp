import {afterEach,expect,it,vi} from 'vitest';
import {nativeNotePng,nativeGraphPng,pngCanvas} from './nativePng';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
function environment(width=100,height=100){
 const drawImage=vi.fn(),canvas={getContext:()=>({drawImage}),toBlob:(done:(blob:Blob)=>void)=>done(new Blob(['png'],{type:'image/png'})),width:0,height:0};
 vi.stubGlobal('document',{createElement:()=>canvas});
 vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{callback();return 1;});
 vi.stubGlobal('Image',class{width=width;height=height;src='';decode=()=>Promise.resolve();});
 invoke.mockResolvedValue('png-data');return {canvas,drawImage};
}
it('captures all note strips without repeating the overlapping last page and restores scrolling',async()=>{
 const {drawImage}=environment();let top=42;
 const scroll={clientWidth:100,clientHeight:100,scrollHeight:250,style:{scrollBehavior:'smooth'},get scrollTop(){return top;},set scrollTop(value:number){top=Math.min(150,value);},getBoundingClientRect:()=>({left:20,top:30})} as HTMLElement;
 await nativeNotePng(scroll);
 expect(drawImage.mock.calls.map(call=>call.slice(2))).toEqual([
  [0,100,100,0,0,100,100],[0,100,100,0,100,100,100],[50,100,50,0,200,100,50],
 ]);
 expect(scroll.scrollTop).toBe(42);expect(scroll.style.scrollBehavior).toBe('smooth');
 expect(invoke).toHaveBeenCalledWith('capture_png_region',{x:20,y:30,width:100,height:100});
});
it('restores note position when native capture fails',async()=>{
 environment();invoke.mockRejectedValueOnce(Error('capture failed'));
 const scroll={clientWidth:100,clientHeight:100,scrollHeight:250,scrollTop:42,style:{scrollBehavior:'smooth'},getBoundingClientRect:()=>({left:0,top:0})} as HTMLElement;
 await expect(nativeNotePng(scroll)).rejects.toThrow('capture failed');expect(scroll.scrollTop).toBe(42);expect(scroll.style.scrollBehavior).toBe('smooth');
});
it('restores the graph camera on failure',async()=>{
 environment();invoke.mockRejectedValueOnce(Error('capture failed'));
 const content={style:{cssText:'transform:scale(.5)'},querySelectorAll:()=>[],querySelector:()=>null};
 const scroll={clientWidth:100,clientHeight:100,querySelector:()=>content,getBoundingClientRect:()=>({left:0,top:0})} as unknown as HTMLElement;
 await expect(nativeGraphPng(scroll)).rejects.toThrow('capture failed');expect(content.style.cssText).toBe('transform:scale(.5)');
});
it('rejects exports beyond the canvas budget',()=>{
 environment();expect(()=>pngCanvas(10000,10000)).toThrow();expect(()=>pngCanvas(0,100)).toThrow();
});
