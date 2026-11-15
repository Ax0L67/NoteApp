import {syntaxTree} from '@codemirror/language';
import {Decoration,EditorView,ViewPlugin,type ViewUpdate} from '@codemirror/view';

function rules(view:EditorView) {
 const ranges:ReturnType<Decoration['range']>[]=[];
 syntaxTree(view.state).iterate({enter(node){
  if(node.name!=='HorizontalRule')return;
  const line=view.state.doc.lineAt(node.from);
  ranges.push(Decoration.line({class:'note-horizontal-rule'}).range(line.from));
  ranges.push(Decoration.replace({}).range(node.from,node.to));
 }});
 return Decoration.set(ranges,true);
}
export const noteHorizontalRule=ViewPlugin.fromClass(class {
 decorations;
 constructor(view:EditorView){this.decorations=rules(view);}
 update(update:ViewUpdate){if(update.docChanged||syntaxTree(update.state)!==syntaxTree(update.startState))this.decorations=rules(update.view);}
},{decorations:plugin=>plugin.decorations});
