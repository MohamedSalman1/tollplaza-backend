import { isPublicIp } from './login-audit.service';

describe('isPublicIp', () => {
  it('never sends local or private addresses to ipapi', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd12:3456::1',
      'fe80::1',
    ]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('looks up public addresses', () => {
    for (const ip of [
      '203.0.113.5',
      '8.8.8.8',
      '172.32.0.1',
      '2001:4860::8888',
    ]) {
      expect(isPublicIp(ip)).toBe(true);
    }
  });
});
