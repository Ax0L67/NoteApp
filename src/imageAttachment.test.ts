import {expect,it} from 'vitest';
import {imageWidgetMarkdown} from './imageAttachment';

it('adds a movable image layout without changing other attachments',()=>{
 const position={width:320,x:12,y:24,z:2};
 expect(imageWidgetMarkdown('![image](attachments/image.png)',position)).toBe('![image](attachments/image.png#noteapp-width=320&x=12&y=24&z=2)');
 expect(imageWidgetMarkdown('[file](attachments/file.pdf)',position)).toBe('[file](attachments/file.pdf)');
});
