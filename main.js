const { app, BrowserWindow } = require('electron');
const path = require('path');

// Spin up the background Node.js Express server
require('./server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Aura POS - Powered by Kardo POS Infrastructure",
    icon: path.join(__dirname, 'public', 'favicon.ico'), // Fallback if present
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Delay slightly to give the Express server time to start up
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 800);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
