import '../shared/neumorphic.css';

class CalendarWidget {
  private settings: any = {};
  private userEmail: string = '';

  // DOM elements
  private loadingIndicator!: HTMLElement;
  private errorMessage!: HTMLElement;
  private calendarIframe!: HTMLIFrameElement;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.initialize();
  }

  private initializeElements(): void {
    this.loadingIndicator = document.getElementById('loadingIndicator')!;
    this.errorMessage = document.getElementById('errorMessage')!;
    this.calendarIframe = document.getElementById('calendarIframe')! as HTMLIFrameElement;
  }

  private setupEventListeners(): void {
    // Header buttons
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.refreshCalendar();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      this.openSettings();
    });

  }

  private async initialize(): Promise<void> {
    try {
      // Load settings
      this.settings = await window.electronAPI.settings.getAll();
      
      // Check authentication status
      const authResponse = await window.electronAPI.auth.getStatus();
      
      if (authResponse.success && authResponse.data.isAuthenticated) {
        this.userEmail = authResponse.data.user?.email || '';
        this.loadCalendar();
      } else {
        this.showError('Please sign in to view your calendar');
      }
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError('Failed to initialize calendar');
    }
  }

  private loadCalendar(): void {
    try {
      // Show loading
      this.showLoading();

      // Create Google Calendar embed URL
      const calendarUrl = this.buildCalendarUrl();
      
      // Load calendar in iframe
      this.calendarIframe.src = calendarUrl;
      
      // Handle iframe load
      this.calendarIframe.onload = () => {
        this.hideLoading();
        this.showCalendar();
      };

      this.calendarIframe.onerror = () => {
        this.hideLoading();
        this.showError('Failed to load calendar');
      };

    } catch (error) {
      console.error('Failed to load calendar:', error);
      this.hideLoading();
      this.showError('Failed to load calendar');
    }
  }

  private buildCalendarUrl(): string {
    // Use the specific calendar embed URL you provided
    const calendarUrl = 'https://calendar.google.com/calendar/embed?' +
      'height=600&wkst=1&ctz=America%2FNew_York&showTitle=0&' +
      'src=dmVkYW50bWlzcmE0NDQ0QGdtYWlsLmNvbQ&' +
      'src=MWZhMjM4MmE5YTJiMDc4OTU5MGJlZDgyYjg2YzlkNjhhODZhYzY5OTI5MTM5YzYxNDQwNzZmMDY4ODRkNDUzNEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&' +
      'src=ZGxraHZnb3VjdTVkYmQ0dm5zOGQ0ZmVxdGJuaTA4NnRAaW1wb3J0LmNhbGVuZGFyLmdvb2dsZS5jb20&' +
      'color=%237986cb&color=%23f6bf26&color=%23d50000';
    
    return calendarUrl;
  }

  private showLoading(): void {
    this.loadingIndicator.style.display = 'flex';
    this.errorMessage.style.display = 'none';
    this.calendarIframe.style.display = 'none';
  }

  private hideLoading(): void {
    this.loadingIndicator.style.display = 'none';
  }

  private showCalendar(): void {
    this.calendarIframe.style.display = 'block';
    this.errorMessage.style.display = 'none';
  }

  private showError(message: string): void {
    this.errorMessage.style.display = 'block';
    this.errorMessage.querySelector('.widget-error-subtitle')!.textContent = message;
    this.loadingIndicator.style.display = 'none';
    this.calendarIframe.style.display = 'none';
  }

  private refreshCalendar(): void {
    if (this.calendarIframe.src) {
      this.showLoading();
      // Rebuild URL and reload
      const newUrl = this.buildCalendarUrl();
      this.calendarIframe.src = '';
      setTimeout(() => {
        this.calendarIframe.src = newUrl;
      }, 100);
    } else {
      this.loadCalendar();
    }
  }

  private openSettings(): void {
    window.electronAPI.window.openSettings();
  }

}

// Initialize widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new CalendarWidget();
});