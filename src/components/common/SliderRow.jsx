/**
 * 数值滑块 + 可编辑文本框，支持滚轮微调。
 * 可选 valueToSlider / sliderToValue：滑条使用非线性刻度（如对数），value 仍为实际数值。
 */

import { useState, useEffect, memo, useRef } from 'react';

export const SliderRow = memo(function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  valueToSlider,
  sliderToValue,
  sliderMin = 0,
  sliderMax = 100,
  sliderStep = 1,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef(null);

  const useLogScale = typeof valueToSlider === 'function' && typeof sliderToValue === 'function';
  const safeVal = value ?? min;
  const displayVal = formatValue ? formatValue(safeVal) : String(safeVal);
  const sliderVal = useLogScale ? valueToSlider(safeVal) : safeVal;
  const rangeMin = useLogScale ? sliderMin : min;
  const rangeMax = useLogScale ? sliderMax : max;
  const rangeStep = useLogScale ? sliderStep : step;
  const progressPct = ((sliderVal - rangeMin) / (rangeMax - rangeMin)) * 100;

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

  const handleRangeChange = (e) => {
    const v = parseFloat(e.target.value);
    const nextVal = useLogScale ? sliderToValue(v) : v;
    onChange(Math.min(max, Math.max(min, nextVal)));
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (useLogScale) {
      const stepDir = e.deltaY > 0 ? -sliderStep : sliderStep;
      const nextSlider = Math.min(rangeMax, Math.max(rangeMin, sliderVal + stepDir));
      onChange(Math.min(max, Math.max(min, sliderToValue(nextSlider))));
    } else {
      const stepDir = e.deltaY > 0 ? -step : step;
      onChange(Math.min(max, Math.max(min, safeVal + stepDir)));
    }
  };

  return (
    <div className="flex flex-col gap-1.5" onWheel={handleWheel}>
      <label className="text-ds-secondary text-sm">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={rangeMin}
          max={rangeMax}
          step={rangeStep}
          value={sliderVal}
          onChange={handleRangeChange}
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
