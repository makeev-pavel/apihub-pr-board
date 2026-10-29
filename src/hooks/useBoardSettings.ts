// Personal settings from this browser, and the settings that live in the page address: the repositories to show, the
// extra bots, and the hidden columns. Components see one Settings object whose extra bots come from the address.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyLinkColumns, cleanBots, moveStoredBots, readLinkSettings } from '../board/link.ts';
import { loadSettings, saveSettings } from '../settings.ts';
import type { Settings } from '../settings.ts';

export function useBoardSettings() {
  const [start] = useState(() => {
    const bots = moveStoredBots(loadSettings(), readLinkSettings());
    const columns = applyLinkColumns(bots.settings, bots.link);
    return { settings: columns.settings, link: columns.link, changed: bots.moved || columns.changed };
  });
  const [stored, setStored] = useState(start.settings);
  const [link, setLink] = useState(start.link);
  useEffect(() => { if (start.changed) saveSettings(start.settings); }, [start]);

  const settings = useMemo(() => ({ ...stored, rules: { ...stored.rules, extraBots: link.bots } }), [stored, link.bots]);
  const setSettings = useCallback((next: Settings) => {
    const kept = { ...next, rules: { ...next.rules, extraBots: [] } };
    saveSettings(kept);
    setStored(kept);
    // Keeping the same link when the bots did not change spares re-deriving every PR on a theme or column change.
    const bots = cleanBots(next.rules.extraBots);
    const hidden = next.hiddenColumns;
    setLink((prev) => (bots.join(',') === prev.bots.join(',') && hidden.join(',') === (prev.hidden || []).join(',') ? prev
      : { ...prev, bots, hidden }));
  }, []);
  const setRepos = useCallback((repos: string[]) => setLink((prev) => ({ ...prev, repos })), []);
  return { settings, setSettings, link, setRepos };
}
