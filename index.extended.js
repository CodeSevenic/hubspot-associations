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

  // console.log('All deals: ', allDeals);

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

async function fetchExistingAssociations(dealId, accessToken) {
  // console.log(`Fetching existing associations for deal ${dealId}...`);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const url = `https://api.hubapi.com/crm/v4/associations/deals/contacts/batch/read`;

  let associatedContactIds = [];
  let after;

  do {
    try {
      const payload = {
        inputs: [
          {
            id: dealId,
          },
        ],
      };

      if (after) {
        payload.inputs[0].after = after;
      }

      const { data } = await axios.post(url, payload, { headers });

      if (data && data.results && data.results.length) {
        associatedContactIds = [
          ...associatedContactIds,
          ...data.results[0].to.map((association) => association.toObjectId),
        ];
      }

      // Check existence of properties one step at a time to prevent any "Cannot read properties of undefined" errors
      after =
        data &&
        data.results &&
        data.results[0] &&
        data.results[0].paging &&
        data.results[0].paging.next &&
        data.results[0].paging.next.after;
    } catch (error) {
      console.error(`Error fetching associations for deal ${dealId}:`, error);
      console.log('Associated contact IDs: ', associatedContactIds);
      return associatedContactIds; // Return whatever data has been retrieved so far in case of an error
    }
  } while (after);

  console.log('Associated contact IDs: ', associatedContactIds);

  return associatedContactIds;
}

// Main function with rate limit and error handling
async function findAndAssociateMatchingContactsAndDeals(accessToken) {
  // Fetch all contacts and deals
  const contacts = await fetchContacts(accessToken);
  const deals = await fetchDeals(accessToken);

  // For each deal, find matching contacts and create associations
  for (const deal of deals) {
    // Fetch existing associations for the deal
    const associatedContactIds = await fetchExistingAssociations(deal.id, accessToken);

    for (const contact of contacts) {
      if (contact.properties.firstname === deal.properties.dealname) {
        // Check if the contact is already associated with the deal
        if (associatedContactIds[0] == contact.id) {
          console.log(
            `Contact ${contact.id} is already associated with deal ${deal.id}. Skipping...`
          );
          continue;
        }
        // try {
        //   await associateObjects('deals', deal.id, 'contacts', contact.id, accessToken);
        // } catch (error) {
        //   console.error(
        //     `Error occurred while associating deal ${deal.id} with contact ${contact.id}:`,
        //     error
        //   );
        //   continue; // skip this iteration and continue with the next one
        // }
      }
    }
  }
}

// Usage
findAndAssociateMatchingContactsAndDeals(ACCESS_TOKEN);
