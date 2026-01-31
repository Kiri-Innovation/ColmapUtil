/**
 * 伽马滑块：线性滑条 (0–1) 对数映射到 gamma 区间，便于在 1.0 附近微调
 */

import { useState, useEffect, memo, useRef } from 'react';

export const GammaSliderRow = memo(function GammaSliderRow({ label, value, min, max, onChange, formatValue }) {
  const [editState, setEditState] = useState({ active: false, text: '' });
  const inputRef = useRef(null);

  const toLinear = (gamma) => {
    if (gamma <= min) return 0;
    if (gamma >= max) return 1;
    return Math.log(gamma / min) / Math.log(max / min);
  };
  const fromLinear = (t) => {
    const t1 = Math.max(0, Math.min(1, t));
    return min * Math.pow(max / min, t1);
  };

  const gamma = value ?? 1.0;
  const displayText = formatValue ? formatValue(gamma) : String(gamma);
  const linearT = toLinear(gamma);
  const fillPct = linearT * 100;

  useEffect(() => {
    if (!editState.active) setEditState((prev) => ({ ...prev, text: displayText }));
  }, [displayText, editState.active]);

  const startEdit = () => {
    setEditState({ active: true, text: String(gamma) });
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const commitOrRevert = (commit) => {
    if (commit) {
      const parsed = parseFloat(editState.text);
      if (Number.isFinite(parsed)) onChange(parsed);
      else setEditState((prev) => ({ ...prev, text: displayText }));
    } else {
      setEditState((prev) => ({ ...prev, text: displayText }));
    }
    setEditState((prev) => ({ ...prev, active: false }));
  };

  const onSliderChange = (e) => onChange(fromLinear(parseFloat(e.target.value)));
  const onWheel = (e) => {
    e.preventDefault();
    const step = 0.01;
    const dir = e.deltaY > 0 ? -1 : 1;
    onChange(fromLinear(Math.min(1, Math.max(0, linearT + dir * step))));
  };

  return (
    <div className="flex flex-col gap-1.5" onWheel={onWheel}>
      <label className="text-ds-secondary text-sm">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={linearT}
          onChange={onSliderChange}
          className="cu-control-slider flex-1"
          style={{ '--range-progress': `${fillPct}%` }}
        />
        <input
          ref={inputRef}
          type="text"
          value={editState.active ? editState.text : displayText}
          onChange={(e) => setEditState((prev) => ({ ...prev, text: e.target.value }))}
          onFocus={startEdit}
          onBlur={() => commitOrRevert(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitOrRevert(true);
            else if (e.key === 'Escape') commitOrRevert(false);
          }}
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
