import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { BrowserWindow, shell } from 'electron';
import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import { AuthStatus, AuthToken } from '../shared/types';

// Simple encryption using Node.js crypto module
// Note: For production use, consider implementing proper Windows Credential Manager integration

export class AuthManager {
  private oauth2Client: OAuth2Client;
  private readonly clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
  private readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
  private readonly redirectUri = 'http://127.0.0.1:8080/callback';
  private readonly scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  
  private currentAuthWindow: BrowserWindow | null = null;
  private authServer: http.Server | null = null;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  public async login(): Promise<AuthStatus> {
    try {
      // Check if already authenticated
      const existingAuth = await this.getAuthStatus();
      if (existingAuth.isAuthenticated) {
        return existingAuth;
      }

      // Start OAuth flow
      const authUrl = await this.generateAuthUrl();
      const authCode = await this.getAuthorizationCode(authUrl);
      const tokens = await this.exchangeCodeForTokens(authCode);
      
      console.log('Tokens received:', { 
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        tokenType: tokens.token_type,
        expiryDate: tokens.expiry_date
      });
      
      if (!tokens.access_token) {
        throw new Error('No access token received from OAuth exchange');
      }
      
       // Get user info
       const userInfo = await this.getUserInfo(tokens.access_token);
       console.log('Login process: getUserInfo successful, proceeding to store tokens');
       
       // Store tokens securely
       await this.storeTokens({
         account: userInfo.email,
         metadata: {
           email: userInfo.email,
           name: userInfo.name,
           picture: userInfo.picture
         },
         tokenReference: await this.encryptAndStoreTokens(tokens)
       });

       console.log('Login process: tokens stored successfully, returning success');
       return {
         isAuthenticated: true,
         user: {
           email: userInfo.email,
           name: userInfo.name,
           picture: userInfo.picture
         }
       };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async logout(): Promise<boolean> {
    try {
      // Revoke tokens
      const tokens = await this.getStoredTokens();
      if (tokens) {
        try {
          await this.oauth2Client.revokeToken(tokens.refresh_token || tokens.access_token!);
        } catch (error) {
          console.warn('Failed to revoke token:', error);
        }
      }

      // Clear stored tokens
      await this.clearStoredTokens();
      
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      return false;
    }
  }

  public async getAuthStatus(): Promise<AuthStatus> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens) {
        return { isAuthenticated: false };
      }

      // Set credentials and check if valid
      this.oauth2Client.setCredentials(tokens);
      
      // Try to refresh token if needed
      if (this.isTokenExpired(tokens)) {
        const refreshedTokens = await this.refreshAccessToken();
        if (!refreshedTokens) {
          return { isAuthenticated: false, error: 'Token refresh failed' };
        }
      }

      // Get user info
      const userInfo = await this.getUserInfo(tokens.access_token!);
      
      return {
        isAuthenticated: true,
        user: {
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture
        }
      };
    } catch (error) {
      console.error('Auth status check failed:', error);
      return { 
        isAuthenticated: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  public async getValidAccessToken(): Promise<string | null> {
    try {
      console.log('Getting stored tokens...');
      const tokens = await this.getStoredTokens();
      if (!tokens) {
        console.log('No stored tokens found');
        return null;
      }

      console.log('Setting credentials on OAuth client...');
      this.oauth2Client.setCredentials(tokens);

      if (this.isTokenExpired(tokens)) {
        console.log('Token expired, refreshing...');
        const refreshedTokens = await this.refreshAccessToken();
        if (!refreshedTokens) {
          console.log('Token refresh failed');
          return null;
        }
        console.log('Token refreshed successfully');
        return refreshedTokens.access_token || null;
      }

      console.log('Using existing valid token');
      return tokens.access_token || null;
    } catch (error) {
      console.error('Failed to get valid access token:', error);
      return null;
    }
  }

  private async generateAuthUrl(): Promise<string> {
    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Store code verifier temporarily (in memory for this session)
    (global as any).__pkce_verifier = codeVerifier;

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256' as any
    });

    return authUrl;
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  private async getAuthorizationCode(authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create HTTP server to handle callback
      this.authServer = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        
        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>You can close this window.</p>');
            reject(new Error(error));
          } else if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>You can close this window and return to the app.</p>');
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>No authorization code received.</p>');
            reject(new Error('No authorization code received'));
          }

          // Close server and window
          this.authServer?.close();
          this.currentAuthWindow?.close();
        }
      });

      this.authServer.listen(8080, '127.0.0.1', () => {
        // Open auth URL in browser
        shell.openExternal(authUrl);
      });

      // Set timeout
      setTimeout(() => {
        this.authServer?.close();
        this.currentAuthWindow?.close();
        reject(new Error('Authentication timeout'));
      }, 300000); // 5 minutes timeout
    });
  }

  private async exchangeCodeForTokens(code: string): Promise<any> {
    const codeVerifier = (global as any).__pkce_verifier;
    delete (global as any).__pkce_verifier;

    const response = await this.oauth2Client.getToken({
      code,
      codeVerifier: codeVerifier
    });
    const tokens = response.tokens;

    return tokens;
  }

  private async getUserInfo(accessToken: string): Promise<any> {
    console.log('Getting user info with access token:', accessToken.substring(0, 20) + '...');
    
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('getUserInfo response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('getUserInfo failed:', response.status, response.statusText, errorText);
      throw new Error(`Failed to get user info: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const userInfo = await response.json();
    console.log('User info received:', { email: (userInfo as any).email, name: (userInfo as any).name });
    return userInfo;
  }

  private async refreshAccessToken(): Promise<any | null> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update stored tokens
      const authToken = await this.getStoredAuthToken();
      if (authToken) {
        authToken.tokenReference = await this.encryptAndStoreTokens(credentials);
        await this.storeTokens(authToken);
      }

      return credentials;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }

  private isTokenExpired(tokens: any): boolean {
    if (!tokens.expiry_date) return false;
    
    // Check if token expires in the next 5 minutes
    const expiryTime = new Date(tokens.expiry_date).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (expiryTime - now) < fiveMinutes;
  }

  private async encryptAndStoreTokens(tokens: any): Promise<string> {
    const tokenString = JSON.stringify(tokens);
    
    try {
      // Use AES encryption with a machine-specific key
      const key = this.getMachineSpecificKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(tokenString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tokenId = crypto.randomUUID();
      const encryptedData = {
        iv: iv.toString('hex'),
        data: encrypted
      };
      
      await this.storeSecureData(tokenId, Buffer.from(JSON.stringify(encryptedData)));
      return tokenId;
    } catch (error) {
      console.warn('Encryption failed, using base64 fallback:', error);
      // Fallback: Base64 encoding (not secure, for development only)
      return Buffer.from(tokenString).toString('base64');
    }
  }

  private async decryptTokens(tokenReference: string): Promise<any | null> {
    try {
      if (tokenReference.length === 36) { // UUID format - encrypted data
        // Retrieve from secure storage
        const encryptedBuffer = await this.getSecureData(tokenReference);
        if (encryptedBuffer) {
          const encryptedData = JSON.parse(encryptedBuffer.toString('utf8'));
          const key = this.getMachineSpecificKey();
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(encryptedData.iv, 'hex'));
          
          let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          return JSON.parse(decrypted);
        }
      } else {
        // Fallback: Base64 decoding
        const tokenString = Buffer.from(tokenReference, 'base64').toString('utf8');
        return JSON.parse(tokenString);
      }
    } catch (error) {
      console.warn('Token decryption failed, clearing invalid tokens:', error);
      // Clear invalid stored tokens and return null to trigger fresh auth
      await this.clearStoredTokens();
    }
    
    return null;
  }

  private async storeSecureData(key: string, data: Buffer): Promise<void> {
    // In a real implementation, you would use Windows Credential Manager API
    // For now, we'll use a simple file-based approach with encryption
    const fs = require('fs').promises;
    const path = require('path');
    const { app } = require('electron');
    
    const secureDir = path.join(app.getPath('userData'), 'secure');
    await fs.mkdir(secureDir, { recursive: true });
    
    const filePath = path.join(secureDir, `${key}.dat`);
    await fs.writeFile(filePath, data);
  }

  private async getSecureData(key: string): Promise<Buffer | null> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const { app } = require('electron');
      
      const filePath = path.join(app.getPath('userData'), 'secure', `${key}.dat`);
      return await fs.readFile(filePath);
    } catch (error) {
      return null;
    }
  }

  private async storeTokens(authToken: AuthToken): Promise<void> {
    // Store in database or secure storage
    // For now, we'll use a simple JSON file approach
    const fs = require('fs').promises;
    const path = require('path');
    const { app } = require('electron');
    
    const authFile = path.join(app.getPath('userData'), 'auth.json');
    await fs.writeFile(authFile, JSON.stringify(authToken, null, 2));
  }

  private async getStoredAuthToken(): Promise<AuthToken | null> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const { app } = require('electron');
      
      const authFile = path.join(app.getPath('userData'), 'auth.json');
      const data = await fs.readFile(authFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private async getStoredTokens(): Promise<any | null> {
    const authToken = await this.getStoredAuthToken();
    if (!authToken) return null;
    
    return await this.decryptTokens(authToken.tokenReference);
  }

  private async clearStoredTokens(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const { app } = require('electron');
      
      const authFile = path.join(app.getPath('userData'), 'auth.json');
      try {
        await fs.unlink(authFile);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn('Failed to clear auth file:', error);
        }
      }
      
      // Also clear secure storage directory
      const secureDir = path.join(app.getPath('userData'), 'secure');
      try {
        const files = await fs.readdir(secureDir);
        for (const file of files) {
          try {
            await fs.unlink(path.join(secureDir, file));
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              console.warn(`Failed to clear secure file ${file}:`, error);
            }
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn('Failed to clear secure directory:', error);
        }
      }
    } catch (error) {
      console.warn('Failed to clear stored tokens:', error);
    }
  }

  private getMachineSpecificKey(): string {
    const os = require('os');
    
    // Create a machine-specific key using system information
    const machineInfo = [
      os.hostname(),
      os.platform(),
      os.arch(),
      process.env.USERNAME || process.env.USER || 'unknown'
    ].join('|');
    
    // Hash the machine info to create a consistent key
    return crypto.createHash('sha256').update(machineInfo).digest('hex').substring(0, 32);
  }
}
