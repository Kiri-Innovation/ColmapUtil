/**
 * OverlayUI toolbar button; hover to expand panel.
 */

import { memo } from 'react';
import { getTooltipProps } from '../../utils/tooltip';
import { PanelWrapper } from './PanelWrapper.jsx';

export const OverlayUIButton = memo(function OverlayUIButton({
  panelId,
  activePanel,
  setActivePanel,
  icon,
  tooltip,
  isActive = false,
  onClick,
  onDoubleClick,
  panelTitle,
  children,
  disabled = false,
  panelPosition = 'left',
}) {
  const isHovered = activePanel === panelId;
  const hasPanel = panelTitle && children;

  return (
    <div
      className="relative w-10 control-button-responsive"
      onMouseEnter={() => !disabled && setActivePanel(panelId)}
      onMouseLeave={() => setActivePanel(null)}
    >
      <button
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled ? undefined : onDoubleClick}
        disabled={disabled}
        className={`group cu-control-btn ${isActive ? 'cu-control-btn--active' : isHovered ? 'cu-control-btn--hover' : 'cu-control-btn--inactive'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        {...(!hasPanel && getTooltipProps(disabled ? `${tooltip} (no data loaded)` : tooltip, 'left'))}
      >
        {icon}
      </button>
      {hasPanel && isHovered && !disabled && (
        <PanelWrapper title={panelTitle} position={panelPosition}>
          {children}
        </PanelWrapper>
      )}
    </div>
  );
});
