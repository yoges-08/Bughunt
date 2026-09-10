import React, { useEffect } from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'confirm', // 'confirm' shows Cancel + Confirm, 'alert' shows only OK
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (variant === 'confirm') onCancel();
        else onConfirm();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, variant, onConfirm, onCancel]);

  if (!open) return null;

  const isSuccess = title?.toLowerCase().includes('success') || message?.toLowerCase().includes('success');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-fadeIn">
      <div className="w-full max-w-md bg-surface-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={variant === 'confirm' ? onCancel : onConfirm}
          className="absolute right-4 top-4 w-7 h-7 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3.5 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isSuccess 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : variant === 'alert' 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            {isSuccess ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : variant === 'alert' ? (
              <Info className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 pr-6">
            {title && <h3 className="text-sm font-bold text-white mb-1.5">{title}</h3>}
            <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-slate-800/80">
          {variant === 'confirm' && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
              isSuccess 
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20' 
                : variant === 'confirm'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shadow-sm'
            }`}
          >
            {variant === 'alert' ? 'OK' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
