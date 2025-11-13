/**
 * Custom storage adapter for Supabase that uses cookies instead of localStorage
 * This allows session data to be stored in cookies for better server-side access
 * 
 * Supabase stores session data with keys like: sb-<project-ref>-auth-token
 * This adapter implements the Storage interface that Supabase expects
 */

export class CookieStorage {
  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        return decodeURIComponent(c.substring(nameEQ.length, c.length));
      }
    }
    return null;
  }

  private setCookie(name: string, value: string, days: number = 7): void {
    if (typeof document === 'undefined') return;
    
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    
    // Set cookie with SameSite=Lax for CSRF protection
    // Secure flag should be set in production (HTTPS only)
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    // Use encodeURIComponent to handle special characters in JSON values
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${secure}`;
  }

  private removeCookie(name: string): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }

  getItem(key: string): string | null {
    const value = this.getCookie(key);
    return value;
  }

  setItem(key: string, value: string): void {
    // Store the value in a cookie
    // Supabase session data is JSON, so we store it as-is (will be encoded)
    this.setCookie(key, value);
  }

  removeItem(key: string): void {
    this.removeCookie(key);
  }

  // Additional methods for Storage interface compatibility
  get length(): number {
    if (typeof document === 'undefined') return 0;
    return document.cookie.split(';').filter(c => c.trim().length > 0).length;
  }

  key(index: number): string | null {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie.split(';').map(c => c.trim().split('=')[0]);
    return cookies[index] || null;
  }

  clear(): void {
    if (typeof document === 'undefined') return;
    // Get all cookies and remove them
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      this.removeCookie(name);
    }
  }
}

