// Event listener for when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Create a context menu item
  chrome.contextMenus.create({
    id: 'saveText',
    title: 'Save selected text in Notbuk',
    contexts: ['selection'] // Only show the context menu when text is selected
  });
});

// Event listener for context menu item clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Check if the clicked menu item is 'saveText'
  if (info.menuItemId === 'saveText') {
    // Retrieve existing notes from local storage
    chrome.storage.local.get(['notes'], (result) => {
      // Append the selected text to existing notes or create new notes
      let newNote = result.notes ? result.notes + '\n' + info.selectionText : info.selectionText;
      // Save the updated notes back to local storage
      chrome.storage.local.set({ notes: newNote }, () => {
        // Query for all tabs with the URL 'chrome://newtab/'
        chrome.tabs.query({ url: "chrome://newtab/" }, (tabs) => {
          // Inject the content script to append text in each tab
          tabs.forEach((tab) => {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'] // Ensure the content script is injected
            }, () => {
              // Send a message to the content script to append the text
              chrome.tabs.sendMessage(tab.id, { action: 'appendText', text: info.selectionText });
            });
          });
        });
      });
    });
  }
});
