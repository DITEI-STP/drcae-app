const PAIRING_KEY = 'drcae_pairing_credentials';

export interface DeviceInfo {
  brand: string;
  model: string;
  manufacturer: string;
  os_name: string;
  os_version: string;
  unique_id: string;
  screen_width: number;
  screen_height: number;
  screen_density: number;
  is_emulator: boolean;
  mac_address: null;
  imei: null;
}

export interface PairingCredentials {
  device_id: string;
  webview_signature: string;
  session_id: string;
  device_code: string;
  endpoint: string;
  paired_at: string;
}

function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Browser';
}

function getOSName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Desconhecido';
}

function getOSVersion(): string {
  const ua = navigator.userAgent;
  const android = ua.match(/Android\s([\d.]+)/);
  if (android) return android[1];
  const ios = ua.match(/OS\s([\d_]+)/);
  if (ios) return ios[1].replace(/_/g, '.');
  const win = ua.match(/Windows NT\s([\d.]+)/);
  if (win) return win[1];
  const mac = ua.match(/Mac OS X\s([\d_]+)/);
  if (mac) return mac[1].replace(/_/g, '.');
  return navigator.platform || 'Desconhecido';
}

export function collectBrowserDeviceInfo(deviceId: string): DeviceInfo {
  const browser = getBrowserName();
  const os = getOSName();
  return {
    brand: os,
    model: `${browser} em ${os}`,
    manufacturer: browser,
    os_name: os,
    os_version: getOSVersion(),
    unique_id: deviceId,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    screen_density: Math.round(window.devicePixelRatio) || 1,
    is_emulator: false,
    mac_address: null,
    imei: null,
  };
}

export function generateDefaultAlias(): string {
  return `${getBrowserName()} em ${getOSName()}`;
}

export function storePairingCredentials(creds: PairingCredentials): void {
  localStorage.setItem(PAIRING_KEY, JSON.stringify(creds));
}

export function getPairingCredentials(): PairingCredentials | null {
  try {
    const raw = localStorage.getItem(PAIRING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPairingCredentials(): void {
  localStorage.removeItem(PAIRING_KEY);
}

export async function checkSessionValid(): Promise<boolean> {
  try {
    const res = await fetch('/api/app/auth/session-validate', {
      method: 'GET',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
