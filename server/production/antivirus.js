import fs from 'node:fs/promises';
import net from 'node:net';

export async function scanFile(filePath, config) {
  if (!config.antivirus.enabled) return { enabled: false, status: 'not_configured' };
  const bytes = await fs.readFile(filePath);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.antivirus.host, port: config.antivirus.port });
    const chunks = [];
    const timer = setTimeout(() => socket.destroy(new Error('Antivirus scan timeout')), config.antivirus.timeoutMs);
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
      socket.write(size); socket.write(bytes); socket.end(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => {
      clearTimeout(timer);
      const response = Buffer.concat(chunks).toString('utf8');
      if (/FOUND/i.test(response)) return resolve({ enabled: true, status: 'infected' });
      if (/OK/i.test(response)) return resolve({ enabled: true, status: 'clean' });
      reject(new Error('Unexpected antivirus response'));
    });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
  }).catch((error) => {
    if (config.antivirus.failMode === 'open') return { enabled: true, status: 'unavailable_fail_open', errorCode: 'ANTIVIRUS_UNAVAILABLE' };
    throw Object.assign(new Error('Антивирусная проверка недоступна'), { code: 'ANTIVIRUS_UNAVAILABLE', cause: error });
  });
}
