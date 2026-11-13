import {describe,expect,it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {codeFileName,codeMarkdown,codeOptions,noteCodeBlocks} from './noteCode';
import {codeWidgets} from './noteCodeWidgets';

describe('note code blocks',()=>{
  it('reads existing Python and C++ fences without rewriting their code',()=>{
    const source='Before\n```python\nprint("Привет")\n```\n\n~~~c++\nint main() {}\n~~~\nAfter';
    const blocks=noteCodeBlocks(source);
    expect(blocks.map(b=>b.language)).toEqual(['python','cpp']);
    expect(blocks[0].code).toBe('print("Привет")');
    for(const block of blocks)expect(source.slice(block.from,block.to)).toBe(block.source);
  });
  it('round trips code, stdin and widget appearance as portable Markdown',()=>{
    const options={id:'test-1',fileName:'main.py',stdin:'2\n3\n',widget:{x:16,y:32,width:720,height:480,z:3,color:'#abcdef',fill:'#123456'}};
    const code='print("``` and ~~~")\n\n';
    const [block]=noteCodeBlocks(codeMarkdown('python',code,options));
    expect(block.code).toBe(code);
    expect(block.options).toEqual(options);
    expect(block.language).toBe('python');
  });
  it('does not discover runnable code inside another fence or an unfinished fence',()=>{
    expect(noteCodeBlocks('````text\n```python\nprint(1)\n```\n````')).toEqual([]);
    expect(noteCodeBlocks('```python\nprint(1)')).toEqual([]);
    expect(noteCodeBlocks('```noteapp-widget-1-1\n```cpp\nint main() {}\n```')).toEqual([]);
  });
  it('accepts CRLF, aliases and a longer closing fence',()=>{
    const [block]=noteCodeBlocks('```py\r\nprint(1)\r\n`````\r\n');
    expect(block.language).toBe('python');expect(block.code).toBe('print(1)');
  });
  it('falls back safely on malformed metadata and rejects paths and executable settings',()=>{
    const [block]=noteCodeBlocks('```cpp noteapp-code=%broken\nint main() {}\n```');
    expect(block.options).toEqual({fileName:'main.cpp',stdin:''});
    for(const file of ['../a.py','C:\\a.py','a.py.exe','a.py:stream','.py'])expect(codeFileName(file,'python')).toBe('main.py');
    expect(codeOptions('python',{trusted:true,command:'cmd',interpreter:'evil.exe',fileName:'a.py'})).toEqual({fileName:'a.py',stdin:''});
  });
  it('bounds persisted geometry and rejects invalid colors',()=>{
    expect(codeOptions('cpp',{widget:{x:-1,y:1,width:1e20,height:0,z:4,fill:'url(https://example.com)',color:'#abc123'}}).widget)
      .toEqual({x:0,y:1,width:1600,height:64,z:4,color:'#abc123'});
    expect(codeOptions('cpp',{widget:{x:NaN,y:1,width:700,height:400,z:2}}).widget).toBeUndefined();
  });
  it('keeps the widget decoration when the selection enters its source',()=>{
    const source=codeMarkdown('cpp','int main() {}',{fileName:'main.cpp',stdin:''});
    const field=codeWidgets(),state=EditorState.create({doc:source,selection:{anchor:5},extensions:[field]});
    let count=0;state.field(field).between(0,source.length,()=>{count++});expect(count).toBe(1);
    const changed=state.update({changes:{from:0,insert:'Heading\n'}}).state;
    changed.field(field).between(0,changed.doc.length,(from)=>expect(from).toBe(8));
  });
});
