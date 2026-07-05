const jsdom = require('jsdom');
const { JSDOM } = jsdom;

async function runClientTest() {
  console.log("Starting JSDOM Client Create Test...");
  try {
    const dom = await JSDOM.fromURL("http://localhost:5000/clients.html", {
      resources: "usable",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse(window) {
        let store = {
          userRole: 'admin',
          username: 'soharadmin'
        };
        window.localStorage = {
          getItem(key) {
            return store[key] || null;
          },
          setItem(key, value) {
            store[key] = value ? value.toString() : '';
          },
          removeItem(key) {
            delete store[key];
          },
          clear() {
            store = {};
          }
        };
      }
    });

    const { window } = dom;
    const { document } = window;

    // Wait a brief moment for DOM scripts and fetch calls to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Page loaded. Existing clients count in DOM table:", document.querySelectorAll('#clients-table tbody tr').length);

    // Trigger Client Create Modal
    console.log("Opening Add Client Modal...");
    window.showAddClientModal();

    // Fill form fields
    document.getElementById('nc-name').value = "E2E Test Client JSDOM 99";
    document.getElementById('nc-salutation').value = "Dr.";
    document.getElementById('nc-contact').value = "Dr. JSDOM Tester";
    document.getElementById('nc-city').value = "Salalah";
    document.getElementById('nc-phone1').value = "98761234";
    document.getElementById('nc-cell1').value = "99998888";
    document.getElementById('nc-email').value = "jsdom@test.com";
    document.getElementById('nc-credit').value = "250";
    document.getElementById('nc-priceband').value = "Favorite Clients";

    console.log("Submitting Add Client Form...");
    // Trigger submit
    const form = document.getElementById('add-client-form');
    
    // Simulate form submit event
    const submitEvent = window.document.createEvent("Event");
    submitEvent.initEvent("submit", true, true);
    form.dispatchEvent(submitEvent);

    // Wait for the API call and reloading of clients list
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Client list updated. Clients count in DOM table:", document.querySelectorAll('#clients-table tbody tr').length);

    // Search client in search box
    const searchInput = document.getElementById('main-quick-search');
    searchInput.value = "E2E Test Client JSDOM 99";
    
    // Trigger search function
    window.searchClients('main-quick-search');

    await new Promise(resolve => setTimeout(resolve, 1000));

    const resultsRows = document.querySelectorAll('#quick-search-results-body tr');
    console.log("Quick Search rows found:", resultsRows.length);
    if (resultsRows.length > 0) {
      console.log("Found client in search results:", resultsRows[0].innerHTML);
      console.log("SUCCESS: Client Create Test passed!");
    } else {
      console.error("FAIL: Client not found in search results.");
    }

    // Print summary
    window.close();
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

runClientTest();
