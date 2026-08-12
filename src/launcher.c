#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

static void die(const char *msg) {
  MessageBoxA(NULL, msg, "Browser Console", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}

static int file_exists(const char *path) {
  DWORD a = GetFileAttributesA(path);
  return (a != INVALID_FILE_ATTRIBUTES) && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

int main(void) {
  char exePath[MAX_PATH];
  char root[MAX_PATH];
  char nodePath[MAX_PATH];
  char appPath[MAX_PATH];
  char shellPath[MAX_PATH];
  char nodeModules[MAX_PATH];
  char cmdLine[MAX_PATH * 3];
  char *slash;
  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  DWORD exitCode = 1;

  if (!GetModuleFileNameA(NULL, exePath, MAX_PATH)) {
    die("GetModuleFileName failed");
  }

  strncpy(root, exePath, MAX_PATH - 1);
  root[MAX_PATH - 1] = 0;
  slash = strrchr(root, '\\');
  if (!slash) slash = strrchr(root, '/');
  if (!slash) die("Invalid executable path");
  *slash = 0;

  if (!SetCurrentDirectoryA(root)) {
    die("Failed to set working directory to package root");
  }

  snprintf(nodePath, sizeof(nodePath), "%s\\runtime\\node.exe", root);
  snprintf(appPath, sizeof(appPath), "%s\\app\\app.cjs", root);
  snprintf(shellPath, sizeof(shellPath), "%s\\shell.json", root);
  snprintf(nodeModules, sizeof(nodeModules), "%s\\app\\node_modules", root);

  if (!file_exists(nodePath)) die("runtime\\node.exe not found.\nKeep the folder structure intact.");
  if (!file_exists(appPath)) die("app\\app.cjs not found.\nKeep the folder structure intact.");
  if (!file_exists(shellPath)) die("shell.json not found.\nPlace shell.json next to browser-console.exe");

  SetEnvironmentVariableA("NODE_PATH", nodeModules);

  snprintf(cmdLine, sizeof(cmdLine), "\"%s\" \"%s\"", nodePath, appPath);

  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));

  printf("Browser Console\n");
  printf("  root: %s\n", root);
  printf("  node: %s\n", nodePath);
  printf("  app : %s\n", appPath);
  fflush(stdout);

  if (!CreateProcessA(
        nodePath,
        cmdLine,
        NULL, NULL,
        FALSE,
        0,
        NULL,
        root,
        &si, &pi)) {
    char buf[512];
    snprintf(buf, sizeof(buf), "Failed to start node.exe (error %lu)", GetLastError());
    die(buf);
  }

  WaitForSingleObject(pi.hProcess, INFINITE);
  GetExitCodeProcess(pi.hProcess, &exitCode);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);

  if (exitCode != 0) {
    fprintf(stderr, "Browser Console exited with code %lu\n", exitCode);
  }

  return (int)exitCode;
}
