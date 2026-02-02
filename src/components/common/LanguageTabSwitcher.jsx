/**
 * Language switcher in tab style (same as export binary/text toggle).
 * Use in InitiationPage, SettingsModal. Footer uses LanguageSwitcher (text style) only.
 */

import { useLocale } from '../../AppContext';

const tabButtonStyle = (active) => ({
  flex: 1,
  padding: '6px 12px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: active ? 'var(--accent-primary)' : 'var(--bg-hover)',
  color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
  cursor: 'pointer',
  transition: 'all 0.2s',
  fontSize: '13px',
});

export function LanguageTabSwitcher({ style: wrapperStyle = {} }) {
  const [locale, setLocale] = useLocale();
  const isEn = locale === 'en';

  return (
    <div style={{ display: 'flex', gap: '4px', ...wrapperStyle }}>
      <button
        type="button"
        onClick={() => setLocale('en')}
        style={tabButtonStyle(isEn)}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale('zh')}
        style={tabButtonStyle(!isEn)}
      >
        CN
      </button>
    </div>
  );
}
