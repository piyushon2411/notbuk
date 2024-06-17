# NotBuk

**NotBuk** is a simple note editor Chrome extension that allows users to take notes directly in a new tab. The notes are saved automatically and persist across browser sessions, making it a convenient tool for quick note-taking.

## Features

- **Rich Text Editor**: Supports bold, italic, underline, and different font sizes.
- **Dark Mode**: Easily toggle between light and dark modes.
- **Word and Character Count**: Displays real-time word and character count.
- **Persistent Storage**: Notes are saved and retrieved from Chrome's local storage, ensuring they are available even after closing and reopening the browser.
- **Minimalistic Design**: Clean and simple interface with a focus on usability.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" at the top right.
4. Click "Load unpacked" and select the directory where you cloned/downloaded this repository.

## Usage

- Open a new tab to start taking notes.
- Use the formatting toolbar to style your text.
- Toggle dark mode using the switch in the toolbar.
- Your notes are automatically saved and will reappear when you open a new tab.

## Project Structure

The project consists of the following key files:

- `manifest.json`: Defines the extension and its permissions.
- `index.html`: The main HTML file that is loaded in a new tab.
- `index.js`: Handles the logic for note-taking, formatting, and dark mode toggle.
- `style.css`: Defines the styling for the editor, including dark mode styles.
- `images/favicon.ico`: The favicon for the extension.

### `manifest.json`

Defines the extension and its permissions. Key properties include `manifest_version`, `name`, `version`, `description`, `chrome_url_overrides`, and `permissions`.

### `index.html`

The main HTML file that provides the structure for the new tab page. It includes links to stylesheets and scripts.

### `index.js`

Handles the functionality of the extension, including:
- Loading and saving notes to Chrome's local storage.
- Formatting text (bold, italic, underline, font size).
- Toggling dark mode.
- Counting words and characters.

### `style.css`

Contains the styling for the new tab page, including:
- General body styles.
- Dark mode styles.
- Editor styles.
- Formatting menu styles.

## Adding the Favicon

To include the favicon in your extension:
1. Ensure the `favicon.ico` file is located in the `images` directory.
2. Add the following line to the `<head>` section of your `index.html`:

   ```html
   <link rel="icon" href="images/favicon.ico" sizes="any">

## Contributing
Feel free to submit issues or pull requests if you find any bugs or have suggestions for improvements.

