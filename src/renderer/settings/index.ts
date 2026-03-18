import '../shared/neumorphic.css';
import { AppSettings } from '../../shared/types';

class SettingsWindow {
  private settings: AppSettings = {};
  private currentSection: string = 'account';

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.setupEventListeners();
    await this.loadSettings();
    this.updateUI();
  }

  private setupEventListeners(): void {
    // Sidebar navigation
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const section = (e.currentTarget as HTMLElement).dataset.section;
        if (section) {
          this.switchSection(section);
        }
      });
    });


    // Appearance section
    document.getElementById('themeSelect')?.addEventListener('change', (e) => {
      this.updateSetting('theme', (e.target as HTMLSelectElement).value);
    });

    document.getElementById('opacitySlider')?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.updateSetting('opacity', value);
      this.updateOpacityDisplay(value);
    });

    document.getElementById('alwaysOnTopToggle')?.addEventListener('change', (e) => {
      this.updateSetting('alwaysOnTop', (e.target as HTMLInputElement).checked);
    });

    document.getElementById('clickThroughToggle')?.addEventListener('change', (e) => {
      this.updateSetting('clickThrough', (e.target as HTMLInputElement).checked);
    });

    document.getElementById('pinToDesktopToggle')?.addEventListener('change', (e) => {
      this.updateSetting('pinToDesktop', (e.target as HTMLInputElement).checked);
    });

    // Behavior section
    document.getElementById('syncIntervalSelect')?.addEventListener('change', (e) => {
      this.updateSetting('syncInterval', parseInt((e.target as HTMLSelectElement).value));
    });

    document.getElementById('horizonSelect')?.addEventListener('change', (e) => {
      this.updateSetting('horizon', parseInt((e.target as HTMLSelectElement).value));
    });

    document.getElementById('timeFormatSelect')?.addEventListener('change', (e) => {
      this.updateSetting('timeFormat', (e.target as HTMLSelectElement).value);
    });

    document.getElementById('showWeekendsToggle')?.addEventListener('change', (e) => {
      this.updateSetting('showWeekends', (e.target as HTMLInputElement).checked);
    });

    // Notifications section
    document.getElementById('notificationsToggle')?.addEventListener('change', (e) => {
      const notifications = this.settings.notifications || { enabled: true, sound: true, defaultReminder: 15 };
      notifications.enabled = (e.target as HTMLInputElement).checked;
      this.updateSetting('notifications', notifications);
    });

    document.getElementById('soundToggle')?.addEventListener('change', (e) => {
      const notifications = this.settings.notifications || { enabled: true, sound: true, defaultReminder: 15 };
      notifications.sound = (e.target as HTMLInputElement).checked;
      this.updateSetting('notifications', notifications);
    });

    document.getElementById('defaultReminderSelect')?.addEventListener('change', (e) => {
      const notifications = this.settings.notifications || { enabled: true, sound: true, defaultReminder: 15 };
      notifications.defaultReminder = parseInt((e.target as HTMLSelectElement).value);
      this.updateSetting('notifications', notifications);
    });

    document.getElementById('testNotificationBtn')?.addEventListener('click', () => {
      this.handleTestNotification();
    });

    // Advanced section
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
      this.handleClearCache();
    });

    document.getElementById('exportSettingsBtn')?.addEventListener('click', () => {
      this.handleExportSettings();
    });

    document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
      this.handleResetSettings();
    });

    document.getElementById('devToolsBtn')?.addEventListener('click', () => {
      this.handleOpenDevTools();
    });


    // Listen for settings changes
    window.electronAPI.on('settings:changed', () => {
      this.loadSettings();
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await window.electronAPI.settings.getAll();
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }


  private updateUI(): void {
    this.updateAppearanceUI();
    this.updateBehaviorUI();
    this.updateNotificationsUI();
    this.applyTheme();
  }


  private updateAppearanceUI(): void {
    // Theme
    const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
    if (themeSelect) {
      themeSelect.value = this.settings.theme || 'auto';
    }

    // Opacity
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    if (opacitySlider) {
      opacitySlider.value = (this.settings.opacity || 0.9).toString();
      this.updateOpacityDisplay(this.settings.opacity || 0.9);
    }

    // Toggles
    this.updateToggle('alwaysOnTopToggle', this.settings.alwaysOnTop);
    this.updateToggle('clickThroughToggle', this.settings.clickThrough);
    this.updateToggle('pinToDesktopToggle', this.settings.pinToDesktop);
  }

  private updateBehaviorUI(): void {
    // Sync interval
    const syncIntervalSelect = document.getElementById('syncIntervalSelect') as HTMLSelectElement;
    if (syncIntervalSelect) {
      syncIntervalSelect.value = (this.settings.syncInterval || 10).toString();
    }

    // Horizon
    const horizonSelect = document.getElementById('horizonSelect') as HTMLSelectElement;
    if (horizonSelect) {
      horizonSelect.value = (this.settings.horizon || 30).toString();
    }

    // Time format
    const timeFormatSelect = document.getElementById('timeFormatSelect') as HTMLSelectElement;
    if (timeFormatSelect) {
      timeFormatSelect.value = this.settings.timeFormat || '12h';
    }

    // Show weekends
    this.updateToggle('showWeekendsToggle', this.settings.showWeekends);
  }

  private updateNotificationsUI(): void {
    const notifications = this.settings.notifications || { enabled: true, sound: true, defaultReminder: 15 };
    
    this.updateToggle('notificationsToggle', notifications.enabled);
    this.updateToggle('soundToggle', notifications.sound);

    const defaultReminderSelect = document.getElementById('defaultReminderSelect') as HTMLSelectElement;
    if (defaultReminderSelect) {
      defaultReminderSelect.value = notifications.defaultReminder.toString();
    }
  }


  private updateToggle(elementId: string, value: boolean | undefined): void {
    const toggle = document.getElementById(elementId) as HTMLInputElement;
    if (toggle) {
      toggle.checked = value || false;
    }
  }

  private updateOpacityDisplay(value: number): void {
    const opacityValue = document.getElementById('opacityValue');
    if (opacityValue) {
      opacityValue.textContent = `${Math.round(value * 100)}%`;
    }
  }

  private switchSection(section: string): void {
    // Update sidebar
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.settings-section').forEach(sec => {
      sec.classList.remove('active');
    });
    document.getElementById(section)?.classList.add('active');

    this.currentSection = section;
  }

  private async updateSetting(key: keyof AppSettings, value: any): Promise<void> {
    try {
      await window.electronAPI.settings.set(key, value);
      (this.settings as any)[key] = value;
      
      // Apply immediate changes
      if (key === 'theme') {
        this.applyTheme();
      }
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
    }
  }

  private applyTheme(): void {
    const theme = this.settings.theme || 'auto';
    
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else if (theme === 'light') {
      document.body.classList.remove('dark');
    } else {
        // Auto theme - use system preference  
        try {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.body.classList.toggle('dark', prefersDark);
        } catch (error) {
          // Fallback to light theme if matchMedia is not supported
          document.body.classList.remove('dark');
        }
    }
  }


  private async handleTestNotification(): Promise<void> {
    try {
      const response = await window.electronAPI.notifications.test();
      if (response.success) {
        alert('Test notification sent! Check your system notifications.');
      } else {
        throw new Error(response.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      alert('Failed to send test notification.');
    }
  }

  private async handleClearCache(): Promise<void> {
    if (confirm('Are you sure you want to clear all cached data? This will require a full sync.')) {
      try {
        const response = await window.electronAPI.notifications.clearCache();
        if (response.success) {
          alert('Cache cleared successfully.');
        } else {
          throw new Error(response.error || 'Failed to clear cache');
        }
      } catch (error) {
        console.error('Failed to clear cache:', error);
        alert('Failed to clear cache.');
      }
    }
  }

  private async handleExportSettings(): Promise<void> {
    try {
      const settingsJson = await window.electronAPI.settings.export();
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'calendar-settings.json';
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export settings:', error);
      alert('Failed to export settings.');
    }
  }

  private async handleResetSettings(): Promise<void> {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        const response = await window.electronAPI.settings.reset();
        if (response.success) {
          alert('Settings reset to defaults.');
          location.reload();
        } else {
          throw new Error(response.error || 'Failed to reset settings');
        }
      } catch (error) {
        console.error('Failed to reset settings:', error);
        alert('Failed to reset settings.');
      }
    }
  }

  private async handleOpenDevTools(): Promise<void> {
    try {
      await window.electronAPI.app.openDevTools();
    } catch (error) {
      console.error('Failed to open developer tools:', error);
      alert('Failed to open developer tools.');
    }
  }
}

// Initialize settings window when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsWindow();
});
