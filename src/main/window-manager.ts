import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

export class WindowManager {
  private widgetWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private nativeAddon: any = null;

  constructor() {
    this.loadNativeAddon();
  }

  private loadNativeAddon(): void {
    try {
      // Load the native addon for desktop pinning
      // Try multiple possible paths
      try {
        this.nativeAddon = require('../../native/pin-to-desktop');
      } catch {
        this.nativeAddon = require('../../../native/pin-to-desktop');
      }
    } catch (error) {
      console.warn('Native addon not available:', error instanceof Error ? error.message : 'Unknown error');
      console.warn('Pin-to-desktop functionality will not be available');
    }
  }

  public createWidgetWindow(): BrowserWindow {
    if (this.widgetWindow && !this.widgetWindow.isDestroyed()) {
      this.widgetWindow.focus();
      return this.widgetWindow;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 350;
    const windowHeight = 500;

    this.widgetWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: width - windowWidth - 50,
      y: 50,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../shared/preload.js'),
        backgroundThrottling: false
      }
    });

    // Set window properties for better transparency and effects
    this.widgetWindow.setBackgroundColor('#00000000');
    this.widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Load the widget renderer
    if (process.env.NODE_ENV === 'development') {
      this.widgetWindow.loadURL('http://localhost:8080/widget.html');
      this.widgetWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      this.widgetWindow.loadFile(path.join(__dirname, '../../renderer/widget.html'));
    }

    // Window event handlers
    this.widgetWindow.once('ready-to-show', () => {
      this.widgetWindow?.show();
    });

    this.widgetWindow.on('closed', () => {
      this.widgetWindow = null;
    });

    // Make window draggable
    this.setupDraggableWindow(this.widgetWindow);

    return this.widgetWindow;
  }

  public createSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    this.settingsWindow = new BrowserWindow({
      width: 800,
      height: 600,
      center: true,
      frame: true,
      transparent: false,
      alwaysOnTop: false,
      resizable: true,
      minimizable: true,
      maximizable: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../shared/preload.js')
      }
    });

    // Load the settings renderer
    if (process.env.NODE_ENV === 'development') {
      this.settingsWindow.loadURL('http://localhost:8080/settings.html');
      this.settingsWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      this.settingsWindow.loadFile(path.join(__dirname, '../../renderer/settings.html'));
    }

    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow?.show();
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });

    return this.settingsWindow;
  }

  public showWidget(): void {
    if (this.widgetWindow) {
      this.widgetWindow.show();
      this.widgetWindow.focus();
    } else {
      this.createWidgetWindow();
    }
  }

  public hideWidget(): void {
    if (this.widgetWindow) {
      this.widgetWindow.hide();
    }
  }

  public toggleWidget(): void {
    if (this.widgetWindow) {
      if (this.widgetWindow.isVisible()) {
        this.hideWidget();
      } else {
        this.showWidget();
      }
    } else {
      this.createWidgetWindow();
    }
  }

  public async pinToDesktop(): Promise<boolean> {
    if (!this.widgetWindow || !this.nativeAddon) {
      return false;
    }

    try {
      const hwnd = this.widgetWindow.getNativeWindowHandle().readInt32LE(0);
      return this.nativeAddon.pinToDesktop(hwnd);
    } catch (error) {
      console.error('Failed to pin to desktop:', error);
      return false;
    }
  }

  public async unpinFromDesktop(): Promise<boolean> {
    if (!this.widgetWindow || !this.nativeAddon) {
      return false;
    }

    try {
      const hwnd = this.widgetWindow.getNativeWindowHandle().readInt32LE(0);
      return this.nativeAddon.unpinFromDesktop(hwnd);
    } catch (error) {
      console.error('Failed to unpin from desktop:', error);
      return false;
    }
  }

  public setClickThrough(enabled: boolean): void {
    if (this.widgetWindow) {
      this.widgetWindow.setIgnoreMouseEvents(enabled, { forward: true });
    }
  }

  public setOpacity(opacity: number): void {
    if (this.widgetWindow) {
      this.widgetWindow.setOpacity(Math.max(0.1, Math.min(1.0, opacity)));
    }
  }

  public setAlwaysOnTop(alwaysOnTop: boolean): void {
    if (this.widgetWindow) {
      this.widgetWindow.setAlwaysOnTop(alwaysOnTop);
    }
  }

  private setupDraggableWindow(window: BrowserWindow): void {
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'mouseDown' && (input as any).button === 'left') {
        const bounds = window.getBounds();
        const cursor = screen.getCursorScreenPoint();
        
        dragOffset = {
          x: cursor.x - bounds.x,
          y: cursor.y - bounds.y
        };
        isDragging = true;
      } else if (input.type === 'mouseUp' && (input as any).button === 'left') {
        isDragging = false;
      }
    });

    window.on('moved', () => {
      if (isDragging) {
        const cursor = screen.getCursorScreenPoint();
        const newX = cursor.x - dragOffset.x;
        const newY = cursor.y - dragOffset.y;
        
        // Keep window within screen bounds
        const display = screen.getDisplayNearestPoint(cursor);
        const maxX = display.workArea.x + display.workArea.width - window.getBounds().width;
        const maxY = display.workArea.y + display.workArea.height - window.getBounds().height;
        
        const clampedX = Math.max(display.workArea.x, Math.min(maxX, newX));
        const clampedY = Math.max(display.workArea.y, Math.min(maxY, newY));
        
        window.setPosition(clampedX, clampedY);
      }
    });
  }

  public getWidgetWindow(): BrowserWindow | null {
    return this.widgetWindow;
  }

  public getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow;
  }
}
