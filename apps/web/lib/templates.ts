// 17 professional templates (light & dark) — presets sharing the layout, differing
// by accent color and mode. The card stores templateId + theme { accent, mode }.

export interface Template {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  accent: string;
  cover?: 'gradient' | 'constellation' | 'solid';
  avatar?: 'circle' | 'square';
}

export const TEMPLATES: Template[] = [
  { id: 'carbon', name: 'Carbon (Mono)', mode: 'dark', accent: '#ffffff', cover: 'constellation', avatar: 'circle' },
  { id: 'onyx', name: 'Onyx', mode: 'dark', accent: '#7f77dd', cover: 'constellation', avatar: 'circle' },
  { id: 'swiss-indigo', name: 'Swiss Indigo', mode: 'light', accent: '#534ab7' },
  { id: 'swiss-teal', name: 'Swiss Teal', mode: 'light', accent: '#1d9e75' },
  { id: 'swiss-coral', name: 'Swiss Coral', mode: 'light', accent: '#d85a30' },
  { id: 'swiss-pink', name: 'Swiss Pink', mode: 'light', accent: '#d4537e' },
  { id: 'swiss-blue', name: 'Swiss Blue', mode: 'light', accent: '#2563eb' },
  { id: 'swiss-amber', name: 'Swiss Amber', mode: 'light', accent: '#b45309' },
  { id: 'swiss-green', name: 'Swiss Green', mode: 'light', accent: '#15803d' },
  { id: 'swiss-slate', name: 'Swiss Slate', mode: 'light', accent: '#475569' },
  { id: 'swiss-violet', name: 'Swiss Violet', mode: 'light', accent: '#7c3aed' },
  { id: 'noir-indigo', name: 'Noir Indigo', mode: 'dark', accent: '#7f77dd' },
  { id: 'noir-teal', name: 'Noir Teal', mode: 'dark', accent: '#5dcaa5' },
  { id: 'noir-coral', name: 'Noir Coral', mode: 'dark', accent: '#f0997b' },
  { id: 'noir-pink', name: 'Noir Pink', mode: 'dark', accent: '#ed93b1' },
  { id: 'noir-blue', name: 'Noir Blue', mode: 'dark', accent: '#60a5fa' },
  { id: 'noir-amber', name: 'Noir Amber', mode: 'dark', accent: '#fbbf24' },
  { id: 'noir-green', name: 'Noir Green', mode: 'dark', accent: '#4ade80' },
  { id: 'noir-mono', name: 'Noir Mono', mode: 'dark', accent: '#e5e5e5' },
];

export function templateById(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
