import { useEffect } from 'react';
import { Check, Moon, Settings, Sun, X } from 'lucide-react';
import type { Theme } from '../lib/theme';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
};

const options: Array<{ value: Theme; label: string; description: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Modo claro', description: 'Fondo luminoso y paneles blancos.', icon: Sun },
  { value: 'dark', label: 'Modo oscuro', description: 'Tonos grafito para trabajar con menos brillo.', icon: Moon },
];

export function SettingsModal({ isOpen, onClose, theme, onThemeChange }: SettingsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Settings className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-title" className="text-lg font-semibold text-slate-800">Configuración</h2>
              <p className="text-sm text-slate-500">Personalizá cómo se ve Avenida Animal.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar configuración">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5 sm:p-6">
          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-slate-800">Apariencia</legend>
            <p className="mb-4 text-sm text-slate-500">La preferencia queda guardada en este navegador.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {options.map(({ value, label, description, icon: Icon }) => {
                const selected = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onThemeChange(value)}
                    aria-pressed={selected}
                    className={`relative rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'}`}
                  >
                    <span className={`mb-4 grid h-9 w-9 place-items-center rounded-lg ${selected ? 'bg-[#2563EB] text-white' : 'bg-white text-slate-600'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                    {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-blue-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}
