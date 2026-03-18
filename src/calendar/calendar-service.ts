import { google } from 'googleapis';
import { AuthManager } from '../auth/auth-manager';

export class CalendarService {
  constructor(private authManager: AuthManager) {}

  public async getCalendars(): Promise<any[]> {
    try {
      console.log('Getting calendars...');
      
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

      console.log('Fetching calendar list from Google Calendar API...');
      const response = await calendar.calendarList.list({
        maxResults: 250,
        showDeleted: false,
        showHidden: false
      });

      const calendars = response.data.items || [];
      console.log(`Found ${calendars.length} calendars`);

      // Transform to simple format
      return calendars.map(cal => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        backgroundColor: cal.backgroundColor,
        foregroundColor: cal.foregroundColor,
        primary: cal.primary || false,
        selected: cal.selected !== false // Default to selected unless explicitly false
      }));

    } catch (error) {
      console.error('Failed to get calendars:', error);
      throw error;
    }
  }

}
