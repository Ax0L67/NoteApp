import {Component,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import './fonts.css';
import './workspace.css';
import './appearance.css';
import './explorer.css';
import './dock.css';
import './centralWindows.css';
import './noteFeatures.css';
import './textures.css';
function StartupError({error}:{error:unknown}){
 const message=error instanceof Error?error.message:String(error);
 return <main role="alert" style={{height:'100vh',display:'grid',placeContent:'center',gap:10,padding:32,background:'#1b1b1b',color:'#eee',fontFamily:'Segoe UI,sans-serif'}}>
  <strong>Не удалось запустить NoteApp</strong><code style={{maxWidth:800,whiteSpace:'pre-wrap',color:'#c0c0c0'}}>{message}</code>
 </main>;
}
class StartupBoundary extends Component<{children:ReactNode},{error:unknown}> {
 state={error:null as unknown};
 static getDerivedStateFromError(error:unknown){return {error};}
 render(){return this.state.error?<StartupError error={this.state.error}/>:this.props.children;}
}
const root=createRoot(document.getElementById('root')!);
void import('./App').then(({default:App})=>root.render(<StartupBoundary><App/></StartupBoundary>)).catch(error=>root.render(<StartupError error={error}/>));
