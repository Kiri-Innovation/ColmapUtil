/**
 * 自定义下拉选择框，支持 optionInfo 信息提示
 */

import { useState, useEffect, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export const SelectRow = memo(function SelectRow({ label, value, onChange, options, optionInfo, showLabel = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredInfoOption, setHoveredInfoOption] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const selectRef = useRef(null);
  const dropdownRef = useRef(null);
  const infoIconRefs = useRef(new Map());

  const handleWheel = (e) => {
    e.preventDefault();
    const currentIndex = options.findIndex(opt => opt.value === value);
    if (currentIndex === -1) return;

    const delta = e.deltaY > 0 ? 1 : -1;
    const newIndex = (currentIndex + delta + options.length) % options.length;
    onChange(options[newIndex].value);
  };

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1.5" onWheel={handleWheel} ref={selectRef}>
      {showLabel && label != null && label !== '' && (
        <label className="text-ds-secondary text-sm">{label}</label>
      )}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full text-sm text-ds-primary"
          style={{
            padding: '6px 12px',
            paddingRight: '32px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedOption?.label}
            {selectedOption && optionInfo && optionInfo[selectedOption.value] && (
              <div
                style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltipPosition({ top: rect.bottom, left: rect.right });
                  setHoveredInfoOption(selectedOption.value);
                }}
                onMouseLeave={() => setHoveredInfoOption(null)}
              >
                <Info className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'help' }} />
              </div>
            )}
          </span>
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 1300,
              maxHeight: '200px',
              overflowY: 'auto',
              overflowX: 'visible'
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: value === opt.value ? 'var(--bg-hover)' : 'transparent',
                  transition: 'background-color 0.15s',
                  position: 'relative'
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover-darker)'; }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = value === opt.value ? 'var(--bg-hover)' : 'transparent';
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {optionInfo && optionInfo[opt.value] && (
                  <div
                    ref={(el) => {
                      if (el) infoIconRefs.current.set(opt.value, el);
                      else infoIconRefs.current.delete(opt.value);
                    }}
                    style={{ marginLeft: '8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPosition({ top: rect.bottom, left: rect.right });
                      setHoveredInfoOption(opt.value);
                    }}
                    onMouseLeave={() => setHoveredInfoOption(null)}
                  >
                    <Info className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', flexShrink: 0, cursor: 'help' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {hoveredInfoOption && optionInfo && optionInfo[hoveredInfoOption] && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateX(-100%)',
            marginTop: '4px',
            marginLeft: '-4px',
            padding: '8px 12px',
            borderRadius: '4px',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-light)',
            zIndex: 10000,
            pointerEvents: 'none',
            maxWidth: '280px',
            minWidth: '200px',
            whiteSpace: 'normal',
            lineHeight: '1.4'
          }}
        >
          {optionInfo[hoveredInfoOption]}
        </div>,
        document.body
      )}
    </div>
  );
});
