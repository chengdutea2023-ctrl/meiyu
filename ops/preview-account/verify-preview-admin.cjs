const fs = require('fs');

const credentialFile = process.env.CREDENTIAL_FILE || '/tmp/zhike-preview-admin-credentials.json';
const credential = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
const apiBase = 'https://data.docpine.online/api/v1';

async function request(path, init = {}) {
  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

async function main() {
  const loginResponse = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usernameOrEmail: credential.username, password: credential.password }),
  });
  if (!loginResponse.ok) throw new Error(`login failed: ${loginResponse.status}`);
  const login = await loginResponse.json();
  if (!login.user?.readOnlyPreview) throw new Error('readOnlyPreview flag missing');
  if (login.user.previewExpiresAt !== credential.expiresAt) throw new Error('preview expiry mismatch');

  const authHeaders = { authorization: `Bearer ${login.accessToken}` };
  const meResponse = await request('/auth/me', { headers: authHeaders });
  if (!meResponse.ok) throw new Error(`read-only GET failed: ${meResponse.status}`);

  const writeResponse = await request('/users/nonexistent/status', {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'DISABLED' }),
  });
  if (writeResponse.status !== 403) throw new Error(`write guard returned ${writeResponse.status}, expected 403`);

  const writeBody = await writeResponse.json();
  if (!String(writeBody.message || '').includes('只读')) throw new Error('write guard message mismatch');

  console.log(JSON.stringify({ login: loginResponse.status, read: meResponse.status, write: writeResponse.status }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
