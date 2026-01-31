/**
 * 数值滑块 + 可编辑文本框，支持滚轮微调
 */

import { useState, useEffect, memo, useRef } from 'react';

export const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue }) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef(null);

  const safeVal = value ?? min;
  const displayVal = formatValue ? formatValue(safeVal) : String(safeVal);
  const progressPct = ((safeVal - min) / (max - min)) * 100;

  useEffect(() => {
    if (!isEditing) setInputText(displayVal);
  }, [displayVal, isEditing]);

  const enterEditMode = () => {
    setInputText(String(safeVal));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const finishEdit = (accept) => {
    if (accept) {
      const n = parseFloat(inputText);
      if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      else setInputText(displayVal);
    } else {
      setInputText(displayVal);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') finishEdit(true);
    if (e.key === 'Escape') finishEdit(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const stepDir = e.deltaY > 0 ? -step : step;
    onChange(Math.min(max, Math.max(min, safeVal + stepDir)));
  };

  return (
    <div className="flex flex-col gap-1.5" onWheel={handleWheel}>
      <label className="text-ds-secondary text-sm">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeVal}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="cu-control-slider flex-1"
          style={{ '--range-progress': `${progressPct}%` }}
        />
        <input
          ref={inputRef}
          type="text"
          value={isEditing ? inputText : displayVal}
          onChange={(e) => setInputText(e.target.value)}
          onFocus={enterEditMode}
          onBlur={() => finishEdit(true)}
          onKeyDown={handleKeyDown}
          className="cu-control-value-input"
          style={{
            width: '3em',
            flexShrink: 0,
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '2px 6px',
            textAlign: 'right',
            backgroundColor: 'var(--bg-hover)',
          }}
        />
      </div>
    </div>
  );
});
