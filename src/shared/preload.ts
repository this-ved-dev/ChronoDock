import { contextBridge, ipcRenderer } from 'electron';
import { IpcResponse, AuthStatus, CalendarEvent, Calendar, AppSettings, SyncResult } from './types';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // Auth methods
  auth: {
    login: (): Promise<IpcResponse<AuthStatus>> => 
      ipcRenderer.invoke('auth:login'),
    logout: (): Promise<IpcResponse<boolean>> => 
      ipcRenderer.invoke('auth:logout'),
    getStatus: (): Promise<IpcResponse<AuthStatus>> => 
      ipcRenderer.invoke('auth:getStatus')
  },

  // Calendar methods
  calendar: {
    getCalendars: (): Promise<IpcResponse<Calendar[]>> => 
      ipcRenderer.invoke('calendar:getCalendars')
  },

  // Settings methods
  settings: {
    get: (key: string): Promise<any> => 
      ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any): Promise<void> => 
      ipcRenderer.invoke('settings:set', key, value),
    getAll: (): Promise<AppSettings> => 
      ipcRenderer.invoke('settings:getAll'),
    reset: (): Promise<IpcResponse<void>> => 
      ipcRenderer.invoke('settings:reset'),
    export: (): Promise<string> => 
      ipcRenderer.invoke('settings:export')
  },

  // Window management methods
  window: {
    show: (): Promise<void> => 
      ipcRenderer.invoke('window:show'),
    hide: (): Promise<void> => 
      ipcRenderer.invoke('window:hide'),
    openSettings: (): Promise<void> => 
      ipcRenderer.invoke('window:openSettings'),
    pinToDesktop: (): Promise<boolean> => 
      ipcRenderer.invoke('window:pinToDesktop'),
    unpinFromDesktop: (): Promise<boolean> => 
      ipcRenderer.invoke('window:unpinFromDesktop')
  },

  // App methods
  app: {
    openExternal: (url: string): Promise<void> => 
      ipcRenderer.invoke('app:openExternal', url),
    quit: (): Promise<void> => 
      ipcRenderer.invoke('app:quit'),
    openDevTools: (): Promise<void> => 
      ipcRenderer.invoke('app:openDevTools')
  },

  // Notification methods
  notifications: {
    test: (): Promise<IpcResponse<void>> => 
      ipcRenderer.invoke('notifications:test'),
    clearCache: (): Promise<IpcResponse<void>> => 
      ipcRenderer.invoke('notifications:clearCache')
  },

  // Event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    // Whitelist of allowed channels
    const validChannels = [
      'auth:statusChanged',
      'calendar:eventsUpdated',
      'calendar:syncCompleted',
      'settings:changed',
      'notification:reminder',
      'window:stateChanged'
    ];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // Utility methods
  utils: {
    formatDate: (date: Date | string, format?: string): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      
      if (format === '24h') {
        return d.toLocaleString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      } else {
        return d.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    },

    formatDateRange: (start: Date | string, end: Date | string, allDay: boolean = false): string => {
      const startDate = typeof start === 'string' ? new Date(start) : start;
      const endDate = typeof end === 'string' ? new Date(end) : end;

      if (allDay) {
        const isSameDay = startDate.toDateString() === endDate.toDateString();
        if (isSameDay) {
          return 'All day';
        } else {
          return `All day • ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }
      } else {
        const isSameDay = startDate.toDateString() === endDate.toDateString();
        if (isSameDay) {
          return `${electronAPI.utils.formatDate(startDate)} - ${electronAPI.utils.formatDate(endDate)}`;
        } else {
          return `${startDate.toLocaleDateString()} ${electronAPI.utils.formatDate(startDate)} - ${endDate.toLocaleDateString()} ${electronAPI.utils.formatDate(endDate)}`;
        }
      }
    },

    isToday: (date: Date | string): boolean => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const today = new Date();
      return d.toDateString() === today.toDateString();
    },

    isTomorrow: (date: Date | string): boolean => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return d.toDateString() === tomorrow.toDateString();
    },

    getDayName: (date: Date | string): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (d.toDateString() === today.toDateString()) {
        return 'Today';
      } else if (d.toDateString() === tomorrow.toDateString()) {
        return 'Tomorrow';
      } else {
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      }
    },

    getRelativeTime: (date: Date | string): string => {
      const d = typeof date === 'string' ? new Date(date) : date;
      const now = new Date();
      const diffMs = d.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 0) {
        return 'Past';
      } else if (diffMins < 60) {
        return `In ${diffMins} min${diffMins !== 1 ? 's' : ''}`;
      } else if (diffHours < 24) {
        return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
      } else {
        return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
      }
    },

    truncateText: (text: string, maxLength: number): string => {
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength - 3) + '...';
    },

    getContrastColor: (backgroundColor: string): string => {
      // Simple contrast color calculation
      const hex = backgroundColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 128 ? '#000000' : '#ffffff';
    }
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
