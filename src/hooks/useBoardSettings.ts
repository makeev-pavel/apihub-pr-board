// Personal settings from this browser, and the settings that live in the page address: the repositories to show, the
// extra bots, the hidden columns, and the repository groups. Components see one Settings object whose extra bots come from the address.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyLinkColumns, applyLinkGroups, cleanBots, moveStoredBots, readLinkSettings } from '../board/link.ts';
import { groupsToText } from '../board/groups.ts';
import { loadSettings, saveSettings } from '../settings.ts';
import type { Settings } from '../settings.ts';

export function useBoardSettings() {
  const [start] = useState(() => {
    const bots = moveStoredBots(loadSettings(), readLinkSettings());
    const columns = applyLinkColumns(bots.settings, bots.link);
    const groups = applyLinkGroups(columns.settings, columns.link);
    return { settings: groups.settings, link: groups.link, changed: bots.moved || columns.changed || groups.changed };
  });
  const [stored, setStored] = useState(start.settings);
  const [link, setLink] = useState(start.link);
  useEffect(() => { if (start.changed) saveSettings(start.settings); }, [start]);

  const settings = useMemo(() => ({ ...stored, rules: { ...stored.rules, extraBots: link.bots } }), [stored, link.bots]);
  const setSettings = useCallback((next: Settings) => {
    const kept = { ...next, rules: { ...next.rules, extraBots: [] } };
    saveSettings(kept);
    setStored(kept);
    // The same link object when bots, columns, and groups did not change: a theme change then leaves the address alone.
    const bots = cleanBots(next.rules.extraBots);
    const hidden = next.hiddenColumns;
    const groups = next.repoGroups;
    setLink((prev) => (bots.join(',') === prev.bots.join(',') && hidden.join(',') === (prev.hidden || []).join(',')
      && groupsToText(groups) === groupsToText(prev.groups || []) ? prev : { ...prev, bots, hidden, groups }));
  }, []);
  const setRepos = useCallback((repos: string[]) => setLink((prev) => ({ ...prev, repos })), []);
  return { settings, setSettings, link, setRepos };
}
