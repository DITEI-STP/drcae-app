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
