# Note Editor Chrome Extension

## Project Overview
This project is a Chrome extension that provides a simple and intuitive note editor directly in your browser's new tab. The extension allows users to take notes easily and includes features like dark mode, auto-save, and the ability to sync notes to Google Docs. Additionally, users can save selected text from any webpage directly to their notes via a right-click context menu.

## Features

- **New Tab Note Editor**: Opens a note editor every time you open a new tab.
- **Dark Mode**: Option to switch between light and dark themes.
- **Auto Save**: Automatically saves notes in the browser's storage.
- **Multiple Notes**: Supports storing multiple notes up to the browser's storage limit.
- **Offline Storage**: Stores notes locally in the browser, accessible even without an internet connection.
- **Google Docs Sync**: Sync notes to a new Google Doc.
- **Context Menu**: Save selected text from any webpage directly to the notes.

## manifest.json Explanation

### Overview
This file tells Chrome about your extension, including its name, version, description, permissions, and the files it uses.

### Fields

- **`manifest_version`**: Specifies the version of the manifest file format being used. Version 3 is the latest and includes updates and security improvements over previous versions.

- **`name`**: Defines the name of the Chrome extension. This name is displayed in the Chrome Web Store and the extensions management page.

- **`version`**: Indicates the current version of the extension. This is used for version control and helps users know if they have the latest version.

- **`description`**: Provides a short description of what the extension does. This description appears in the Chrome Web Store and the extensions management page.

- **`chrome_url_overrides`**: Overrides the default new tab page with a custom HTML file (`index.html`). This means whenever a new tab is opened, the specified HTML file will be loaded instead of the default new tab page.

- **`permissions`**: Lists the permissions the extension requires to function properly:
  - **`storage`**: Allows the extension to use the Chrome Storage API for saving and retrieving data.
  - **`contextMenus`**: Grants access to the context menu (right-click menu), enabling the extension to add custom menu items.
  - **`activeTab`**: Gives temporary access to the currently active tab when the extension is invoked.
  - **`identity`**: Allows the extension to use the Chrome Identity API for managing user identity and authentication.

- **`background`**: Specifies the background script for the extension. This script runs behind the scenes and handles tasks like events and state management. Here, `background.js` is the script that does these jobs.
  - **Events**: Actions or occurrences that happen in the browser that your extension can respond to (e.g., clicking a button, loading a page, or changing storage data).
  - **State Management**: Keeping track of information that your extension needs to work correctly (e.g., remembering notes or dark mode status).

- **`action`**: Defines the default popup for the extension's action button. When the user clicks on the extension's icon in the Chrome toolbar, the `popup.html` file is displayed.

## Getting Started

### Prerequisites
- **Chrome Browser**: Ensure you have the latest version of Chrome installed.
- **Text Editor**: Use a code editor like Visual Studio Code or Sublime Text.

### Installation
1. **Clone the Repository**:
   ```sh
   git clone https://github.com/your-username/note-editor-extension.git
   cd note-editor-extension

