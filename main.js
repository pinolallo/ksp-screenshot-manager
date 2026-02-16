const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

let mainWindow;
let db;

function initDatabase() {
    const dbPath = path.join(app.getPath('userData'), 'ksp_manager.sqlite');
    db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            tags TEXT,
            description TEXT,
            keywords TEXT,
            crc INTEGER,
            image_data BLOB NOT NULL,
            mime_type TEXT DEFAULT 'image/png',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME
        );
        CREATE INDEX IF NOT EXISTS idx_date ON photos (date);
        CREATE INDEX IF NOT EXISTS idx_crc ON photos (crc);
        CREATE INDEX IF NOT EXISTS idx_name ON photos (name);

        CREATE TABLE IF NOT EXISTS saved_searches (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            narrative TEXT,
            state TEXT NOT NULL,
            link TEXT,
            created TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_created ON saved_searches (created);
    `);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
    initDatabase();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Photos
ipcMain.handle('get-photos', async (event, reqPath) => {
    if (reqPath === 'all') {
        const photos = db.prepare("SELECT id, name, date, tags, description, keywords, crc, mime_type FROM photos ORDER BY date DESC").all();
        return photos.map(p => ({
            ...p,
            tags: JSON.parse(p.tags || '[]')
        }));
    } else if (reqPath === 'count') {
        return db.prepare("SELECT COUNT(*) as count FROM photos").get();
    } else if (reqPath && reqPath.startsWith('image/')) {
        const id = reqPath.substring(6);
        const photo = db.prepare("SELECT image_data, mime_type FROM photos WHERE id = ?").get(id);
        if (photo) {
            const base64 = photo.image_data.toString('base64');
            return { dataUrl: `data:${photo.mime_type};base64,${base64}` };
        }
        throw new Error('Photo not found');
    } else if (reqPath) {
        const photo = db.prepare("SELECT id, name, date, tags, description, keywords, crc, mime_type FROM photos WHERE id = ?").get(reqPath);
        if (photo) {
            return {
                ...photo,
                tags: JSON.parse(photo.tags || '[]')
            };
        }
        throw new Error('Photo not found');
    }
});

ipcMain.handle('save-photo', async (event, data) => {
    let mimeType, imageData;
    const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
        mimeType = matches[1];
        imageData = Buffer.from(matches[2], 'base64');
    } else {
        throw new Error('Invalid image data');
    }

    const stmt = db.prepare(`
        INSERT INTO photos (id, name, date, tags, description, keywords, crc, image_data, mime_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        data.id,
        data.name,
        data.date,
        JSON.stringify(data.tags || []),
        data.description || '',
        data.keywords || '',
        data.crc || null,
        imageData,
        mimeType
    );

    return { success: true, id: data.id };
});

ipcMain.handle('update-photo', async (event, data) => {
    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.date !== undefined) { updates.push('date = ?'); params.push(data.date); }
    if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.keywords !== undefined) { updates.push('keywords = ?'); params.push(data.keywords); }
    if (data.crc !== undefined) { updates.push('crc = ?'); params.push(data.crc); }
    
    if (data.dataUrl) {
        const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            updates.push('mime_type = ?');
            params.push(matches[1]);
            updates.push('image_data = ?');
            params.push(Buffer.from(matches[2], 'base64'));
        }
    }

    if (updates.length === 0) throw new Error('No fields to update');

    params.push(data.id);
    const sql = `UPDATE photos SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);

    return { success: true, updated: result.changes };
});

ipcMain.handle('delete-photo', async (event, reqPath) => {
    if (reqPath === 'all') {
        const result = db.prepare("DELETE FROM photos").run();
        return { success: true, deleted: result.changes };
    } else {
        const result = db.prepare("DELETE FROM photos WHERE id = ?").run(reqPath);
        return { success: true, deleted: result.changes };
    }
});

// IPC Handlers for Saved Searches
ipcMain.handle('get-searches', async (event, reqPath) => {
    if (reqPath === 'all') {
        const searches = db.prepare("SELECT * FROM saved_searches ORDER BY created DESC").all();
        return searches.map(s => ({
            ...s,
            state: JSON.parse(s.state || '{}')
        }));
    } else if (reqPath) {
        const search = db.prepare("SELECT * FROM saved_searches WHERE id = ?").get(reqPath);
        if (search) {
            return {
                ...search,
                state: JSON.parse(search.state || '{}')
            };
        }
        throw new Error('Search not found');
    }
});

ipcMain.handle('save-search', async (event, data) => {
    const stmt = db.prepare(`
        INSERT INTO saved_searches (id, title, narrative, state, link, created)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        data.id,
        data.title,
        data.narrative || '',
        JSON.stringify(data.state),
        data.link || '',
        data.created
    );

    return { success: true, id: data.id };
});

ipcMain.handle('update-search', async (event, data) => {
    const updates = [];
    const params = [];

    if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title); }
    if (data.narrative !== undefined) { updates.push('narrative = ?'); params.push(data.narrative); }
    if (data.state !== undefined) { updates.push('state = ?'); params.push(JSON.stringify(data.state)); }
    if (data.link !== undefined) { updates.push('link = ?'); params.push(data.link); }

    if (updates.length === 0) throw new Error('No fields to update');

    params.push(data.id);
    const sql = `UPDATE saved_searches SET ${updates.join(', ')} WHERE id = ?`;
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);

    return { success: true, updated: result.changes };
});

ipcMain.handle('delete-search', async (event, id) => {
    if (id === 'all') {
        const result = db.prepare("DELETE FROM saved_searches").run();
        return { success: true, deleted: result.changes };
    } else {
        const result = db.prepare("DELETE FROM saved_searches WHERE id = ?").run(id);
        return { success: true, deleted: result.changes };
    }
});
