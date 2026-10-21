import https from 'node:https';

const urls = [
  'https://nodejs.org/',
  'https://dv-g3b-emudhra.we-have-a-problem.com/',
  'https://dv-g3b-aaa-emudhra.we-have-a-problem.com/',
];
const certificateErrors = new Set([
  'CERT_REVOKED',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

async function probe(url) {
  const agent = new https.Agent({ rejectUnauthorized: true, maxCachedSessions: 0 });
  return new Promise((resolve) => {
    const request = https.get(url, { agent }, (response) => {
      const result = { url, tls: 'accepted', status: response.statusCode };
      response.destroy();
      agent.destroy();
      resolve(result);
    });
    const deadline = setTimeout(
      () => request.destroy(new Error('TLS observation timed out')),
      15_000
    );
    request.on('error', (error) => {
      agent.destroy();
      resolve({ url, tls: 'error', code: error.code ?? null, message: error.message });
    });
    request.on('close', () => clearTimeout(deadline));
  });
}

const results = await Promise.all(urls.map(probe));
const passed = results.every((result, index) =>
  index === 0 ? result.tls === 'accepted' : certificateErrors.has(result.code)
);
console.log(
  JSON.stringify(
    {
      observed_at: new Date().toISOString(),
      version: process.version,
      executable: process.execPath,
      ca_settings: Object.fromEntries(
        [
          'NODE_OPTIONS',
          'NODE_EXTRA_CA_CERTS',
          'NODE_TLS_REJECT_UNAUTHORIZED',
          'SSL_CERT_FILE',
          'SSL_CERT_DIR',
        ].map((key) => [key, process.env[key] ?? null])
      ),
      sample_coverage: 'one direct and one cross-signed chain',
      results,
      passed,
    },
    null,
    2
  )
);
if (!passed) process.exitCode = 1;
