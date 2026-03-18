// Calendar and Event Types
export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  etag?: string;
  syncToken?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  allDay?: boolean;
  recurring?: boolean;
  htmlLink?: string;
  status?: string;
  transparency?: string;
  visibility?: string;
  organizer?: {
    email: string;
    displayName?: string;
  };
  creator?: {
    email: string;
    displayName?: string;
  };
  calendar?: {
    summary: string;
    backgroundColor?: string;
    foregroundColor?: string;
  };
  raw?: any; // Store raw Google Calendar API response
  etag?: string;
}

// Settings Types
export interface AppSettings {
  syncInterval?: number; // minutes
  horizon?: number; // days
  theme?: 'light' | 'dark' | 'auto';
  opacity?: number;
  alwaysOnTop?: boolean;
  clickThrough?: boolean;
  pinToDesktop?: boolean;
  timeFormat?: '12h' | '24h';
  showWeekends?: boolean;
  compactView?: boolean;
  selectedCalendars?: string[];
  windowPosition?: {
    x: number;
    y: number;
  };
  windowSize?: {
    width: number;
    height: number;
  };
  notifications?: {
    enabled: boolean;
    sound: boolean;
    defaultReminder: number; // minutes
  };
}

// Auth Types
export interface AuthToken {
  account: string;
  metadata: {
    email: string;
    name?: string;
    picture?: string;
  };
  tokenReference: string; // Reference to encrypted token storage
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: {
    email: string;
    name?: string;
    picture?: string;
  };
  error?: string;
}

// Notification Types
export interface Reminder {
  id?: number;
  eventId: string;
  method: string;
  minutes: number;
  triggerTime: Date;
  fired?: boolean;
}

export interface NotificationState {
  id?: number;
  eventId: string;
  reminderId?: number;
  notificationType: string;
  firedAt: Date;
}

// API Response Types
export interface GoogleCalendarListResponse {
  items: any[];
  nextPageToken?: string;
  nextSyncToken?: string;
  etag: string;
}

export interface GoogleEventsResponse {
  items: any[];
  nextPageToken?: string;
  nextSyncToken?: string;
  etag: string;
}

// Widget UI Types
export interface EventDisplayItem {
  id: string;
  title: string;
  time: string;
  location?: string;
  calendar: {
    name: string;
    color: string;
  };
  isAllDay: boolean;
  isRecurring: boolean;
  htmlLink: string;
  description?: string;
  startDate: Date;
  endDate: Date;
}

export interface DayGroup {
  date: Date;
  dateString: string;
  dayName: string;
  isToday: boolean;
  events: EventDisplayItem[];
}

// IPC Types
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Sync Types
export interface SyncOptions {
  force?: boolean;
  calendarIds?: string[];
  timeMin?: Date;
  timeMax?: Date;
}

export interface SyncResult {
  success: boolean;
  calendarsUpdated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors?: string[];
}

// Filter Types
export interface EventFilter {
  search?: string;
  calendarIds?: string[];
  startDate?: Date;
  endDate?: Date;
  showAllDay?: boolean;
  showRecurring?: boolean;
}

// Window Types
export interface WindowState {
  isVisible: boolean;
  isPinned: boolean;
  isClickThrough: boolean;
  opacity: number;
  alwaysOnTop: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// Theme Types
export interface ThemeConfig {
  name: string;
  colors: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    text: string;
    textSecondary: string;
    border: string;
    accent: string;
  };
  effects: {
    blur: boolean;
    acrylic: boolean;
    transparency: number;
  };
}
