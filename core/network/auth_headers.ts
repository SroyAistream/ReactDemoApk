import { STORAGE_KEYS } from '../constants/api_constants';
import { storageHelper } from '../utils/storage_helper';
import { deviceHelper } from '../utils/device_helper';

const USER_AGENT = 'OGLE-APP/Android';

type FmaTokenInput = {
  device_id?: string | null;
  player_type?: string | null;
  enc_accounting?: string | null;
};

export function buildFmaToken(input: FmaTokenInput): string {
  return JSON.stringify({
    device_id: input.device_id || '',
    player_type: input.player_type || '2000',
    enc_accounting: input.enc_accounting || '',
  });
}

export async function getFmaToken(deviceInfo?: any): Promise<string> {
  const [deviceId, encAccounting] = await Promise.all([
    storageHelper.getItem(STORAGE_KEYS.DEVICE_ID),
    storageHelper.getItem(STORAGE_KEYS.ENC_ACCOUNTING),
  ]);

  return buildFmaToken({
    device_id: deviceInfo?.unique_id || deviceInfo?.device || deviceId || await deviceHelper.getDeviceId(),
    player_type: deviceInfo?.player_type,
    enc_accounting: encAccounting,
  });
}

export async function getAndroidHeaders(options: {
  includeAuth?: boolean;
  includeFma?: boolean;
  deviceInfo?: any;
} = {}): Promise<Record<string, string>> {
  const { includeAuth = false, includeFma = true, deviceInfo } = options;
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
  };

  if (includeAuth) {
    const token = await storageHelper.getItem(STORAGE_KEYS.TOKEN);
    headers.Authentication = `Bearer ${token || ''}`;
  }

  if (includeFma) {
    headers['Fma-Authentication'] = `Bearer ${await getFmaToken(deviceInfo)}`;
  }

  return headers;
}
