import type { Snapshot } from './types';
import { folder } from './indexing';

export const defaultProjects = ['Личное', 'Учёба', 'Работа', 'Дневник'];
export const projectRoot = (project: string) => project === 'Личное' ? '' : project;
const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function projectOf(path: string, projects: string[]) {
  const root = folder(path).split('/')[0];
  return projects.find(project => sameName(project, root)) ?? 'Личное';
}

export function vaultFolders(data: Snapshot) {
  const result = new Set<string>();
  for (const path of [...data.folders, ...data.notes.map(note => folder(note.path))]) {
    if (/^attachments(?:\/|$)/i.test(path)) continue;
    for (let dir = path; dir; dir = folder(dir)) result.add(dir);
  }
  return [...result].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

export function validateFolderName(input: string) {
  const name = input.trim();
  if (!name || /^[.]|[.]$/.test(name) || /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || sameName(name, 'attachments')) {
    throw new Error('Введите допустимое имя папки без косых черт и специальных символов.');
  }
  return name;
}
