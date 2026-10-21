import { useEffect, useRef } from 'react';

export function ViewContextMenu({ x, y, onCopy, onSetDefault, onResetDefault, onClose, hasDefault }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const item = (label, handler, disabled = false) => (
    <button
      type="button"
      className={'cu-ctx-menu-item' + (disabled ? ' cu-ctx-menu-item--disabled' : '')}
      disabled={disabled}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={() => { if (!disabled) { handler(); onClose(); } }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="cu-ctx-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 2000 }}
    >
      {item('复制当前视角', onCopy)}
      {item('设为默认视角', onSetDefault)}
      {item('重置默认视角', onResetDefault, !hasDefault)}
    </div>
  );
}
