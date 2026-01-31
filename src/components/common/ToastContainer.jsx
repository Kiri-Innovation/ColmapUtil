import { useAppContext } from '../../AppContext';

const TYPE_CLASS = {
  info: 'cu-toast-info',
  success: 'cu-toast-success',
  error: 'cu-toast-error',
};

export function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  if (toasts.length === 0) return null;

  return (
    <div className="cu-toast-root z-toast" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`cu-toast-item ${TYPE_CLASS[t.type] ?? TYPE_CLASS.info}`}
          role="alert"
        >
          <div className="cu-toast-content cu-toast-message">{t.message}</div>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="cu-toast-close"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
