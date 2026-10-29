import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Settings } from '../../settings.ts';
import { ReviewCellPreview, ViewPreview } from './ViewPreview.tsx';

interface Choice {
  label: string;
  hint: string;
  picked: boolean;
  pick: () => void;
  preview: ReactNode;
}

// Walks through the look of the board with a picture for every choice (SET-21). Each choice applies at once, so the
// board behind the dialog changes with it.
export function SetupWizard({ settings, onChange, onClose }: { settings: Settings; onChange: (settings: Settings) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { theme, density, reviewColumn } = settings;
  // The other steps draw in the theme picked, or in light and dark when it follows the system.
  const shown = theme === 'system' ? 'split' : theme;
  const set = (change: Partial<Settings>) => onChange({ ...settings, ...change });
  const steps: { title: string; text: string; choices: Choice[] }[] = [
    {
      title: 'Theme',
      text: 'Pick the colors of the board.',
      choices: [
        { label: 'System', hint: 'Follows the light or dark setting of your system.', picked: theme === 'system', pick: () => set({ theme: 'system' }),
          preview: <ViewPreview theme="split" density={density} review={reviewColumn} /> },
        { label: 'Light', hint: 'Dark text on a light background.', picked: theme === 'light', pick: () => set({ theme: 'light' }),
          preview: <ViewPreview theme="light" density={density} review={reviewColumn} /> },
        { label: 'Dark', hint: 'Light text on a dark background.', picked: theme === 'dark', pick: () => set({ theme: 'dark' }),
          preview: <ViewPreview theme="dark" density={density} review={reviewColumn} /> },
      ],
    },
    {
      title: 'Row density',
      text: 'Pick how much room each pull request takes.',
      choices: [
        { label: 'Comfortable', hint: 'More space around each row.', picked: density === 'comfortable', pick: () => set({ density: 'comfortable' }),
          preview: <ViewPreview theme={shown} density="comfortable" review={reviewColumn} /> },
        { label: 'Compact', hint: 'More rows on the screen at once.', picked: density === 'compact', pick: () => set({ density: 'compact' }),
          preview: <ViewPreview theme={shown} density="compact" review={reviewColumn} /> },
      ],
    },
    {
      title: 'Review column',
      text: 'Pick how the Review column shows reviews.',
      choices: [
        { label: 'Code', hint: 'One short code per PR: ✓ approved, CR changes requested.', picked: reviewColumn === 'code',
          pick: () => set({ reviewColumn: 'code' }), preview: <ReviewCellPreview theme={shown} review="code" /> },
        { label: 'Reviewers', hint: 'Every reviewer with GitHub\'s icons; your own pending review stands out.', picked: reviewColumn === 'list',
          pick: () => set({ reviewColumn: 'list' }), preview: <ReviewCellPreview theme={shown} review="list" /> },
      ],
    },
  ];
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
        <div className="wizard-top">
          <h2 id="wizard-title">Set up your board</h2>
          <span className="muted">Step {step + 1} of {steps.length}</span>
        </div>
        <h3>{current.title}</h3>
        <p className="muted">{current.text}</p>
        <div className={'wizard-choices n' + current.choices.length} role="group" aria-label={current.title}>
          {current.choices.map((choice) => {
            const hintId = 'wizard-hint-' + choice.label.toLowerCase().replace(/\W+/g, '-');
            return (
              <button key={choice.label} type="button" className="wizard-card" aria-pressed={choice.picked} onClick={choice.pick}
                aria-label={choice.label} aria-describedby={hintId}>
                {choice.preview}
                <strong>{choice.label}</strong>
                <span className="muted" id={hintId}>{choice.hint}</span>
              </button>
            );
          })}
        </div>
        <div className="wizard-foot">
          <span className="muted">You can change these later in Settings.</span>
          <button type="button" className="btn ghost" onClick={onClose}>Skip</button>
          {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button> : null}
          {last ? <button type="button" className="btn primary" onClick={onClose}>Done</button>
            : <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>Next</button>}
        </div>
      </div>
    </div>
  );
}
