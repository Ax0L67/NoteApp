import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { CaretDown, CaretRight, DotsThree, FilePlus, FileText, Folder, FolderOpen, FolderPlus, Stack, Trash, SquaresFour } from '@phosphor-icons/react';
import { folder, title } from './indexing';
import { NoteBackdrop } from './appearance';
import type { Note } from './types';

export type ExplorerItem = { kind: 'project' | 'folder' | 'note'; project: string; path: string; name: string };
export type ExplorerMenu = { item: ExplorerItem; x: number; y: number };
export type Location = { kind: 'home' } | { kind: 'graph'; project: string } | { kind: 'folder'; project: string; path: string } | { kind: 'note'; path: string };
type OpenMenu = (event: MouseEvent, item: ExplorerItem) => void;

export function entriesIn(project: string, dir: string, folders: string[], notes: Note[], projectFor: (path: string) => string): ExplorerItem[] {
  const belongs = (path: string) => folder(path).toLocaleLowerCase() === dir.toLocaleLowerCase();
  const directories = folders.filter(path => belongs(path) && projectFor(path + '/note.md') === project);
  const files = notes.filter(n => belongs(n.path) && projectFor(n.path) === project);
  return [
    ...directories.map(path => ({kind: 'folder' as const, project, path, name: path.split('/').at(-1)!})),
    ...files.sort((a, b) => title(a.path).localeCompare(title(b.path), 'ru', {numeric: true}))
      .map(n => ({kind: 'note' as const, project, path: n.path, name: title(n.path)})),
  ];
}

export const itemKey = (item: ExplorerItem) => JSON.stringify([item.kind, item.project, item.path]);
const itemIcon = (item: ExplorerItem, expanded = false, size = 20) => {
  if (item.kind === 'project') return <Stack size={size}/>;
  if (item.kind === 'note') return <FileText size={size}/>;
  return expanded ? <FolderOpen size={size}/> : <Folder size={size}/>;
};

function MenuButton({ item, showMenu }: { item: ExplorerItem; showMenu: OpenMenu }) {
  return <button className="explorer-more icon-button" title={`Действия · ${item.name}`}
    aria-label={`Действия · ${item.name}`} aria-haspopup="menu"
    onClick={event => showMenu(event, item)}><DotsThree size={22}/></button>;
}

export function ExplorerTree({ roots, childrenOf, expanded, active, open, toggle, showMenu, projectPalette }: {
  roots: ExplorerItem[];
  childrenOf: (item: ExplorerItem) => ExplorerItem[];
  expanded: string[];
  active: (item: ExplorerItem) => boolean;
  open: (item: ExplorerItem) => void;
  toggle: (item: ExplorerItem) => void;
  showMenu?: OpenMenu;
  projectPalette?: (project:string)=>string;
}) {
  function branch(item: ExplorerItem) {
    const key = itemKey(item);
    const isFolder = item.kind !== 'note';
    const isExpanded = isFolder && expanded.includes(key);
    return <li key={key}>
      <div className={`explorer-row ${active(item) ? 'current-item' : ''}`}
        onContextMenu={showMenu?event => showMenu(event,item):undefined}>
        {isFolder
          ? <button type="button" className="explorer-caret" aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Свернуть' : 'Развернуть'} «${item.name}»`}
              onClick={() => toggle(item)}>{isExpanded ? <CaretDown size={13}/> : <CaretRight size={13}/>}</button>
          : <span className="explorer-indent"/>}
        <button type="button" className="explorer-name" title={item.name} aria-current={active(item) ? 'location' : undefined}
          onClick={() => open(item)}>{item.kind==='project'&&projectPalette?
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" strokeLinejoin="round" className={`project-tree-icon palette-${projectPalette(item.project)}`} aria-hidden="true">
              <path d="m12 3 10 5-10 5L2 8Z" fill="var(--swatch-color, var(--palette-highlight, var(--palette-hue)))"/>
              <path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>
            </svg>:itemIcon(item, isExpanded)}<span>{item.name}</span></button>
        {showMenu&&<MenuButton item={item} showMenu={showMenu}/>}
      </div>
      {isExpanded && <ul className="explorer-branch">{childrenOf(item).map(branch)}</ul>}
    </li>;
  }
  return <nav className="explorer-tree" aria-label="Дерево проектов"><ul>{roots.map(branch)}</ul></nav>;
}

export function FolderContents({ name, background, root, entries, open, showMenu, actions }: {
  name: string; background: string | null; root: string;
  entries: ExplorerItem[]; open: (item: ExplorerItem) => void; showMenu: OpenMenu;
  actions: ReactNode;
}) {
  return <main className="folder-contents glass-panel" aria-labelledby="folder-title">
    <NoteBackdrop path={background} root={root}/>
    <div className="folder-content">
      {actions}
      <header className="folder-heading"><h1 id="folder-title">{name}</h1><span>Объектов: {entries.length}</span></header>
      {entries.length ? <><div className="file-columns" aria-hidden="true"><span>Имя</span><span>Тип</span></div>
        <ul className="file-list">{entries.map(item => <li key={itemKey(item)} onContextMenu={event => showMenu(event, item)}>
          <button className="file-open" title={item.name} onClick={() => open(item)}>
            <span>{itemIcon(item, false, 23)}<strong>{item.name}</strong></span>
            <small>{item.kind === 'folder' ? 'Папка' : 'Заметка Markdown'}</small>
          </button>
          <MenuButton item={item} showMenu={showMenu}/>
        </li>)}</ul></> : <div className="folder-empty"><FolderOpen size={34}/><p>В этой папке пока пусто</p><small>Создайте заметку или папку на панели сверху.</small></div>}
    </div>
  </main>;
}

export function ExplorerContextMenu({ menu, close, newNote, newFolder, rename, move, remove, openSeparate }: {
  menu: ExplorerMenu; close: () => void; newNote: () => void; newFolder: () => void; rename: () => void; remove: () => void;
  openSeparate:()=>void;
  move:()=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const element=ref.current!;
    const bounds=element.getBoundingClientRect();
    element.style.left=Math.max(8,Math.min(menu.x,window.innerWidth-bounds.width-8))+'px';
    element.style.top=Math.max(8,Math.min(menu.y,window.innerHeight-bounds.height-8))+'px';
  },[menu]);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      if (trigger instanceof HTMLElement && document.activeElement === document.body) trigger.focus();
    };
  }, [menu, close]);
  const pick = (action: () => void) => { close(); action(); };
  return <div ref={ref} className="explorer-context glass-panel" role="menu" aria-label={menu.item.name}
    style={{left: menu.x, top: menu.y}} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    }}>
    <button role="menuitem" onClick={()=>pick(openSeparate)}><SquaresFour size={19}/>Открыть в отдельной вкладке</button>
    <button role="menuitem" disabled={menu.item.kind==='project'&&!menu.item.path} onClick={()=>pick(move)}><Folder size={19}/>Переместить…</button>
    {menu.item.kind !== 'note' ? <>
      <button role="menuitem" onClick={() => pick(newNote)}><FilePlus size={19}/>Новая заметка</button>
      <button role="menuitem" onClick={() => pick(newFolder)}><FolderPlus size={19}/>Новая папка</button>
    </> : <button role="menuitem" onClick={() => pick(rename)}><FileText size={19}/>Переименовать / переместить</button>}
    <button role="menuitem" className="context-remove" onClick={() => pick(remove)}><Trash size={19}/>В корзину</button>
  </div>;
}
