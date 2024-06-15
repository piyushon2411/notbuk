document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  const menuButton = document.querySelector('.menu-button');
  const formattingMenu = document.getElementById('formattingMenu');

  // Load saved notes and dark mode preference from local storage
  chrome.storage.local.get(['notes', 'darkMode'], (result) => {
    if (result.notes) {
      editor.innerHTML = result.notes;
    }
    if (result.darkMode) {
      document.body.classList.add('dark-mode');
      editor.classList.add('dark-mode');
      darkModeToggle.checked = true;
    }
  });

  // Save notes to local storage whenever the editor content changes
  editor.addEventListener('input', () => {
    chrome.storage.local.set({ notes: editor.innerHTML });
  });

  // Toggle dark mode and save the preference to local storage
  darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode');
    editor.classList.toggle('dark-mode');
    chrome.storage.local.set({ darkMode: darkModeToggle.checked });
  });

  // Show/hide the formatting menu
  menuButton.addEventListener('click', () => {
    formattingMenu.style.display = formattingMenu.style.display === 'flex' ? 'none' : 'flex';
  });

  // Function to execute formatting commands
  function formatText(command, value = null) {
    document.execCommand(command, false, value);
    chrome.storage.local.set({ notes: editor.innerHTML });
  }

  // Add event listeners to format buttons
  boldBtn.addEventListener('click', () => formatText('bold'));
  italicBtn.addEventListener('click', () => formatText('italic'));
  underlineBtn.addEventListener('click', () => formatText('underline'));
  fontSizeSelect.addEventListener('change', () => formatText('fontSize', fontSizeSelect.value));
});
