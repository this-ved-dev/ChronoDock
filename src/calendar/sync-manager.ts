import { google } from 'googleapis';
import { DatabaseManager } from '../database/database-manager';
import { AuthManager } from '../auth/auth-manager';
import { Calendar, CalendarEvent, SyncResult, SyncOptions } from '../shared/types';

export class CalendarSyncManager {
  private calendar: any;
  private isSyncing: boolean = false;

  constructor(
    private databaseManager: DatabaseManager,
    private authManager: AuthManager
  ) {
    this.calendar = google.calendar('v3');
  }

  public async performSync(options: SyncOptions = {}): Promise<SyncResult> {
    console.log('Starting calendar sync...');
    
    if (this.isSyncing && !options.force) {
      console.log('Sync already in progress, skipping');
      return {
        success: false,
        calendarsUpdated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: ['Sync already in progress']
      };
    }

    this.isSyncing = true;
    
    try {
      console.log('Getting access token...');
      const accessToken = await this.authManager.getValidAccessToken();
      if (!accessToken) {
        console.log('No valid access token available - sync aborted');
        throw new Error('No valid access token available');
      }
      console.log('Access token obtained successfully:', accessToken.substring(0, 20) + '...');

      // Set up OAuth2 client
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      
      let calendarsUpdated = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;
      const errors: string[] = [];

      try {
        console.log('Syncing calendars...');
        // Sync calendars first
        calendarsUpdated = await this.syncCalendars(auth);
        console.log(`Calendars synced: ${calendarsUpdated} calendars updated`);
      } catch (error) {
        console.error('Calendar sync failed:', error);
        errors.push(`Calendar sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Get selected calendars for event sync
      const calendars = this.databaseManager.getCalendars(true);
      console.log(`Found ${calendars.length} selected calendars for event sync:`, calendars.map(c => c.summary));
      const calendarIds = options.calendarIds || calendars.map(c => c.id);
      console.log('Calendar IDs to sync events for:', calendarIds);

      // Sync events for each calendar
      for (const calendarId of calendarIds) {
        try {
          console.log(`Syncing events for calendar: ${calendarId}`);
          const result = await this.syncCalendarEvents(auth, calendarId, options);
          console.log(`Events sync result for ${calendarId}:`, result);
          eventsUpdated += result.eventsUpdated;
          eventsDeleted += result.eventsDeleted;
        } catch (error) {
          console.error(`Events sync failed for ${calendarId}:`, error);
          errors.push(`Events sync failed for ${calendarId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        success: errors.length === 0,
        calendarsUpdated,
        eventsUpdated,
        eventsDeleted,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      return {
        success: false,
        calendarsUpdated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [error instanceof Error ? error.message : 'Unknown sync error']
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncCalendars(auth: any): Promise<number> {
    console.log('Fetching calendar list from Google Calendar API...');
    let calendarsUpdated = 0;
    let pageToken: string | undefined;

    do {
      console.log('Making API call to calendarList.list...');
      const response = await this.calendar.calendarList.list({
        auth,
        pageToken,
        maxResults: 250
      });

      console.log('API response received:', {
        itemCount: response.data.items?.length || 0,
        hasNextPage: !!response.data.nextPageToken
      });

      if (response.data.items) {
        for (const calendarData of response.data.items) {
          console.log('Processing calendar:', calendarData.summary || calendarData.id);
          
          const calendar: Calendar = {
            id: calendarData.id,
            summary: calendarData.summary || calendarData.id,
            description: calendarData.description,
            colorId: calendarData.colorId,
            backgroundColor: calendarData.backgroundColor,
            foregroundColor: calendarData.foregroundColor,
            primary: calendarData.primary || false,
            selected: calendarData.selected !== false, // Default to true
            accessRole: calendarData.accessRole,
            etag: calendarData.etag
          };

          this.databaseManager.upsertCalendar(calendar);
          calendarsUpdated++;
        }
      } else {
        console.log('No calendar items in response');
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`Calendar sync complete: ${calendarsUpdated} calendars processed`);
    return calendarsUpdated;
  }

  private async syncCalendarEvents(
    auth: any, 
    calendarId: string, 
    options: SyncOptions
  ): Promise<{ eventsUpdated: number; eventsDeleted: number }> {
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // Get stored calendar for sync token
    const calendars = this.databaseManager.getCalendars();
    const calendar = calendars.find(c => c.id === calendarId);
    
    // Set up time range
    const now = new Date();
    const timeMin = options.timeMin || new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    const timeMax = options.timeMax || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

    let syncToken = calendar?.syncToken;
    let pageToken: string | undefined;

    try {
      do {
        const requestParams: any = {
          auth,
          calendarId,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken
        };

        // Use sync token for incremental sync, or time range for full sync
        if (syncToken && !options.force) {
          requestParams.syncToken = syncToken;
        } else {
          requestParams.timeMin = timeMin.toISOString();
          requestParams.timeMax = timeMax.toISOString();
        }

        const response = await this.calendar.events.list(requestParams);

        if (response.data.items) {
          for (const eventData of response.data.items) {
            if (eventData.status === 'cancelled') {
              // Delete cancelled events
              this.databaseManager.deleteEvent(eventData.id);
              eventsDeleted++;
            } else {
              // Process and store event
              const event = this.processEventData(eventData, calendarId);
              if (event) {
                this.databaseManager.upsertEvent(event);
                eventsUpdated++;
              }
            }
          }
        }

        // Update sync token
        if (response.data.nextSyncToken) {
          this.databaseManager.updateCalendarSyncToken(calendarId, response.data.nextSyncToken);
          syncToken = response.data.nextSyncToken;
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

    } catch (error: any) {
      // Handle 410 Gone error (invalid sync token)
      if (error.code === 410) {
        console.log(`Sync token invalid for ${calendarId}, performing full sync`);
        
        // Clear sync token and retry with full sync
        this.databaseManager.updateCalendarSyncToken(calendarId, '');
        
        return await this.syncCalendarEvents(auth, calendarId, {
          ...options,
          force: true
        });
      }
      
      // Handle rate limiting
      if (error.code === 403 || error.code === 429) {
        const retryAfter = this.getRetryDelay(error);
        console.log(`Rate limited, retrying after ${retryAfter}ms`);
        
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        
        return await this.syncCalendarEvents(auth, calendarId, options);
      }
      
      throw error;
    }

    return { eventsUpdated, eventsDeleted };
  }

  private processEventData(eventData: any, calendarId: string): CalendarEvent | null {
    try {
      // Skip events without start time
      if (!eventData.start) {
        return null;
      }

      const event: CalendarEvent = {
        id: eventData.id,
        calendarId,
        summary: eventData.summary,
        description: eventData.description,
        location: eventData.location,
        start: {
          dateTime: eventData.start.dateTime,
          date: eventData.start.date,
          timeZone: eventData.start.timeZone
        },
        end: {
          dateTime: eventData.end?.dateTime,
          date: eventData.end?.date,
          timeZone: eventData.end?.timeZone
        },
        allDay: !!eventData.start.date && !eventData.start.dateTime,
        recurring: !!(eventData.recurringEventId || eventData.recurrence),
        htmlLink: eventData.htmlLink,
        status: eventData.status,
        transparency: eventData.transparency,
        visibility: eventData.visibility,
        organizer: eventData.organizer ? {
          email: eventData.organizer.email,
          displayName: eventData.organizer.displayName
        } : undefined,
        creator: eventData.creator ? {
          email: eventData.creator.email,
          displayName: eventData.creator.displayName
        } : undefined,
        raw: eventData,
        etag: eventData.etag
      };

      return event;
    } catch (error) {
      console.error('Failed to process event data:', error, eventData);
      return null;
    }
  }

  private getRetryDelay(error: any): number {
    // Extract retry-after header if available
    if (error.response?.headers?.['retry-after']) {
      const retryAfter = parseInt(error.response.headers['retry-after']);
      return retryAfter * 1000; // Convert to milliseconds
    }

    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 60 seconds
    const jitter = Math.random() * 1000;
    
    return Math.min(baseDelay * Math.pow(2, Math.floor(Math.random() * 4)) + jitter, maxDelay);
  }

  public async getEvents(options: {
    startTime?: Date;
    endTime?: Date;
    calendarIds?: string[];
    limit?: number;
  } = {}): Promise<CalendarEvent[]> {
    return this.databaseManager.getEvents(options);
  }

  public async getCalendars(): Promise<Calendar[]> {
    return this.databaseManager.getCalendars();
  }

  public async getSelectedCalendars(): Promise<Calendar[]> {
    return this.databaseManager.getCalendars(true);
  }

  public async updateCalendarSelection(calendarId: string, selected: boolean): Promise<void> {
    const calendars = this.databaseManager.getCalendars();
    const calendar = calendars.find(c => c.id === calendarId);
    
    if (calendar) {
      calendar.selected = selected;
      this.databaseManager.upsertCalendar(calendar);
    }
  }

  public async getTodayEvents(): Promise<CalendarEvent[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    return this.getEvents({
      startTime: startOfDay,
      endTime: endOfDay
    });
  }

  public async getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
    const now = new Date();
    const endTime = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.getEvents({
      startTime: now,
      endTime: endTime
    });
  }

  public async searchEvents(query: string, limit: number = 50): Promise<CalendarEvent[]> {
    const allEvents = this.databaseManager.getEvents({ limit: 1000 });
    
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    
    return allEvents
      .filter(event => {
        const searchText = [
          event.summary,
          event.description,
          event.location,
          event.calendar?.summary
        ].join(' ').toLowerCase();

        return searchTerms.every(term => searchText.includes(term));
      })
      .slice(0, limit);
  }

  public async getEventById(eventId: string): Promise<CalendarEvent | null> {
    const events = this.databaseManager.getEvents();
    return events.find(event => event.id === eventId) || null;
  }

  public isSync(): boolean {
    return this.isSyncing;
  }

  public async createEvent(eventData: any): Promise<any> {
    try {
      console.log('Creating new event:', eventData);
      
      // Get valid access token
      const accessToken = await this.authManager.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token available');
      }

      // Set up OAuth2 client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      // Initialize Calendar API
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Get the user's primary calendar
      const calendars = await this.databaseManager.getCalendars();
      const primaryCalendar = calendars.find(cal => cal.primary) || calendars[0];
      
      if (!primaryCalendar) {
        throw new Error('No calendar available for creating events');
      }

      console.log(`Creating event in calendar: ${primaryCalendar.id}`);

      // Create the event
      const response = await calendar.events.insert({
        calendarId: primaryCalendar.id,
        requestBody: eventData,
      });

      console.log('Event created successfully:', response.data.id);

      // Trigger a sync to update local data
      setTimeout(() => {
        this.performSync();
      }, 1000);

      return response.data;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  }
}
