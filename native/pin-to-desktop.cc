#include <nan.h>
#include <windows.h>
#include <iostream>
#include <vector>

using namespace Nan;
using namespace v8;

// Global variables to store window handles
HWND g_progmanWindow = NULL;
HWND g_workerWWindow = NULL;
HWND g_originalParent = NULL;
HWND g_pinnedWindow = NULL;

// Structure to pass data to EnumWindows callback
struct EnumWindowsData {
    std::vector<HWND> windows;
    DWORD processId;
};

// Callback function for EnumWindows to find WorkerW windows
BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    EnumWindowsData* data = reinterpret_cast<EnumWindowsData*>(lParam);
    
    DWORD processId;
    GetWindowThreadProcessId(hwnd, &processId);
    
    if (processId == data->processId) {
        wchar_t className[256];
        if (GetClassNameW(hwnd, className, sizeof(className) / sizeof(wchar_t))) {
            if (wcscmp(className, L"WorkerW") == 0) {
                data->windows.push_back(hwnd);
            }
        }
    }
    
    return TRUE;
}

// Find the WorkerW window that doesn't contain SHELLDLL_DefView
HWND FindWorkerW() {
    // Find Progman window
    g_progmanWindow = FindWindowW(L"Progman", NULL);
    if (!g_progmanWindow) {
        return NULL;
    }
    
    // Send message to Progman to spawn WorkerW
    SendMessageTimeoutW(g_progmanWindow, 0x052C, 0, 0, SMTO_NORMAL, 1000, NULL);
    
    // Get Progman's process ID
    DWORD progmanProcessId;
    GetWindowThreadProcessId(g_progmanWindow, &progmanProcessId);
    
    // Find all WorkerW windows in the same process
    EnumWindowsData data;
    data.processId = progmanProcessId;
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&data));
    
    // Find the WorkerW that doesn't contain SHELLDLL_DefView
    for (HWND workerW : data.windows) {
        HWND shelldllDefView = FindWindowExW(workerW, NULL, L"SHELLDLL_DefView", NULL);
        if (!shelldllDefView) {
            return workerW;
        }
    }
    
    return NULL;
}

// Pin window to desktop
NAN_METHOD(PinToDesktop) {
    if (info.Length() < 1) {
        Nan::ThrowTypeError("Wrong number of arguments. Expected: hwnd");
        return;
    }
    
    if (!info[0]->IsNumber()) {
        Nan::ThrowTypeError("First argument must be a number (window handle)");
        return;
    }
    
    // Get the window handle from the argument
    int64_t hwndValue = Nan::To<int64_t>(info[0]).FromJust();
    HWND hwnd = reinterpret_cast<HWND>(hwndValue);
    
    if (!IsWindow(hwnd)) {
        Nan::ThrowError("Invalid window handle");
        return;
    }
    
    // Find the WorkerW window
    HWND workerW = FindWorkerW();
    if (!workerW) {
        info.GetReturnValue().Set(Nan::False());
        return;
    }
    
    // Store original parent and the window we're pinning
    g_originalParent = GetParent(hwnd);
    g_pinnedWindow = hwnd;
    g_workerWWindow = workerW;
    
    // Set the window's parent to WorkerW
    HWND result = SetParent(hwnd, workerW);
    
    if (result != NULL || GetLastError() == 0) {
        // Ensure the window is positioned correctly
        SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, 
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        
        info.GetReturnValue().Set(Nan::True());
    } else {
        info.GetReturnValue().Set(Nan::False());
    }
}

// Unpin window from desktop
NAN_METHOD(UnpinFromDesktop) {
    if (info.Length() < 1) {
        Nan::ThrowTypeError("Wrong number of arguments. Expected: hwnd");
        return;
    }
    
    if (!info[0]->IsNumber()) {
        Nan::ThrowTypeError("First argument must be a number (window handle)");
        return;
    }
    
    // Get the window handle from the argument
    int64_t hwndValue = Nan::To<int64_t>(info[0]).FromJust();
    HWND hwnd = reinterpret_cast<HWND>(hwndValue);
    
    if (!IsWindow(hwnd)) {
        Nan::ThrowError("Invalid window handle");
        return;
    }
    
    // Restore original parent (or NULL for top-level)
    HWND result = SetParent(hwnd, g_originalParent);
    
    if (result != NULL || GetLastError() == 0) {
        // Reset window positioning
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, 
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        
        // Clear stored handles
        g_originalParent = NULL;
        g_pinnedWindow = NULL;
        g_workerWWindow = NULL;
        
        info.GetReturnValue().Set(Nan::True());
    } else {
        info.GetReturnValue().Set(Nan::False());
    }
}

// Check if a window is currently pinned to desktop
NAN_METHOD(IsPinnedToDesktop) {
    if (info.Length() < 1) {
        Nan::ThrowTypeError("Wrong number of arguments. Expected: hwnd");
        return;
    }
    
    if (!info[0]->IsNumber()) {
        Nan::ThrowTypeError("First argument must be a number (window handle)");
        return;
    }
    
    int64_t hwndValue = Nan::To<int64_t>(info[0]).FromJust();
    HWND hwnd = reinterpret_cast<HWND>(hwndValue);
    
    if (!IsWindow(hwnd)) {
        info.GetReturnValue().Set(Nan::False());
        return;
    }
    
    // Check if the window's parent is a WorkerW window
    HWND parent = GetParent(hwnd);
    if (parent) {
        wchar_t className[256];
        if (GetClassNameW(parent, className, sizeof(className) / sizeof(wchar_t))) {
            if (wcscmp(className, L"WorkerW") == 0) {
                info.GetReturnValue().Set(Nan::True());
                return;
            }
        }
    }
    
    info.GetReturnValue().Set(Nan::False());
}

// Get desktop WorkerW window handle
NAN_METHOD(GetDesktopWorkerW) {
    HWND workerW = FindWorkerW();
    if (workerW) {
        int64_t hwndValue = reinterpret_cast<int64_t>(workerW);
        info.GetReturnValue().Set(Nan::New<Number>(static_cast<double>(hwndValue)));
    } else {
        info.GetReturnValue().Set(Nan::Null());
    }
}

// Handle Windows Explorer restarts
void HandleExplorerRestart() {
    if (g_pinnedWindow && IsWindow(g_pinnedWindow)) {
        // Find the new WorkerW window after Explorer restart
        HWND newWorkerW = FindWorkerW();
        if (newWorkerW) {
            // Re-pin the window to the new WorkerW
            SetParent(g_pinnedWindow, newWorkerW);
            SetWindowPos(g_pinnedWindow, HWND_BOTTOM, 0, 0, 0, 0, 
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            g_workerWWindow = newWorkerW;
        }
    }
}

// Window procedure to handle Windows messages
LRESULT CALLBACK WindowProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    static UINT WM_TASKBARCREATED = RegisterWindowMessageW(L"TaskbarCreated");
    
    if (uMsg == WM_TASKBARCREATED) {
        HandleExplorerRestart();
    }
    
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

// Initialize message handling
NAN_METHOD(InitializeMessageHandling) {
    // Register for taskbar created message
    static UINT WM_TASKBARCREATED = RegisterWindowMessageW(L"TaskbarCreated");
    
    // Create a hidden window to receive messages
    WNDCLASSW wc = {};
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = L"ElectronCallyHelper";
    
    if (RegisterClassW(&wc)) {
        HWND helperWindow = CreateWindowExW(
            0,
            L"ElectronCallyHelper",
            L"Helper",
            0,
            0, 0, 0, 0,
            HWND_MESSAGE,
            NULL,
            GetModuleHandle(NULL),
            NULL
        );
        
        if (helperWindow) {
            info.GetReturnValue().Set(Nan::True());
        } else {
            info.GetReturnValue().Set(Nan::False());
        }
    } else {
        info.GetReturnValue().Set(Nan::False());
    }
}

// Module initialization
NAN_MODULE_INIT(InitAll) {
    Nan::Set(target, Nan::New("pinToDesktop").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(PinToDesktop)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("unpinFromDesktop").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(UnpinFromDesktop)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("isPinnedToDesktop").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(IsPinnedToDesktop)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("getDesktopWorkerW").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(GetDesktopWorkerW)).ToLocalChecked());
    
    Nan::Set(target, Nan::New("initializeMessageHandling").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(InitializeMessageHandling)).ToLocalChecked());
}

NODE_MODULE(pin_to_desktop, InitAll)
