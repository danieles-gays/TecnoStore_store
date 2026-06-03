const http  = require('http');
const https = require('https');
const { URL } = require('url');

function getSettings(db) {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT key, value FROM settings WHERE key IN ('dolibarr_url','dolibarr_api_key')",
            (err, rows) => {
                if (err) return reject(err);
                const s = {};
                rows.forEach(r => { s[r.key] = r.value; });
                resolve({ url: s['dolibarr_url'] || '', apiKey: s['dolibarr_api_key'] || '' });
            }
        );
    });
}

function isConfigured(settings) {
    return !!(settings.url && settings.apiKey);
}

function request(settings, method, path, body = null) {
    return new Promise((resolve) => {
        if (!isConfigured(settings)) {
            return resolve({ ok: false, error: 'ERP no configurado' });
        }

        let fullUrl;
        try {
            const base = settings.url.replace(/\/$/, '');
            fullUrl = new URL(`${base}/api/index.php/${path.replace(/^\//, '')}`);
        } catch (e) {
            return resolve({ ok: false, error: 'URL del ERP inválida' });
        }

        const bodyStr = body ? JSON.stringify(body) : null;
        const options = {
            hostname: fullUrl.hostname,
            port:     fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
            path:     fullUrl.pathname + fullUrl.search,
            method,
            headers: {
                'DOLAPIKEY':      settings.apiKey,
                'Content-Type':   'application/json',
                'Accept':         'application/json',
            },
            timeout: 10000,
        };

        if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

        const lib = fullUrl.protocol === 'https:' ? https : http;
        const req = lib.request(options, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(raw);
                    resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, code: res.statusCode, data });
                } catch {
                    resolve({ ok: false, error: 'Respuesta inválida del ERP', raw });
                }
            });
        });

        req.on('error', e => resolve({ ok: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout conectando al ERP' }); });

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function createProduct(db, product) {
    const settings = await getSettings(db);
    if (!isConfigured(settings)) return { ok: false, error: 'ERP no configurado' };

    // Comprueba si ya existe por ref (SKU)
    const search = await request(settings, 'GET', `products?sqlfilters=t.ref:'${product.sku}'&limit=1`);
    if (search.ok && Array.isArray(search.data) && search.data.length > 0) {
        return { ok: true, id: search.data[0].id, existing: true };
    }

    const r = await request(settings, 'POST', 'products', {
        ref:             product.sku,
        label:           product.name,
        description:     product.description || '',
        price:           parseFloat(product.price) || 0,
        price_base_type: 'HT',
        type:            0,
        status:          1,
        status_buy:      1,
    });

    return r.ok
        ? { ok: true, id: r.data }
        : { ok: false, error: r.error || `ERP HTTP ${r.code}` };
}

module.exports = { getSettings, isConfigured, request, createProduct };
