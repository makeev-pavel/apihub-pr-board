// Personal settings from this browser, and the settings that live in the page address: the repositories to show, the
// extra bots, the hidden columns, and the repository groups. Components see one Settings object whose extra bots and
// groups come from the address.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyLinkColumns, applyLinkOrder, cleanBots, groupsToSave, linkWithGroups, moveStoredBots, readLinkSettings } from '../board/link.ts';
import { groupsToText } from '../board/groups.ts';
import { loadSettings, saveSettings } from '../settings.ts';
import type { Settings } from '../settings.ts';

export function useBoardSettings() {
  const [start] = useState(() => {
    const bots = moveStoredBots(loadSettings(), readLinkSettings());
    const columns = applyLinkColumns(bots.settings, bots.link);
    const order = applyLinkOrder(columns.settings, columns.link);
    return {
      settings: order.settings,
      link: linkWithGroups(order.link, order.settings.repoGroups),
      changed: bots.moved || columns.changed || order.changed,
    };
  });
  const [stored, setStored] = useState(start.settings);
  const [link, setLink] = useState(start.link);
  useEffect(() => { if (start.changed) saveSettings(start.settings); }, [start]);

  const shownGroups = link.groups || stored.repoGroups;
  const settings = useMemo(() => ({ ...stored, repoGroups: shownGroups, rules: { ...stored.rules, extraBots: link.bots } }),
    [stored, shownGroups, link.bots]);
  const setSettings = useCallback((next: Settings) => {
    const kept = { ...next, repoGroups: groupsToSave(next.repoGroups, shownGroups, stored.repoGroups), rules: { ...next.rules, extraBots: [] } };
    saveSettings(kept);
    setStored(kept);
    // The same link object when bots, columns, and groups did not change: a theme change then leaves the address alone.
    const bots = cleanBots(next.rules.extraBots);
    const hidden = next.hiddenColumns;
    const order = next.columnOrder;
    const groups = next.repoGroups;
    setLink((prev) => (bots.join(',') === prev.bots.join(',') && hidden.join(',') === (prev.hidden || []).join(',')
      && order.join(',') === (prev.order || []).join(',')
      && groupsToText(groups) === groupsToText(prev.groups || []) ? prev : { ...prev, bots, hidden, order, groups }));
  }, [shownGroups, stored.repoGroups]);
  const setRepos = useCallback((repos: string[]) => setLink((prev) => ({ ...prev, repos })), []);
  return { settings, setSettings, link, setRepos };
}
