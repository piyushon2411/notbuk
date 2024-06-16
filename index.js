document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  const menuButton = document.querySelector('.menu-button');
  const formattingMenu = document.getElementById('formattingMenu');
  const wordCount = document.getElementById('wordCount');
  const charCount = document.getElementById('charCount');

  // Load saved notes and dark mode preference from local storage
  chrome.storage.local.get(['notes', 'darkMode'], (result) => {
    if (result.notes) {
      editor.innerHTML = result.notes;
      updateCounts();
    }
    if (result.darkMode !== undefined) {
      document.body.classList.toggle('dark-mode', result.darkMode);
      editor.classList.toggle('dark-mode', result.darkMode);
      darkModeToggle.checked = result.darkMode;
    }
  });

  // Save notes to local storage whenever the editor content changes
  editor.addEventListener('input', () => {
    chrome.storage.local.set({ notes: editor.innerHTML });
    updateCounts();
  });

  // Toggle dark mode and save the preference to local storage
  darkModeToggle.addEventListener('change', () => {
    const isDarkMode = darkModeToggle.checked;
    document.body.classList.toggle('dark-mode', isDarkMode);
    editor.classList.toggle('dark-mode', isDarkMode);
    chrome.storage.local.set({ darkMode: isDarkMode });
  });

  // Show/hide the formatting menu
  menuButton.addEventListener('click', () => {
    formattingMenu.style.display = formattingMenu.style.display === 'flex' ? 'none' : 'flex';
  });

  // Function to execute formatting commands
  function formatText(command, value = null) {
    document.execCommand(command, false, value);
    chrome.storage.local.set({ notes: editor.innerHTML });
    updateCounts();
  }

  // Add event listeners to format buttons
  boldBtn.addEventListener('click', () => formatText('bold'));
  italicBtn.addEventListener('click', () => formatText('italic'));
  underlineBtn.addEventListener('click', () => formatText('underline'));
  fontSizeSelect.addEventListener('change', () => formatText('fontSize', fontSizeSelect.value));

  // Function to update word and character counts
  function updateCounts() {
    const text = editor.innerText.trim();
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    const characters = text.length;
    wordCount.textContent = `Words: ${words}`;
    charCount.textContent = `Characters: ${characters}`;
  }
});
