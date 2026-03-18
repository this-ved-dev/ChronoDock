const addon = require('./build/Release/pin-to-desktop.node');

module.exports = {
  /**
   * Pin an Electron window to the Windows desktop behind desktop icons
   * @param {number} hwnd - Window handle (HWND) as a number
   * @returns {boolean} - True if successful, false otherwise
   */
  pinToDesktop: addon.pinToDesktop,

  /**
   * Unpin a window from the desktop and restore it to normal window behavior
   * @param {number} hwnd - Window handle (HWND) as a number
   * @returns {boolean} - True if successful, false otherwise
   */
  unpinFromDesktop: addon.unpinFromDesktop,

  /**
   * Check if a window is currently pinned to the desktop
   * @param {number} hwnd - Window handle (HWND) as a number
   * @returns {boolean} - True if pinned, false otherwise
   */
  isPinnedToDesktop: addon.isPinnedToDesktop,

  /**
   * Get the desktop WorkerW window handle
   * @returns {number|null} - WorkerW window handle or null if not found
   */
  getDesktopWorkerW: addon.getDesktopWorkerW,

  /**
   * Initialize message handling for Explorer restart detection
   * @returns {boolean} - True if successful, false otherwise
   */
  initializeMessageHandling: addon.initializeMessageHandling
};
