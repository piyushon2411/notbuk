// Event listener for when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const darkModeToggle = document.getElementById('darkModeToggle');

  // Load saved notes and dark mode preference from local storage
  chrome.storage.local.get(['notes', 'darkMode'], (result) => {
    if (result.notes) {
      // Set the editor's content to the saved notes
      editor.value = result.notes;
    }
    if (result.darkMode) {
      // Enable dark mode if the preference is saved
      document.body.classList.add('dark-mode');
      editor.classList.add('dark-mode');
      darkModeToggle.checked = true;
    }
  });

  // Save notes to local storage whenever the editor content changes
  editor.addEventListener('input', () => {
    chrome.storage.local.set({ notes: editor.value });
  });

  // Toggle dark mode and save the preference to local storage
  darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode');
    editor.classList.toggle('dark-mode');
    chrome.storage.local.set({ darkMode: darkModeToggle.checked });
  });
});
