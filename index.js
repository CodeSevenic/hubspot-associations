const xlsx = require('xlsx');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const dotenv = require('dotenv');

dotenv.config();

const ACCESS_TOKEN = process.env.API_KEY;

console.log('API_KEY: ', ACCESS_TOKEN);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Fetch contacts function with rate limit and error handling
const fetchContacts = async (accessToken) => {
  console.log('=== Retrieving all contacts from HubSpot using the access token ===');

  let after = '';

  let allContacts = [];

  let keepGoing = true;

  // Keep making requests until all contacts are retrieved
  while (keepGoing) {
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      let url = 'https://api.hubapi.com/crm/v3/objects/contacts?limit=100';

      // If there is an 'after' value, append it to the URL
      if (after) {
        url += `&after=${after}`;
      }

      const { data } = await axios.get(url, { headers });

      // Add the retrieved contacts to the 'allContacts' array
      allContacts = [...allContacts, ...data.results];

      if (data.paging) {
        after = data.paging.next.after;
      } else {
        keepGoing = false;
      }
    } catch (e) {
      if (e.response && e.response.status === 429) {
        // HubSpot API rate limit error status
        console.log('Rate limit reached. Sleeping for 10 seconds...');
        await sleep(10000); // wait for 10 seconds
        continue; // retry this iteration
      } else {
        console.error('Error Unable to retrieve contacts');
        keepGoing = false;
      }
    }
  }

  return allContacts;
};

// Fetch deals function with rate limit and error handling
const fetchDeals = async (accessToken) => {
  let after = '';

  let allDeals = [];

  let keepGoing = true;

  while (keepGoing) {
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      let url = 'https://api.hubapi.com/crm/v3/objects/deals?limit=100';

      if (after) {
        url += `&after=${after}`;
      }

      const { data } = await axios.get(url, { headers });

      allDeals = [...allDeals, ...data.results];

      if (data.paging) {
        after = data.paging.next.after;
      } else {
        keepGoing = false;
      }
    } catch (e) {
      if (e.response && e.response.status === 429) {
        // HubSpot API rate limit error status
        console.log('Rate limit reached. Sleeping for 10 seconds...');
        await sleep(10000); // wait for 10 seconds
        continue; // retry this iteration
      } else {
        console.error('Error Unable to retrieve deals');
        keepGoing = false;
      }
    }
  }

  console.log('All deals: ', allDeals);

  return allDeals;
};

// fetchDeals(ACCESS_TOKEN);

// Function to associate objects with rate limit and error handling
async function associateObjects(
  fromObjectType,
  fromObjectId,
  toObjectType,
  toObjectId,
  accessToken
) {
  const apiUrl = `https://api.hubapi.com/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/default/${toObjectType}/${toObjectId}`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios.put(apiUrl, {}, { headers });
    console.log('Association created successfully:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 429) {
      // HubSpot API rate limit error status
      console.log('Rate limit reached. Sleeping for 10 seconds...');
      await sleep(10000); // wait for 10 seconds
      return associateObjects(fromObjectType, fromObjectId, toObjectType, toObjectId, accessToken); // retry
    } else {
      console.error('Error associating objects:', error);
    }
  }
}

// Main function with rate limit and error handling
async function findAndAssociateMatchingContactsAndDeals(accessToken) {
  // Fetch all contacts and deals
  const contacts = await fetchContacts(accessToken);
  const deals = await fetchDeals(accessToken);

  // For each deal, find matching contacts and create associations
  for (const deal of deals) {
    for (const contact of contacts) {
      if (contact.properties.firstname === deal.properties.dealname) {
        try {
          await associateObjects('deals', deal.id, 'contacts', contact.id, accessToken);
        } catch (error) {
          console.error(
            `Error occurred while associating deal ${deal.id} with contact ${contact.id}:`,
            error
          );
          continue; // skip this iteration and continue with the next one
        }
      }
    }
  }
}
// Usage
findAndAssociateMatchingContactsAndDeals(ACCESS_TOKEN);
