import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { CalendarEvent, Calendar, AppSettings, AuthToken, Reminder, NotificationState } from '../shared/types';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'calendar.db');
  }

  public async initialize(): Promise<void> {
    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      
      await this.createTables();
      await this.createIndexes();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      // App settings table
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Auth tokens table
      `CREATE TABLE IF NOT EXISTS auth_tokens (
        account TEXT PRIMARY KEY,
        metadata TEXT NOT NULL,
        token_reference TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Calendars table
      `CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        description TEXT,
        color_id TEXT,
        background_color TEXT,
        foreground_color TEXT,
        primary_calendar BOOLEAN DEFAULT FALSE,
        selected BOOLEAN DEFAULT TRUE,
        access_role TEXT,
        etag TEXT,
        sync_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Events table
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        location TEXT,
        start_time DATETIME,
        end_time DATETIME,
        start_date TEXT,
        end_date TEXT,
        all_day BOOLEAN DEFAULT FALSE,
        recurring BOOLEAN DEFAULT FALSE,
        html_link TEXT,
        status TEXT DEFAULT 'confirmed',
        transparency TEXT DEFAULT 'opaque',
        visibility TEXT DEFAULT 'default',
        organizer_email TEXT,
        organizer_name TEXT,
        creator_email TEXT,
        creator_name TEXT,
        raw_json TEXT NOT NULL,
        etag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE
      )`,

      // Reminders table
      `CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        method TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        trigger_time DATETIME NOT NULL,
        fired BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
      )`,

      // Notification state table
      `CREATE TABLE IF NOT EXISTS notification_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        reminder_id INTEGER,
        notification_type TEXT NOT NULL,
        fired_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
        FOREIGN KEY (reminder_id) REFERENCES reminders (id) ON DELETE CASCADE
      )`
    ];

    for (const sql of tables) {
      this.db.exec(sql);
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time)',
      'CREATE INDEX IF NOT EXISTS idx_events_end_time ON events (end_time)',
      'CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON events (calendar_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events (updated_at)',
      'CREATE INDEX IF NOT EXISTS idx_calendars_selected ON calendars (selected)',
      'CREATE INDEX IF NOT EXISTS idx_reminders_trigger_time ON reminders (trigger_time)',
      'CREATE INDEX IF NOT EXISTS idx_reminders_fired ON reminders (fired)',
      'CREATE INDEX IF NOT EXISTS idx_notification_state_event_id ON notification_state (event_id)'
    ];

    for (const sql of indexes) {
      this.db.exec(sql);
    }
  }

  // Settings methods
  public getSetting(key: string, defaultValue?: any): any {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT value FROM app_settings WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    
    if (result) {
      try {
        return JSON.parse(result.value);
      } catch {
        return result.value;
      }
    }
    
    return defaultValue;
  }

  public setSetting(key: string, value: any): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    stmt.run(key, serializedValue);
  }

  public getAllSettings(): Record<string, any> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT key, value FROM app_settings');
    const results = stmt.all() as { key: string; value: string }[];
    
    const settings: Record<string, any> = {};
    for (const row of results) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }
    
    return settings;
  }

  // Calendar methods
  public upsertCalendar(calendar: Calendar): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO calendars (
        id, summary, description, color_id, background_color, foreground_color,
        primary_calendar, selected, access_role, etag, sync_token, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      calendar.id,
      calendar.summary,
      calendar.description || null,
      calendar.colorId || null,
      calendar.backgroundColor || null,
      calendar.foregroundColor || null,
      calendar.primary ? 1 : 0,
      calendar.selected !== false ? 1 : 0, // Default to true if not specified
      calendar.accessRole || null,
      calendar.etag || null,
      calendar.syncToken || null
    );
  }

  public getCalendars(selectedOnly: boolean = false): Calendar[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM calendars';
    if (selectedOnly) {
      sql += ' WHERE selected = TRUE';
    }
    sql += ' ORDER BY primary_calendar DESC, summary ASC';

    const stmt = this.db.prepare(sql);
    const results = stmt.all() as any[];

    return results.map(row => ({
      id: row.id,
      summary: row.summary,
      description: row.description,
      colorId: row.color_id,
      backgroundColor: row.background_color,
      foregroundColor: row.foreground_color,
      primary: row.primary_calendar === 1,
      selected: row.selected === 1,
      accessRole: row.access_role,
      etag: row.etag,
      syncToken: row.sync_token
    }));
  }

  public updateCalendarSyncToken(calendarId: string, syncToken: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE calendars 
      SET sync_token = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(syncToken, calendarId);
  }

  // Event methods
  public upsertEvent(event: CalendarEvent): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO events (
        id, calendar_id, summary, description, location,
        start_time, end_time, start_date, end_date, all_day, recurring,
        html_link, status, transparency, visibility,
        organizer_email, organizer_name, creator_email, creator_name,
        raw_json, etag, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      event.id,
      event.calendarId,
      event.summary || null,
      event.description || null,
      event.location || null,
      event.start?.dateTime || null,
      event.end?.dateTime || null,
      event.start?.date || null,
      event.end?.date || null,
      event.allDay ? 1 : 0,
      event.recurring ? 1 : 0,
      event.htmlLink || null,
      event.status || 'confirmed',
      event.transparency || 'opaque',
      event.visibility || 'default',
      event.organizer?.email || null,
      event.organizer?.displayName || null,
      event.creator?.email || null,
      event.creator?.displayName || null,
      event.raw ? JSON.stringify(event.raw) : null,
      event.etag || null
    );
  }

  public deleteEvent(eventId: string): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM events WHERE id = ?');
    stmt.run(eventId);
  }

  public getEvents(options: {
    startTime?: Date;
    endTime?: Date;
    calendarIds?: string[];
    limit?: number;
  } = {}): CalendarEvent[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = `
      SELECT e.*, c.summary as calendar_summary, c.background_color, c.foreground_color
      FROM events e
      JOIN calendars c ON e.calendar_id = c.id
      WHERE c.selected = TRUE
    `;
    
    const params: any[] = [];

    if (options.startTime) {
      sql += ' AND (e.start_time >= ? OR e.start_date >= ?)';
      params.push(options.startTime.toISOString(), options.startTime.toISOString().split('T')[0]);
    }

    if (options.endTime) {
      sql += ' AND (e.start_time <= ? OR e.start_date <= ?)';
      params.push(options.endTime.toISOString(), options.endTime.toISOString().split('T')[0]);
    }

    if (options.calendarIds && options.calendarIds.length > 0) {
      sql += ` AND e.calendar_id IN (${options.calendarIds.map(() => '?').join(',')})`;
      params.push(...options.calendarIds);
    }

    sql += ' ORDER BY COALESCE(e.start_time, e.start_date) ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      id: row.id,
      calendarId: row.calendar_id,
      summary: row.summary,
      description: row.description,
      location: row.location,
      start: {
        dateTime: row.start_time,
        date: row.start_date,
        timeZone: undefined // Will be handled by the sync manager
      },
      end: {
        dateTime: row.end_time,
        date: row.end_date,
        timeZone: undefined
      },
      allDay: row.all_day === 1,
      recurring: row.recurring === 1,
      htmlLink: row.html_link,
      status: row.status,
      transparency: row.transparency,
      visibility: row.visibility,
      organizer: row.organizer_email ? {
        email: row.organizer_email,
        displayName: row.organizer_name
      } : undefined,
      creator: row.creator_email ? {
        email: row.creator_email,
        displayName: row.creator_name
      } : undefined,
      calendar: {
        summary: row.calendar_summary,
        backgroundColor: row.background_color,
        foregroundColor: row.foreground_color
      },
      raw: JSON.parse(row.raw_json),
      etag: row.etag
    }));
  }

  // Reminder methods
  public upsertReminder(reminder: Reminder): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reminders (
        event_id, method, minutes, trigger_time, fired
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      reminder.eventId,
      reminder.method,
      reminder.minutes,
      reminder.triggerTime.toISOString(),
      reminder.fired || false
    );
  }

  public getPendingReminders(before?: Date): Reminder[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = 'SELECT * FROM reminders WHERE fired = FALSE';
    const params: any[] = [];

    if (before) {
      sql += ' AND trigger_time <= ?';
      params.push(before.toISOString());
    }

    sql += ' ORDER BY trigger_time ASC';

    const stmt = this.db.prepare(sql);
    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      id: row.id,
      eventId: row.event_id,
      method: row.method,
      minutes: row.minutes,
      triggerTime: new Date(row.trigger_time),
      fired: row.fired === 1
    }));
  }

  public markReminderFired(reminderId: number): void {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE reminders SET fired = TRUE WHERE id = ?');
    stmt.run(reminderId);
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }
}
