/**
 * Language switcher: "EN | CN" text style, same as version text.
 * Hover + click to switch. Only used in the page bottom-right (Footer status bar).
 * For InitiationPage and SettingsModal use LanguageTabSwitcher (tab style).
 */

import { useLocale } from '../../AppContext';

const SWITCHER_CLASS = 'cu-lang-switcher';

export function LanguageSwitcher({ className = '', style = {} }) {
  const [locale, setLocale] = useLocale();
  const isEn = locale === 'en';

  return (
    <span
      className={`${SWITCHER_CLASS} ${className}`.trim()}
      style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        transition: 'color var(--transition-base)',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      <button
        type="button"
        onClick={() => setLocale('en')}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          opacity: isEn ? 1 : 0.6,
          fontWeight: isEn ? 600 : 400,
        }}
      >
        EN
      </button>
      <span style={{ opacity: 0.7 }}>|</span>
      <button
        type="button"
        onClick={() => setLocale('zh')}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          opacity: !isEn ? 1 : 0.6,
          fontWeight: !isEn ? 600 : 400,
        }}
      >
        CN
      </button>
    </span>
  );
}
