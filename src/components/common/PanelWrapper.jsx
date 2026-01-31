/**
 * 控制面板包装器，支持多种定位
 */

import { memo } from 'react';

const GAP = '0.5rem';

export const PanelWrapper = memo(function PanelWrapper({ title, children, position = 'left' }) {
  let wrapperStyle = {
    position: 'absolute',
    zIndex: 1100,
  };

  switch (position) {
    case 'left':
      wrapperStyle = { ...wrapperStyle, right: '100%', bottom: 0, paddingRight: GAP };
      break;
    case 'right':
      wrapperStyle = { ...wrapperStyle, left: '100%', top: 0, paddingLeft: GAP };
      break;
    case 'bottom-left':
      wrapperStyle = { ...wrapperStyle, top: '100%', left: 0, paddingTop: GAP };
      break;
    case 'bottom-right':
      wrapperStyle = { ...wrapperStyle, top: '100%', right: 0, paddingTop: GAP };
      break;
  }

  return (
    <div style={wrapperStyle}>
      <div className="cu-control-panel">
        <div className="cu-control-panel-title">{title}</div>
        {children}
      </div>
    </div>
  );
});
