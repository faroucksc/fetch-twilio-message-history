const accountSid = process.env.TWILIO_ACCOUNT_SID_Flexowly2;
const authToken = process.env.TWILIO_AUTH_TOKEN_Flexowly2;
const client = require('twilio')(accountSid, authToken);

const SYNC_SERVICE_SID = 'IS74eaf011a1e7a1144c0867b6419ef4bc';  // Replace with your Sync Service SID

const listName = 'ConversationsList';  // Name of the list you created

client.sync.services(SYNC_SERVICE_SID)
    .syncLists(listName)
    .syncListItems
    .each(syncListItem => {
        console.log(`Item Index: ${syncListItem.index}`);
        console.log(`Data: ${JSON.stringify(syncListItem.data, null, 2)}`);
        console.log('-------------------------');
    });
