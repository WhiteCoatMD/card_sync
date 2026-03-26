/**
 * Google Sheets Sync Library
 * Handles two-way sync between Card Sync inventory and Google Sheets per dealer.
 */

const { google } = require('googleapis');
const path = require('path');

const HEADERS = ['id', 'category', 'name', 'set_name', 'card_number', 'rarity', 'condition', 'quantity', 'buy_price', 'sell_price', 'status', 'description'];

let authClient = null;

function getAuth() {
    if (authClient) return authClient;

    const credPath = path.join(__dirname, '..', 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    authClient = auth;
    return auth;
}

function getSheets() {
    return google.sheets({ version: 'v4', auth: getAuth() });
}

/**
 * Ensure the sheet has the correct headers in row 1
 */
async function ensureHeaders(sheetId, tabName) {
    const sheets = getSheets();
    const range = `${tabName}!A1:L1`;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
    });

    const existing = res.data.values ? res.data.values[0] : [];
    if (existing.length === 0 || existing[0] !== 'id') {
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values: [HEADERS] },
        });
    }
}

/**
 * Push inventory from DB to Google Sheet (full overwrite of sheet data)
 */
async function pushToSheet(pool, userId, sheetId, tabName) {
    const sheets = getSheets();

    await ensureHeaders(sheetId, tabName);

    // Get all inventory for this user
    const result = await pool.query(
        `SELECT id, category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, status, description
         FROM inventory ORDER BY id`
    );

    const rows = result.rows.map(r => [
        r.id, r.category, r.name, r.set_name || '', r.card_number || '',
        r.rarity || '', r.condition, r.quantity,
        r.buy_price ? parseFloat(r.buy_price) : '',
        r.sell_price ? parseFloat(r.sell_price) : '',
        r.status, r.description || ''
    ]);

    // Clear existing data (keep headers)
    const clearRange = `${tabName}!A2:L`;
    await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: clearRange,
    });

    // Write rows
    if (rows.length > 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${tabName}!A2:L${rows.length + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: rows },
        });
    }

    return { pushed: rows.length };
}

/**
 * Pull from Google Sheet into DB inventory.
 * - Rows with an id that exists in DB → update
 * - Rows with no id or id not in DB → insert new
 * - DB rows not in sheet → mark as unlisted (soft delete)
 */
async function pullFromSheet(pool, userId, sheetId, tabName) {
    const sheets = getSheets();
    const range = `${tabName}!A1:L`;

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
    });

    const allRows = res.data.values || [];
    if (allRows.length <= 1) {
        return { updated: 0, inserted: 0, unlisted: 0 };
    }

    // Parse header row to find column indexes
    const headerRow = allRows[0].map(h => h.toLowerCase().trim());
    const colIndex = {};
    HEADERS.forEach(h => {
        colIndex[h] = headerRow.indexOf(h);
    });

    const dataRows = allRows.slice(1);
    const sheetIds = new Set();
    let updated = 0;
    let inserted = 0;

    for (const row of dataRows) {
        const get = (field) => {
            const idx = colIndex[field];
            return idx >= 0 && idx < row.length ? row[idx] : null;
        };

        const id = get('id') ? parseInt(get('id')) : null;
        const category = get('category') || '';
        const name = get('name') || '';

        if (!category || !name) continue; // skip empty rows

        const values = {
            category,
            name,
            set_name: get('set_name') || null,
            card_number: get('card_number') || null,
            rarity: get('rarity') || null,
            condition: get('condition') || 'near_mint',
            quantity: parseInt(get('quantity')) || 0,
            buy_price: get('buy_price') ? parseFloat(get('buy_price')) : null,
            sell_price: get('sell_price') ? parseFloat(get('sell_price')) : null,
            status: get('status') || 'available',
            description: get('description') || null,
        };

        if (id && !isNaN(id)) {
            // Check if exists in DB
            const existing = await pool.query('SELECT id FROM inventory WHERE id = $1', [id]);
            if (existing.rows.length > 0) {
                await pool.query(
                    `UPDATE inventory SET category=$1, name=$2, set_name=$3, card_number=$4, rarity=$5,
                     condition=$6, quantity=$7, buy_price=$8, sell_price=$9, status=$10, description=$11, updated_at=NOW()
                     WHERE id=$12`,
                    [values.category, values.name, values.set_name, values.card_number, values.rarity,
                     values.condition, values.quantity, values.buy_price, values.sell_price,
                     values.status, values.description, id]
                );
                sheetIds.add(id);
                updated++;
                continue;
            }
        }

        // Insert new
        const insertResult = await pool.query(
            `INSERT INTO inventory (category, name, set_name, card_number, rarity, condition, quantity, buy_price, sell_price, status, description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [values.category, values.name, values.set_name, values.card_number, values.rarity,
             values.condition, values.quantity, values.buy_price, values.sell_price,
             values.status, values.description]
        );
        sheetIds.add(insertResult.rows[0].id);
        inserted++;
    }

    // Mark DB items not in sheet as unlisted
    const allInventory = await pool.query('SELECT id FROM inventory WHERE status != $1', ['unlisted']);
    let unlisted = 0;
    for (const row of allInventory.rows) {
        if (!sheetIds.has(row.id)) {
            await pool.query('UPDATE inventory SET status = $1, updated_at = NOW() WHERE id = $2', ['unlisted', row.id]);
            unlisted++;
        }
    }

    return { updated, inserted, unlisted };
}

/**
 * Two-way sync: pull from sheet first, then push back (so sheet gets DB-generated IDs)
 */
async function syncBidirectional(pool, userId, sheetId, tabName) {
    const pullResult = await pullFromSheet(pool, userId, sheetId, tabName);
    const pushResult = await pushToSheet(pool, userId, sheetId, tabName);
    return {
        pulled: pullResult,
        pushed: pushResult.pushed,
    };
}

module.exports = {
    ensureHeaders,
    pushToSheet,
    pullFromSheet,
    syncBidirectional,
    HEADERS,
};
