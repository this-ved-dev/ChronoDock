import 'dotenv/config';
import { app, BrowserWindow, Tray, Menu, ipcMain, shell, screen } from 'electron';
import * as path from 'path';
import { WindowManager } from './window-manager';
import { AuthManager } from '../auth/auth-manager';
import { NotificationManager } from '../notifications/notification-manager';
import { SettingsManager } from '../shared/settings-manager';
import { CalendarService } from '../calendar/calendar-service';

class ElectronCallyApp {
  private windowManager!: WindowManager;
  private authManager!: AuthManager;
  private notificationManager!: NotificationManager;
  private settingsManager!: SettingsManager;
  private calendarService!: CalendarService;
  private tray: Tray | null = null;

  constructor() {
    this.setupApp();
  }

  private async setupApp(): Promise<void> {
    // Initialize managers
    this.settingsManager = new SettingsManager();
    this.authManager = new AuthManager();
    this.windowManager = new WindowManager();
    this.notificationManager = new NotificationManager();
    this.calendarService = new CalendarService(this.authManager);

    // Setup app event handlers
    this.setupAppHandlers();
    this.setupIpcHandlers();

    // Wait for app to be ready
    if (app.isReady()) {
      await this.onAppReady();
    } else {
      app.whenReady().then(() => this.onAppReady());
    }
  }

  private setupAppHandlers(): void {
    app.on('window-all-closed', () => {
      // Keep app running in background on Windows
      if (process.platform !== 'darwin') {
        // Don't quit, just hide to tray
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager.createWidgetWindow();
      }
    });

    app.on('before-quit', async () => {
      await this.cleanup();
    });
  }

  private setupIpcHandlers(): void {
    // Auth handlers
    ipcMain.handle('auth:login', async () => {
      try {
        const authStatus = await this.authManager.login();
        return {
          success: authStatus.isAuthenticated,
          data: authStatus,
          error: authStatus.error
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Authentication failed'
        };
      }
    });

    ipcMain.handle('auth:logout', async () => {
      try {
        const result = await this.authManager.logout();
        return {
          success: result,
          error: result ? undefined : 'Logout failed'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Logout failed'
        };
      }
    });

    ipcMain.handle('auth:getStatus', async () => {
      try {
        const authStatus = await this.authManager.getAuthStatus();
        return {
          success: true,
          data: authStatus
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get auth status'
        };
      }
    });

    // Calendar handlers
    ipcMain.handle('calendar:getCalendars', async () => {
      try {
        const calendars = await this.calendarService.getCalendars();
        return {
          success: true,
          data: calendars
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get calendars'
        };
      }
    });


    // Settings handlers
    ipcMain.handle('settings:get', async (_, key) => {
      return this.settingsManager.get(key);
    });

    ipcMain.handle('settings:set', async (_, key, value) => {
      return this.settingsManager.set(key, value);
    });

    ipcMain.handle('settings:getAll', async () => {
      return this.settingsManager.getAll();
    });

    // Window management handlers
    ipcMain.handle('window:show', () => {
      this.windowManager.showWidget();
    });

    ipcMain.handle('window:hide', () => {
      this.windowManager.hideWidget();
    });

    ipcMain.handle('window:openSettings', () => {
      this.windowManager.createSettingsWindow();
    });

    ipcMain.handle('window:pinToDesktop', async () => {
      return await this.windowManager.pinToDesktop();
    });

    ipcMain.handle('window:unpinFromDesktop', async () => {
      return await this.windowManager.unpinFromDesktop();
    });

    // External link handler
    ipcMain.handle('app:openExternal', async (_, url) => {
      await shell.openExternal(url);
    });

    // App control handlers
    ipcMain.handle('app:quit', () => {
      app.quit();
    });

    ipcMain.handle('app:openDevTools', () => {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        focusedWindow.webContents.openDevTools();
      }
    });

    // Settings handlers
    ipcMain.handle('settings:reset', async () => {
      try {
        await this.settingsManager.reset();
        return { success: true };
      } catch (error) {
        console.error('Failed to reset settings:', error);
        return { success: false, error: 'Failed to reset settings' };
      }
    });

    ipcMain.handle('settings:export', async () => {
      try {
        const settings = this.settingsManager.getAll();
        return JSON.stringify(settings, null, 2);
      } catch (error) {
        console.error('Failed to export settings:', error);
        throw new Error('Failed to export settings');
      }
    });

    // Notification handlers
    ipcMain.handle('notifications:test', async () => {
      try {
        await this.notificationManager.showTestNotification();
        return { success: true };
      } catch (error) {
        console.error('Failed to send test notification:', error);
        return { success: false, error: 'Failed to send test notification' };
      }
    });

    ipcMain.handle('notifications:clearCache', async () => {
      try {
        // Clear any cached data (for now just return success)
        console.log('Cache cleared');
        return { success: true };
      } catch (error) {
        console.error('Failed to clear cache:', error);
        return { success: false, error: 'Failed to clear cache' };
      }
    });
  }

  private async onAppReady(): Promise<void> {
    try {
      // Create system tray
      this.createTray();

      // Create widget window
      this.windowManager.createWidgetWindow();

      console.log('Cally started successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      app.quit();
    }
  }

  private createTray(): void {
    const trayIconPath = path.join(__dirname, '../../assets/tray-icon.png');
    
    try {
      this.tray = new Tray(trayIconPath);
    } catch (error) {
      console.warn('Tray icon not found, creating tray without icon');
      // Create a simple 16x16 transparent icon as fallback
      const { nativeImage } = require('electron');
      const fallbackIcon = nativeImage.createEmpty();
      this.tray = new Tray(fallbackIcon);
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Calendar',
        click: () => {
          this.windowManager.showWidget();
        }
      },
      {
        label: 'Settings',
        click: () => {
          this.windowManager.createSettingsWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip('Cally - Calendar Widget');

    this.tray.on('double-click', () => {
      this.windowManager.toggleWidget();
    });
  }

  private async cleanup(): Promise<void> {
    try {
      console.log('App cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Start the application
new ElectronCallyApp();
