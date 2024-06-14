chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed and context menu created.');
    chrome.contextMenus.create({
      id: 'saveText',
      title: 'Save selected text in Notbuk',
      contexts: ['selection']
    });
  });
  
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    console.log('Context menu clicked.');
    if (info.menuItemId === 'saveText') {
      console.log('Saving selected text:', info.selectionText);
      chrome.storage.local.get(['notes'], (result) => {
        let newNote = result.notes ? result.notes + '\n' + info.selectionText : info.selectionText;
        console.log('New note content:', newNote);
        chrome.storage.local.set({ notes: newNote }, () => {
          console.log('Notes saved to local storage.');
          chrome.tabs.query({ url: "chrome://newtab/" }, (tabs) => {
            tabs.forEach((tab) => {
              console.log('Injecting content script into tab:', tab.id);
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: appendText,
                args: [info.selectionText]
              }).then(() => {
                console.log('Content script injected, text appended.');
              }).catch(err => console.error('Failed to inject script:', err));
            });
          });
        });
      });
    }
  });
  
  function appendText(selectedText) {
    let editor = document.getElementById('editor');
    if (editor) {
      console.log('Appending text to editor:', selectedText);
      editor.value += '\n' + selectedText;
      chrome.storage.local.set({ notes: editor.value });
    } else {
      console.error('Editor not found.');
    }
  }
  