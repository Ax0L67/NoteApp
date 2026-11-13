const bundledFonts = [
  'Inter',
  'Comfortaa', 'Commissioner', 'Cormorant Garamond', 'Dela Gothic One', 'Exo 2',
  'Fira Sans', 'Geologica', 'Golos Text', 'IBM Plex Mono', 'IBM Plex Sans',
  'Literata', 'Manrope', 'Mulish', 'Noto Serif', 'Onest', 'Pixelify Sans',
  'Press Start 2P', 'PT Sans', 'Rubik', 'Source Sans 3', 'Unbounded', 'Yeseva One',
];

export function fontStack(value?: string) {
  const family = validFont(value);
  const fallback = 'Inter, "Segoe UI", sans-serif';
  return family ? `"${family}", ${fallback}` : fallback;
}

export function validFont(value?: string) {
  return value && bundledFonts.includes(value) ? value : '';
}

export default function FontPicker({value, change, label = 'Шрифт текста', inherited = 'Как в приложении'}: {
  value?: string;
  change: (name: string) => void;
  label?: string;
  inherited?: string;
}) {
  return <select className="font-picker" aria-label={label} title={label} value={validFont(value)}
    onChange={event => change(event.target.value)}>
    <option value="">{inherited}</option>
    {bundledFonts.map(name => <option key={name}>{name}</option>)}
  </select>;
}
