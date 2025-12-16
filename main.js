const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure Auto Updater Logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Set global user data path regarding to production environment

// This must be done BEFORE requiring server/database so they consume the correct path
global.USER_DATA_PATH = app.getPath('userData');

const { startServer } = require('./server');

// Start the local server
startServer();

const DATA_DIR = path.join(global.USER_DATA_PATH, 'data'); // Use centralized path
const CREMATIONS_FILE = path.join(DATA_DIR, 'cremations.json'); // Legacy support

// Ensure data directory exists (Legacy)
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Don't show until ready
        backgroundColor: '#f8fafc', // Match slate-50
        autoHideMenuBar: true, // Hide the default menu bar
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'logo.jpg')
    });

    // Load from local server instead of file
    win.loadURL('http://localhost:3000');

    win.once('ready-to-show', () => {
        win.show();
    });
}

// Disable Hardware Acceleration
app.disableHardwareAcceleration();

app.whenReady().then(() => {
    createWindow();

    // Check for updates
    autoUpdater.checkForUpdatesAndNotify();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Auto-Updater Events (Optional, for better UX)
autoUpdater.on('update-available', () => {
    log.info('Update available.');
});
autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded; will install now');
    // autoUpdater.quitAndInstall(); // checkForUpdatesAndNotify handles this usually via notification, but explicit is good.
});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function readData(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Watch for external changes in Cremations (Simulate Real-time)
// This still works for the Desktop app notifications
let previousCremations = readData(CREMATIONS_FILE);

fs.watchFile(CREMATIONS_FILE, { interval: 1000 }, (curr, prev) => {
    const currentCremations = readData(CREMATIONS_FILE);

    // Check for new entries
    if (currentCremations.length > previousCremations.length) {
        const newEntries = currentCremations.slice(previousCremations.length);
        newEntries.forEach(entry => {
            // Broadcast to all windows
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('new-cremation', entry);
            });
        });
    }

    previousCremations = currentCremations;
});

// Note: IPC Handlers are no longer strictly necessary for data operations
// since the frontend will use the API, but we keep them if we want to support
// hybrid mode or specific desktop features.
// For v3.0, we will rely on the API for data.
