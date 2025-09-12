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
  const checkboxBtn = document.getElementById('checkboxBtn'); // New Checkbox Button

  // Load dark mode preference from local storage
  chrome.storage.local.get(['darkMode'], (result) => {
    if (result.darkMode !== undefined) {
      document.body.classList.toggle('dark-mode', result.darkMode);
      editor.classList.toggle('dark-mode', result.darkMode);
      darkModeToggle.checked = result.darkMode;
    }
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

  // Update counts initially
  updateCounts();

  // Update counts on input
  editor.addEventListener('input', updateCounts);

  // Save content to local storage
  function saveContent() {
    const content = editor.innerHTML;
    chrome.storage.local.set({ noteContent: content });
  }

  document.addEventListener('click', (event) => {
    if (formattingMenu.style.display === 'flex' &&
        !formattingMenu.contains(event.target) && !menuButton.contains(event.target)) {
      formattingMenu.style.display = 'none';
    }
  });
  
  // Call saveContent whenever the content changes
  editor.addEventListener('input', saveContent);

  // Load content from local storage
  chrome.storage.local.get(['noteContent'], (result) => {
    if (result.noteContent !== undefined) {
      editor.innerHTML = result.noteContent;
      // Add event listeners to any existing checkboxes
      const checkboxes = editor.querySelectorAll('.checklist-item input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
        if (checkbox.checked) {
          checkbox.parentElement.classList.add('checked');
        }
      });
    }
  });

  // React to external updates (e.g., context menu append) without clobbering
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.noteContent) {
      const newVal = changes.noteContent.newValue || '';
      if (newVal !== editor.innerHTML) {
        editor.innerHTML = newVal;
        // Re-bind checkbox listeners after HTML replacement
        const checkboxes = editor.querySelectorAll('.checklist-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
          checkbox.addEventListener('change', handleCheckboxChange);
          if (checkbox.checked) {
            checkbox.parentElement.classList.add('checked');
          }
        });
        updateCounts();
      }
    }
  });

// Add functionality to format text as checkboxes
checkboxBtn.addEventListener('click', () => {
  // Get the current text selection from the window
  const selection = window.getSelection();
  // Check if there is at least one range in the selection
  if (selection.rangeCount > 0) {
    // Get the first range in the selection
    const range = selection.getRangeAt(0);
    
    // Create a document fragment to hold the new elements
    const fragment = document.createDocumentFragment();
    
    // Create a temporary div to hold the selected HTML content
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(range.cloneContents());
    
    // Iterate over the child nodes of the tempDiv
    tempDiv.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Split the text node content by newlines
        node.textContent.split('\n').forEach((textLine, index, array) => {
          if (textLine.trim()) {
            // Create a div for each checklist item
            const checklistItem = document.createElement('div');
            checklistItem.classList.add('checklist-item');
            // Set the inner HTML of the div to include a checkbox and the line text
            checklistItem.innerHTML = `<input type="checkbox"> ${textLine}`;
            // Append the checklist item to the fragment
            fragment.appendChild(checklistItem);
          }
          // Append a line break only if it's not the last item in the array
          if (index < array.length - 1) {
            fragment.appendChild(document.createElement('br'));
          }
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // For each element node, create a new checklist item
        const checklistItem = document.createElement('div');
        checklistItem.classList.add('checklist-item');
        // Clone the node and prepend a checkbox input
        checklistItem.innerHTML = `<input type="checkbox"> ${node.outerHTML}`;
        // Append the checklist item to the fragment
        fragment.appendChild(checklistItem);
      }
    });
    
    // Remove the contents of the selected range
    range.deleteContents();
    // Insert the fragment into the document at the range
    range.insertNode(fragment);
    
    // Normalize the selection to clear the previous selection range
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Add event listeners to the newly created checkboxes
    const checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', handleCheckboxChange);
    });
  }
}); 
  
  // Handle checkbox change to strike through text
  function handleCheckboxChange(event) {
    const checkbox = event.target;
    if (checkbox.checked) {
      checkbox.parentElement.classList.add('checked');
    } else {
      checkbox.parentElement.classList.remove('checked');
    }
  }

  // Handle paste event to clear formatting
  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
  });
});
