/**
 * End-user thumbnail settings (B15), rendered by zodal-dials. Lazy-loaded: zod and
 * dials stay out of the list's bundle.
 */
import { useEffect, useMemo } from 'react';
import { SettingsPanel } from '@zodal/dials-ui-shadcn';
import { bindSettings, createSigilSettingsStore, defineSigilSettings } from 'sigilsmith/zodal/settings';
import { useSigilSettings } from 'sigilsmith/react';
import { sigil } from './sigilsmith.gen';

const settings = defineSigilSettings(sigil.config); // labels come from the generator manifests
const { store, view } = createSigilSettingsStore(settings);

export default function Settings() {
  useEffect(() => bindSettings(sigil, settings, store), []);
  const state = useSigilSettings(store);
  const { form, states } = useMemo(() => view(), [state]);
  return (
    <section aria-label="Thumbnail settings" className="settings">
      <SettingsPanel form={form} states={states} search={false} onChange={(k, v) => store.set(k, v)} onReset={(k) => store.reset(k)} />
    </section>
  );
}
