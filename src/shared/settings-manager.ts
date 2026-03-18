import Store from 'electron-store';
import { AppSettings } from './types';

export class SettingsManager {
  private store: Store<AppSettings>;
  private defaults: AppSettings = {
    syncInterval: 10, // minutes
    horizon: 30, // days
    theme: 'auto',
    opacity: 0.9,
    alwaysOnTop: true,
    clickThrough: false,
    pinToDesktop: false,
    timeFormat: '12h',
    showWeekends: true,
    compactView: false,
    selectedCalendars: [],
    windowPosition: { x: -1, y: -1 }, // -1 means auto-position
    windowSize: { width: 350, height: 500 },
    notifications: {
      enabled: true,
      sound: true,
      defaultReminder: 15 // minutes
    }
  };

  constructor() {
    this.store = new Store<AppSettings>({
      defaults: this.defaults,
      name: 'settings',
      fileExtension: 'json',
      clearInvalidConfig: true
    });
  }

  public get<K extends keyof AppSettings>(key: K, defaultValue?: any): any {
    return this.store.get(key, defaultValue ?? this.defaults[key]);
  }

  public set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.store.set(key, value);
  }

  public getAll(): AppSettings {
    return this.store.store;
  }

  public setAll(settings: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.store.set(key as keyof AppSettings, value);
    }
  }

  public reset(): void {
    this.store.clear();
  }

  public resetKey<K extends keyof AppSettings>(key: K): void {
    this.store.delete(key);
  }

  public has<K extends keyof AppSettings>(key: K): boolean {
    return this.store.has(key);
  }

  // Convenience methods for commonly used settings
  public getSyncInterval(): number {
    return this.get('syncInterval') || 10;
  }

  public setSyncInterval(minutes: number): void {
    this.set('syncInterval', Math.max(1, Math.min(60, minutes)));
  }

  public getHorizon(): number {
    return this.get('horizon') || 30;
  }

  public setHorizon(days: number): void {
    this.set('horizon', Math.max(1, Math.min(365, days)));
  }

  public getTheme(): 'light' | 'dark' | 'auto' {
    return this.get('theme') || 'auto';
  }

  public setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.set('theme', theme);
  }

  public getOpacity(): number {
    return this.get('opacity') || 0.9;
  }

  public setOpacity(opacity: number): void {
    this.set('opacity', Math.max(0.1, Math.min(1.0, opacity)));
  }

  public isAlwaysOnTop(): boolean {
    return this.get('alwaysOnTop') !== false;
  }

  public setAlwaysOnTop(alwaysOnTop: boolean): void {
    this.set('alwaysOnTop', alwaysOnTop);
  }

  public isClickThrough(): boolean {
    return this.get('clickThrough') || false;
  }

  public setClickThrough(clickThrough: boolean): void {
    this.set('clickThrough', clickThrough);
  }

  public isPinnedToDesktop(): boolean {
    return this.get('pinToDesktop') || false;
  }

  public setPinnedToDesktop(pinned: boolean): void {
    this.set('pinToDesktop', pinned);
  }

  public getTimeFormat(): '12h' | '24h' {
    return this.get('timeFormat') || '12h';
  }

  public setTimeFormat(format: '12h' | '24h'): void {
    this.set('timeFormat', format);
  }

  public getSelectedCalendars(): string[] {
    return this.get('selectedCalendars') || [];
  }

  public setSelectedCalendars(calendarIds: string[]): void {
    this.set('selectedCalendars', calendarIds);
  }

  public addSelectedCalendar(calendarId: string): void {
    const selected = this.getSelectedCalendars();
    if (!selected.includes(calendarId)) {
      selected.push(calendarId);
      this.setSelectedCalendars(selected);
    }
  }

  public removeSelectedCalendar(calendarId: string): void {
    const selected = this.getSelectedCalendars();
    const filtered = selected.filter(id => id !== calendarId);
    this.setSelectedCalendars(filtered);
  }

  public getWindowPosition(): { x: number; y: number } {
    return this.get('windowPosition') || { x: -1, y: -1 };
  }

  public setWindowPosition(x: number, y: number): void {
    this.set('windowPosition', { x, y });
  }

  public getWindowSize(): { width: number; height: number } {
    return this.get('windowSize') || { width: 350, height: 500 };
  }

  public setWindowSize(width: number, height: number): void {
    this.set('windowSize', { 
      width: Math.max(300, Math.min(800, width)),
      height: Math.max(400, Math.min(1000, height))
    });
  }

  public areNotificationsEnabled(): boolean {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    return notifications.enabled;
  }

  public setNotificationsEnabled(enabled: boolean): void {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    this.set('notifications', { ...notifications, enabled });
  }

  public isNotificationSoundEnabled(): boolean {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    return notifications.sound;
  }

  public setNotificationSound(enabled: boolean): void {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    this.set('notifications', { ...notifications, sound: enabled });
  }

  public getDefaultReminderMinutes(): number {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    return notifications.defaultReminder;
  }

  public setDefaultReminderMinutes(minutes: number): void {
    const notifications = this.get('notifications') || this.defaults.notifications!;
    this.set('notifications', { 
      ...notifications, 
      defaultReminder: Math.max(0, Math.min(1440, minutes)) 
    });
  }

  // Migration and validation methods
  public validateSettings(): void {
    const settings = this.getAll();
    let hasChanges = false;

    // Validate and fix numeric ranges
    if (settings.syncInterval && (settings.syncInterval < 1 || settings.syncInterval > 60)) {
      this.setSyncInterval(10);
      hasChanges = true;
    }

    if (settings.horizon && (settings.horizon < 1 || settings.horizon > 365)) {
      this.setHorizon(30);
      hasChanges = true;
    }

    if (settings.opacity && (settings.opacity < 0.1 || settings.opacity > 1.0)) {
      this.setOpacity(0.9);
      hasChanges = true;
    }

    // Validate theme
    if (settings.theme && !['light', 'dark', 'auto'].includes(settings.theme)) {
      this.setTheme('auto');
      hasChanges = true;
    }

    // Validate time format
    if (settings.timeFormat && !['12h', '24h'].includes(settings.timeFormat)) {
      this.setTimeFormat('12h');
      hasChanges = true;
    }

    if (hasChanges) {
      console.log('Settings validated and corrected');
    }
  }

  public exportSettings(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  public importSettings(settingsJson: string): boolean {
    try {
      const settings = JSON.parse(settingsJson) as Partial<AppSettings>;
      this.setAll(settings);
      this.validateSettings();
      return true;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }
}
