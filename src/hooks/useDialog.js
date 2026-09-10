import { useState, useCallback } from 'react';

/**
 * Drop-in, promise-based replacements for window.confirm / window.alert
 * that render entirely inside the Chromium DOM.
 * Eliminates native OS dialog focus desynchronization issues in Electron.
 */
export function useDialog() {
  const [dialog, setDialog] = useState(null); // { title, message, variant, confirmLabel, cancelLabel, resolve }

  const confirm = useCallback((message, title, options = {}) => {
    return new Promise((resolve) => {
      setDialog({
        variant: 'confirm',
        title: title || 'Confirmation',
        message: String(message || ''),
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        resolve
      });
    });
  }, []);

  const notify = useCallback((message, title, options = {}) => {
    return new Promise((resolve) => {
      setDialog({
        variant: 'alert',
        title: title || 'Notice',
        message: String(message || ''),
        confirmLabel: options.confirmLabel || 'OK',
        resolve
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialog?.resolve) dialog.resolve(true);
    setDialog(null);
  }, [dialog]);

  const handleCancel = useCallback(() => {
    if (dialog?.resolve) dialog.resolve(false);
    setDialog(null);
  }, [dialog]);

  const dialogProps = dialog
    ? {
        open: true,
        title: dialog.title,
        message: dialog.message,
        variant: dialog.variant,
        confirmLabel: dialog.confirmLabel,
        cancelLabel: dialog.cancelLabel,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      }
    : { open: false };

  return { confirm, notify, dialogProps };
}
