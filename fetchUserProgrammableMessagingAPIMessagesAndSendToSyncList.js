const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

const phoneNumber = 'CUSTOMER_PHONE_NUMBER';
const SYNC_SERVICE_SID = 'SYNC_SERVICE_SID';  // Replace with your Sync Service SID

async function fetchConversations() {
    let conversations = [];

    await client.conversations.v1.participantConversations
      .each({address: phoneNumber}, async (p) => {
        const messagesData = await client.conversations.v1.conversations(p.conversationSid).messages.list();

        const messages = messagesData.map(message => {
          return {
            author: message.author,
            body: message.body
          };
        });

        let conversation = {
          SID: p.conversationSid,
          dateCreated: new Date(p.conversationDateCreated).toISOString(),
          lastUpdated: new Date(p.conversationDateUpdated).toISOString(),
          messages: messages
        };

        conversations.push(conversation);
    });

    // Order the conversations by last update date
    conversations.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    
    return conversations;
}

async function createSyncList(conversations) {
    const listName = `ConversationsList_${phoneNumber}`;  // Name of the list (you can choose any name. It's a good idea to tie it to the identity)
    
    let syncList;
    try {
        syncList = await client.sync.services(SYNC_SERVICE_SID)
            .syncLists(listName)
            .fetch();
    } catch(err) {
        if (err.status === 404) {  // List does not exist, so create it
            syncList = await client.sync.services(SYNC_SERVICE_SID)
                .syncLists
                .create({uniqueName: listName});
        } else {
            throw err;
        }
    }
    
    // Add each conversation as an item in the Sync List
    for (let conversation of conversations) {
        try {
            await client.sync.services(SYNC_SERVICE_SID)
                .syncLists(syncList.sid)
                .syncListItems
                .create({data: conversation});
        } catch (err) {
            console.error('Failed to add item to Sync List:', err);
            console.log('Data causing the issue:', JSON.stringify(conversation, null, 2));
        }
    }

    console.log(`Sync List ${listName} updated successfully!`);
}

fetchConversations()
    .then(data => {
        return createSyncList(data);
    })
    .catch(error => {
        console.error('Error:', error);
    });
