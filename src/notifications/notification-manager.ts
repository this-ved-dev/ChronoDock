import { Notification } from 'electron';
import { DatabaseManager } from '../database/database-manager';
import { CalendarEvent, Reminder, NotificationState } from '../shared/types';

// Windows Toast Notifications
let windowsNotifications: any = null;
try {
  windowsNotifications = require('electron-windows-notifications');
} catch (error) {
  console.warn('Windows notifications not available, using Electron notifications');
}

export class NotificationManager {
  private reminderCheckInterval: NodeJS.Timeout | null = null;
  private databaseManager: DatabaseManager | null = null;

  constructor() {
    this.startReminderCheck();
  }

  public setDatabaseManager(databaseManager: DatabaseManager): void {
    this.databaseManager = databaseManager;
  }

  private startReminderCheck(): void {
    // Check for pending reminders every minute
    this.reminderCheckInterval = setInterval(() => {
      this.checkPendingReminders();
    }, 60000);

    // Also check immediately
    this.checkPendingReminders();
  }

  private async checkPendingReminders(): Promise<void> {
    if (!this.databaseManager) return;

    try {
      const now = new Date();
      const pendingReminders = this.databaseManager.getPendingReminders(now);

      for (const reminder of pendingReminders) {
        await this.fireReminder(reminder);
        this.databaseManager.markReminderFired(reminder.id!);
      }
    } catch (error) {
      console.error('Error checking pending reminders:', error);
    }
  }

  private async fireReminder(reminder: Reminder): Promise<void> {
    if (!this.databaseManager) return;

    try {
      // Get the event for the reminder
      const events = this.databaseManager.getEvents();
      const event = events.find(e => e.id === reminder.eventId);
      
      if (!event) {
        console.warn('Event not found for reminder:', reminder.eventId);
        return;
      }

      await this.showEventReminder(event, reminder);

      // Record notification state
      const notificationState: NotificationState = {
        eventId: reminder.eventId,
        reminderId: reminder.id,
        notificationType: 'reminder',
        firedAt: new Date()
      };

      // Store notification state in database if needed
      // this.databaseManager.insertNotificationState(notificationState);

    } catch (error) {
      console.error('Error firing reminder:', error);
    }
  }

  public async showEventReminder(event: CalendarEvent, reminder?: Reminder): Promise<void> {
    const title = event.summary || 'Calendar Event';
    const startTime = this.formatEventTime(event);
    const location = event.location ? ` at ${event.location}` : '';
    
    let body = `${startTime}${location}`;
    if (reminder) {
      body = `Reminder: ${body}`;
    }

    // Try Windows native notifications first
    if (windowsNotifications && process.platform === 'win32') {
      try {
        await this.showWindowsToast(title, body, event);
        return;
      } catch (error) {
        console.warn('Windows toast notification failed, falling back to Electron:', error);
      }
    }

    // Fallback to Electron notification
    this.showElectronNotification(title, body, event);
  }

  private async showWindowsToast(title: string, body: string, event: CalendarEvent): Promise<void> {
    if (!windowsNotifications) return;

    const toast = new windowsNotifications.ToastNotification({
      template: windowsNotifications.ToastTemplateType.ToastText02,
      strings: [title, body],
      tag: `event-${event.id}`,
      group: 'calendar-reminders'
    });

    // Add action buttons
    toast.addAction(new windowsNotifications.ToastAction({
      content: 'Open in Calendar',
      arguments: `action=open&eventId=${event.id}&url=${event.htmlLink}`
    }));

    toast.addAction(new windowsNotifications.ToastAction({
      content: 'Dismiss',
      arguments: `action=dismiss&eventId=${event.id}`
    }));

    // Handle toast events
    toast.on('activated', (args: any) => {
      this.handleToastAction(args, event);
    });

    toast.on('dismissed', (args: any) => {
      console.log('Toast dismissed:', args);
    });

    toast.on('failed', (error: any) => {
      console.error('Toast notification failed:', error);
    });

    // Show the toast
    windowsNotifications.ToastNotificationManager.show(toast);
  }

  private showElectronNotification(title: string, body: string, event: CalendarEvent): void {
    if (!Notification.isSupported()) {
      console.warn('Notifications not supported');
      return;
    }

    const notification = new Notification({
      title,
      body,
      icon: this.getNotificationIcon(),
      silent: false
    });

    notification.on('click', () => {
      this.handleNotificationClick(event);
    });

    notification.on('close', () => {
      console.log('Notification closed');
    });

    notification.show();
  }

  private handleToastAction(args: any, event: CalendarEvent): void {
    try {
      const params = new URLSearchParams(args);
      const action = params.get('action');

      switch (action) {
        case 'open':
          this.openEventInBrowser(event);
          break;
        case 'dismiss':
          // Just dismiss, no action needed
          break;
        default:
          console.warn('Unknown toast action:', action);
      }
    } catch (error) {
      console.error('Error handling toast action:', error);
    }
  }

  private handleNotificationClick(event: CalendarEvent): void {
    this.openEventInBrowser(event);
  }

  private openEventInBrowser(event: CalendarEvent): void {
    if (event.htmlLink) {
      require('electron').shell.openExternal(event.htmlLink);
    }
  }

  private formatEventTime(event: CalendarEvent): string {
    if (event.allDay) {
      return 'All day';
    }

    const startTime = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;

    if (!startTime) {
      return 'Time TBD';
    }

    const timeFormat: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };

    if (endTime && startTime.toDateString() === endTime.toDateString()) {
      return `${startTime.toLocaleTimeString('en-US', timeFormat)} - ${endTime.toLocaleTimeString('en-US', timeFormat)}`;
    } else {
      return startTime.toLocaleTimeString('en-US', timeFormat);
    }
  }

  private getNotificationIcon(): string {
    // Return path to notification icon
    const path = require('path');
    return path.join(__dirname, '../../assets/notification-icon.png');
  }

  public async scheduleEventReminders(event: CalendarEvent): Promise<void> {
    if (!this.databaseManager || !event.start?.dateTime) return;

    try {
      const startTime = new Date(event.start.dateTime);
      const now = new Date();

      // Default reminder times (in minutes before event)
      const defaultReminders = [15, 60]; // 15 minutes and 1 hour before

      // Check if event has custom reminders in raw data
      const customReminders = event.raw?.reminders?.overrides || [];
      const reminderTimes = customReminders.length > 0 
        ? customReminders.map((r: any) => r.minutes)
        : defaultReminders;

      for (const minutes of reminderTimes) {
        const triggerTime = new Date(startTime.getTime() - minutes * 60 * 1000);
        
        // Only schedule future reminders
        if (triggerTime > now) {
          const reminder: Reminder = {
            eventId: event.id,
            method: 'popup',
            minutes,
            triggerTime,
            fired: false
          };

          this.databaseManager.upsertReminder(reminder);
        }
      }
    } catch (error) {
      console.error('Error scheduling event reminders:', error);
    }
  }

  public async showTestNotification(): Promise<void> {
    const testEvent: CalendarEvent = {
      id: 'test-event',
      calendarId: 'test-calendar',
      summary: 'Test Event',
      start: {
        dateTime: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes from now
      },
      end: {
        dateTime: new Date(Date.now() + 65 * 60 * 1000).toISOString() // 1 hour 5 minutes from now
      },
      location: 'Test Location',
      htmlLink: 'https://calendar.google.com',
      allDay: false
    };

    await this.showEventReminder(testEvent);
  }

  public async clearAllReminders(): Promise<void> {
    // This would clear all pending reminders from the database
    // Implementation depends on database schema
    console.log('Clear all reminders requested');
  }

  public stop(): void {
    if (this.reminderCheckInterval) {
      clearInterval(this.reminderCheckInterval);
      this.reminderCheckInterval = null;
    }
  }

  public async requestNotificationPermission(): Promise<boolean> {
    if (process.platform === 'win32') {
      // Windows doesn't require explicit permission for notifications
      return true;
    }

    // For other platforms, we might need to request permission
    return Notification.isSupported();
  }

  public isNotificationSupported(): boolean {
    return Notification.isSupported() || (windowsNotifications !== null);
  }
}
