document.addEventListener('DOMContentLoaded', () => {
    console.log('Document loaded.');
    const editor = document.getElementById('editor');
    const darkModeToggle = document.getElementById('darkModeToggle');
  
    // Load saved notes and dark mode preference from local storage
    chrome.storage.local.get(['notes', 'darkMode'], (result) => {
      console.log('Loaded from storage:', result);
      if (result.notes) {
        editor.value = result.notes;
      }
      if (result.darkMode) {
        document.body.classList.add('dark-mode');
        editor.classList.add('dark-mode');
        darkModeToggle.checked = true;
      }
    });
  
    // Save notes to local storage
    editor.addEventListener('input', () => {
      console.log('Editor input detected, saving notes.');
      chrome.storage.local.set({ notes: editor.value });
    });
  
    // Toggle dark mode
    darkModeToggle.addEventListener('change', () => {
      console.log('Toggling dark mode.');
      document.body.classList.toggle('dark-mode');
      editor.classList.toggle('dark-mode');
      chrome.storage.local.set({ darkMode: darkModeToggle.checked });
    });
  });
  