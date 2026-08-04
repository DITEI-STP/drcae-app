type ToastType = 'success' | 'error' | 'info';
type AlertType = 'warning' | 'info' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

export interface AlertMessage {
  title: string;
  message: string;
  type: AlertType;
}

// Custom Event dispatchers
export const toast = {
  show(message: string, type: ToastType = 'info') {
    const event = new CustomEvent('drcae-toast', { detail: { message, type } });
    window.dispatchEvent(event);
  },
  success(message: string) {
    this.show(message, 'success');
  },
  error(message: string) {
    this.show(message, 'error');
  },
  info(message: string) {
    this.show(message, 'info');
  }
};

export interface ConfirmRequest {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AlertType;
  /** `true` pinta a acção de confirmar como destrutiva. */
  destructive: boolean;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AlertType;
  destructive?: boolean;
}

/** Resolvidas pelo `NotificationContainer` quando o utilizador responde. */
const pendingConfirms = new Map<string, (value: boolean) => void>();

export function resolveConfirm(id: string, value: boolean): void {
  const resolve = pendingConfirms.get(id);
  if (!resolve) return;
  pendingConfirms.delete(id);
  resolve(value);
}

/**
 * Confirmação modal, em substituição de `window.confirm`.
 *
 * O `window.confirm` bloqueia a thread, não é estilizável, ignora o tema
 * escuro e — no WebView em modo kiosque — aparece com o aspecto do sistema,
 * que destoa do resto da app e não respeita os alvos de toque.
 *
 * A forma é imperativa de propósito, para acompanhar `toast`/`customAlert` e
 * poder ser chamada de dentro de um fluxo assíncrono sem espalhar estado de
 * «diálogo aberto» por cada ecrã que precise de perguntar algo.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const id = `confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const detail: ConfirmRequest = {
    id,
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
    tone: options.tone ?? 'warning',
    destructive: options.destructive ?? false,
  };

  return new Promise<boolean>((resolve) => {
    pendingConfirms.set(id, resolve);
    window.dispatchEvent(new CustomEvent('drcae-confirm', { detail }));
  });
}

export const customAlert = {
  show(title: string, message: string, type: AlertType = 'info') {
    const event = new CustomEvent('drcae-alert', { detail: { title, message, type } });
    window.dispatchEvent(event);
  },
  warning(title: string, message: string) {
    this.show(title, message, 'warning');
  },
  info(title: string, message: string) {
    this.show(title, message, 'info');
  },
  error(title: string, message: string) {
    this.show(title, message, 'error');
  }
};
